"""Run the complete DB suite against resources owned only by this invocation."""
import pathlib
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = ["docker", "compose", "-p", "summergear-db-" + uuid.uuid4().hex[:12],
        "-f", "ops/deployment/compose.ci.yml"]


def run(*args, check=True, timeout=900):
    return subprocess.run([*BASE, *args], cwd=ROOT, check=check, timeout=timeout)


try:
    run("up", "-d", "--wait", "postgres", timeout=120)
    run("run", "--rm", "checks")
except Exception:
    run("logs", "--tail", "80", check=False, timeout=20)
    raise
finally:
    run("--profile", "checks", "down", "--volumes", "--remove-orphans", timeout=60)
