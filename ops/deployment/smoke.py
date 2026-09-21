"""Keyless, disposable application smoke. Never reads server env files."""
import json
import pathlib
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
PROJECT = "summergear-smoke-" + uuid.uuid4().hex[:12]
BASE = ["docker", "compose", "-p", PROJECT, "-f", "ops/deployment/compose.ci.yml"]
# Fail before creating resources if the daemon is unavailable.
subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
               check=True, timeout=15, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def run(*args, capture=False, check=True, timeout=150):
    return subprocess.run([*BASE, *args], cwd=ROOT, check=check, text=True, timeout=timeout,
                          stdout=subprocess.PIPE if capture else None)

def node(script):
    run("exec", "-T", "web", "node", "-e", script)

try:
    # The normal images must reject missing config and production selection.
    for service in ("api", "worker", "migration"):
        image = "summergear-" + service + ":deployment-ci"
        for env in ([], ["-e", "APP_ENV=production"]):
            result = subprocess.run(["docker", "run", "--rm", *env, image, "--check-config"],
                                    text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            assert result.returncode == 1 and "APP_ENV must be test" in result.stdout, service
    run("config", "--quiet")
    run("up", "-d", "--wait", "--wait-timeout", "120")
    node("""
(async()=>{
 for (const path of ['/', '/health/live', '/health/ready']) {
   const r=await fetch('http://gateway:8080'+path);
   if(!r.ok) throw Error(path+' '+r.status);
 }
 const r=await fetch('http://gateway:8080/api/v1/auth/providers');
 const body=await r.json();
 if(r.status!==200 || body.providers.length!==2 || body.providers.some(p=>p.enabled))
   throw Error('keyless provider/proxy contract failed');
 const denied=await fetch('http://gateway:8080/api/v1/auth/logout',{method:'POST',headers:{Origin:'https://evil.invalid'}});
 if(denied.status!==403 || (await denied.json()).code!=='ORIGIN_INVALID') throw Error('origin rejection contract failed');
 const login=await fetch('http://gateway:8080/api/v1/auth/dev-login',{method:'POST',headers:{Origin:'https://app.example.invalid'}});
 const session=await login.json();
 const cookie=login.headers.get('set-cookie') || '';
 if(!login.ok || !session.csrfToken || !cookie.includes('__Host-sg_session=') || !/secure/i.test(cookie) || !/httponly/i.test(cookie))
   throw Error('temporary login/secure cookie proxy contract failed');
 const logout=await fetch('http://gateway:8080/api/v1/auth/logout',{method:'POST',headers:{Origin:'https://app.example.invalid',Cookie:cookie.split(';')[0],'X-CSRF-Token':session.csrfToken}});
 if(logout.status!==204) throw Error('session/CSRF proxy contract failed');
})().catch(e=>{console.error(e);process.exit(1)});
""")
    # Check role credential separation and immutable/non-root runtime configuration.
    for service in ("api", "worker", "web", "migration"):
        cid = run("ps", "-a", "-q", service, capture=True).stdout.strip()
        data = json.loads(subprocess.check_output(["docker", "inspect", cid], text=True))[0]
        assert data["Config"]["User"] not in ("", "0", "root"), service
        assert data["HostConfig"]["ReadonlyRootfs"], service
        keys = {v.split("=", 1)[0] for v in data["Config"]["Env"]}
        allowed = {"api": {"DATABASE_URL"}, "worker": {"RIVER_DATABASE_URL"},
                   "migration": {"MIGRATION_DATABASE_URL"}, "web": set()}[service]
        assert keys & {"DATABASE_URL", "RIVER_DATABASE_URL", "MIGRATION_DATABASE_URL"} == allowed
        if service != "api":
            assert "SUPABASE_SERVICE_ROLE_KEY" not in keys
    run("stop", "api")
    node("fetch('http://gateway:8080/health/ready').then(r=>{if(r.ok)process.exit(1)}).catch(()=>process.exit(1))")
    run("start", "--wait", "api")
    # Recreate rather than only restart: Nginx must resolve replacement containers.
    run("up", "-d", "--no-deps", "--force-recreate", "--wait", "api", "web")
    node("""
(async()=>{
 for(let attempt=0;attempt<15;attempt++) {
   const statuses=await Promise.all(['/', '/health/ready'].map(p=>fetch('http://gateway:8080'+p).then(r=>r.ok)));
   if(statuses.every(Boolean)) return;
   await new Promise(r=>setTimeout(r,1000));
 }
 throw Error('proxy did not recover after container replacement');
})().catch(e=>{console.error(e);process.exit(1)});
""")
    run("stop", "api", "worker")
    for service in ("api", "worker"):
        cid = run("ps", "-a", "-q", service, capture=True).stdout.strip()
        data = json.loads(subprocess.check_output(["docker", "inspect", cid], text=True))[0]
        assert data["State"]["ExitCode"] == 0, service + " did not gracefully stop"
    print("PASS: proxy, keyless providers, temporary login/CSRF, origin rejection, readiness failure, container replacement, non-root/role isolation, SIGTERM")
except Exception:
    run("logs", "--no-color", "--tail", "80", check=False, timeout=20)
    raise
finally:
    run("down", "--volumes", "--remove-orphans", timeout=30)
