#!/usr/bin/env python3
"""Inspect only this test project's runtime boundaries. Never print env values."""
import json
import subprocess

compose = ["docker", "compose", "--project-name", "summergear-foundation-test",
           "-f", "ops/nhn-rocky/compose.foundation-test.yml"]
expected = {"api": "DATABASE_URL", "worker": "RIVER_DATABASE_URL"}
dsn_keys = {"DATABASE_URL", "RIVER_DATABASE_URL", "MIGRATION_DATABASE_URL"}
for service, own_key in expected.items():
    container_id = subprocess.check_output(compose + ["ps", "-q", service], text=True).strip()
    if not container_id:
        raise SystemExit(f"FAIL: {service} container missing")
    info = json.loads(subprocess.check_output(["docker", "inspect", container_id]))[0]
    keys = {item.split("=", 1)[0] for item in info["Config"]["Env"]}
    if keys.intersection(dsn_keys) != {own_key}:
        raise SystemExit(f"FAIL: {service} credential-role isolation")
    if info["HostConfig"].get("PortBindings"):
        raise SystemExit(f"FAIL: {service} publishes a host port")
    if set(info["NetworkSettings"]["Networks"]) != {"summergear-foundation-test_default"}:
        raise SystemExit(f"FAIL: {service} network isolation")
    if not info["State"]["Running"]:
        raise SystemExit(f"FAIL: {service} is not running")
print("PASS: API/worker each receive only their own DB credential; no host ports or shared networks")
