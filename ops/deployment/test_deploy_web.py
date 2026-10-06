"""Exercise deployment and rollback with a fake Docker CLI, never a live service."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("deploy-web.sh").resolve()
SSH_SCRIPT = Path(__file__).with_name("deploy-web-ssh.sh").resolve()
OLD = "sha256:" + "1" * 64
NEW = "sha256:" + "2" * 64
IMAGE = "ghcr.io/lulupang2/social_commerce/web@" + NEW
DOCKER = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
a = sys.argv[1:]
root = pathlib.Path(os.environ['FAKE_STATE'])
with (root / 'calls').open('a') as f: f.write(json.dumps(a) + '\n')
if a[:1] == ['--config']: a = a[2:]
mode = os.environ.get('FAKE_MODE', '')
if a[0] == 'login':
    assert sys.stdin.read() == 'fixture-token'
elif a[0] == 'pull':
    if mode == 'pull-fails': sys.exit(1)
elif a[0] == 'ps':
    print('web-id' if a[-1].endswith('=web') else 'gateway-id')
elif a[0] == 'inspect':
    if '.Image' in a[2]: print((root / 'active').read_text())
    else:
        files = os.environ['BASE_FILES']
        suffix = ',/unexpected/overlay.yml' if mode == 'wrong-config' else ''
        if mode == 'redeploy': suffix = ',' + str(root / '.local/state/summergear/web-deploy/compose.web.yml')
        print(files + suffix)
elif a[:2] == ['image', 'inspect']: print('sha256:' + '2' * 64)
elif a[0] == 'tag': pass
elif a[0] == 'compose':
    if 'config' in a:
        if mode == 'config-fails': sys.exit(1)
    else:
        assert a[-1] == 'web' and '--no-deps' in a and '--pull' in a
        rollback = 'rollback-' in os.environ['WEB_IMAGE']
        (root / 'active').write_text('sha256:' + ('1' if rollback else '2') * 64)
        if mode == 'rollback-fails' or (mode == 'up-fails' and not rollback): sys.exit(1)
elif a[0] == 'exec':
    if mode == 'gateway-fails' and 'wget' in a and (root / 'active').read_text() == 'sha256:' + '2' * 64: sys.exit(1)
else: raise AssertionError(a)
'''


class DeployWebTest(unittest.TestCase):
    def run_deploy(self, mode="", image=IMAGE):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            config = root / '.config/summergear'
            config.mkdir(parents=True)
            deploy = root / 'checkout/ops/deployment'
            deploy.mkdir(parents=True)
            for filename in ['compose.ci.yml', 'compose.preview.yml']:
                (deploy / filename).touch()
            env_file = config / 'web-deploy.env'
            env_file.write_text(f'DEPLOY_DIR={root}/checkout\nPUBLIC_WEB_URL=https://preview.example.invalid\n')
            env_file.chmod(0o600)
            (root / 'active').write_text(OLD)
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            (bin_dir / 'docker').write_text(DOCKER)
            (bin_dir / 'docker').chmod(0o755)
            (bin_dir / 'sleep').write_text('#!/bin/sh\nexit 0\n')
            (bin_dir / 'sleep').chmod(0o755)
            env = dict(os.environ, HOME=str(root), GHCR_TOKEN='fixture-token',
                       FAKE_STATE=str(root), FAKE_MODE=mode,
                       BASE_FILES=f'{deploy}/compose.ci.yml,{deploy}/compose.preview.yml',
                       PATH=f'{bin_dir}:{os.environ["PATH"]}')
            result = subprocess.run(['bash', str(SCRIPT), image, 'fixture-user'],
                                    env=env, capture_output=True, text=True)
            calls = [json.loads(line) for line in (root / 'calls').read_text().splitlines()] if (root / 'calls').exists() else []
            state = root / '.local/state/summergear/web-deploy'
            current = (state / 'current-image.env').read_text() if (state / 'current-image.env').exists() else ''
            active = (root / 'active').read_text()
            self.assertNotIn('fixture-token', result.stdout + result.stderr + json.dumps(calls))
            for call in calls:
                if '--config' in call:
                    self.assertFalse(Path(call[1]).exists(), 'Registry credentials must be removed')
            return result, calls, current, active

    def test_success(self):
        result, calls, current, active = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(active, NEW)
        self.assertEqual(current, f'WEB_IMAGE={IMAGE}\n')
        self.assertEqual(len([c for c in calls if 'up' in c]), 1)

    def test_unhealthy_web_restores_previous_image_and_reports_failure(self):
        result, calls, current, active = self.run_deploy('up-fails')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(active, OLD)
        self.assertIn('rollback-', current)
        self.assertIn('Previous web image restored.', result.stderr)
        self.assertEqual(len([c for c in calls if 'up' in c]), 2)

    def test_subsequent_deployment_accepts_its_own_overlay(self):
        result, _, _, active = self.run_deploy('redeploy')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(active, NEW)

    def test_gateway_failure_also_rolls_back(self):
        result, _, current, active = self.run_deploy('gateway-fails')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(active, OLD)
        self.assertIn('rollback-', current)

    def test_rollback_failure_is_explicit(self):
        result, _, current, _ = self.run_deploy('rollback-fails')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ROLLBACK FAILED', result.stderr)
        self.assertEqual(current, '')

    def test_preflight_failures_do_not_replace_containers(self):
        for mode in ['pull-fails', 'config-fails', 'wrong-config']:
            with self.subTest(mode=mode):
                result, calls, current, active = self.run_deploy(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any('up' in c for c in calls))
                self.assertEqual(active, OLD)
                self.assertEqual(current, '')

    def test_mutable_image_is_rejected(self):
        result, calls, _, _ = self.run_deploy(image='ghcr.io/example/web:latest')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(calls, [])


class DeploySshTest(unittest.TestCase):
    def test_verified_ssh_stdin_credentials_cleanup_and_stale_commit_guard(self):
        for stale in [False, True]:
            with self.subTest(stale=stale), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                gh = root / 'gh'
                gh.write_text('#!/bin/sh\nprintf "%s\\n" "$CURRENT_SHA"\n')
                gh.chmod(0o755)
                ssh = root / 'ssh'
                ssh.write_text('''#!/usr/bin/env python3
import os, pathlib, stat, sys
a = sys.argv[1:]
assert 'StrictHostKeyChecking=yes' in a and 'IdentitiesOnly=yes' in a
key = pathlib.Path(a[a.index('-i') + 1])
assert key.read_bytes() == b'fixture-private-key\\n'
assert stat.S_IMODE(key.stat().st_mode) == 0o600
data = sys.stdin.read()
assert data.startswith('fixture-token\\n#!/usr/bin/env bash\\n')
assert 'fixture-token' not in ' '.join(a)
pathlib.Path(os.environ['SSH_RECORD']).write_text(str(key.parent))
''')
                ssh.chmod(0o755)
                summary = root / 'summary'
                record = root / 'ssh-record'
                env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}',
                           DEPLOY_HOST='preview.example.invalid', DEPLOY_USER='rocky', DEPLOY_PORT='22',
                           DEPLOY_SSH_KEY='fixture-private-key\r', DEPLOY_KNOWN_HOSTS='fixture-host-key',
                           GH_TOKEN='fixture-token', GHCR_USER='fixture-user', WEB_IMAGE=IMAGE,
                           SOURCE_SHA='a' * 40, CURRENT_SHA=('b' if stale else 'a') * 40,
                           REPOSITORY='fixture/repository', GITHUB_STEP_SUMMARY=str(summary),
                           SSH_RECORD=str(record))
                result = subprocess.run(['bash', str(SSH_SCRIPT)], cwd=SCRIPT.parents[2],
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertNotIn('fixture-token', result.stdout + result.stderr + summary.read_text())
                self.assertEqual(record.exists(), not stale)
                if record.exists():
                    self.assertFalse(Path(record.read_text()).exists())


if __name__ == '__main__':
    unittest.main()
