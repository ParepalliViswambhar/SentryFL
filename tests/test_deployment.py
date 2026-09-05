"""Validation tests for the Docker Compose deployment."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "docker-compose.yml"


def compose_config():
    """Return the resolved Compose model using a test-only JWT secret."""
    if shutil.which("docker") is None:
        pytest.skip("Docker is not installed")

    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "config", "--format", "json"],
        cwd=ROOT,
        env={**os.environ, "JWT_SECRET": "deployment-test-secret"},
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def test_compose_defines_all_services_and_health_checks():
    config = compose_config()
    services = config["services"]

    assert set(services) == {
        "python-backend",
        "api-server",
        "dashboard",
        "postgres",
        "redis",
        "nginx",
    }
    assert all("healthcheck" in service for service in services.values())
    assert config["networks"]["sentryfl"]["driver"] == "bridge"
    assert {volume for volume in config["volumes"]} == {
        "postgres-data",
        "redis-data",
        "nginx-certs",
    }


def test_compose_wires_internal_services_and_gateway_routes():
    config = compose_config()
    services = config["services"]

    assert services["api-server"]["environment"]["PYTHON_BACKEND_URL"] == (
        "http://python-backend:5000"
    )
    assert services["python-backend"]["environment"]["REDIS_URL"] == (
        "redis://redis:6379/0"
    )
    assert services["nginx"]["ports"] == [
        {"mode": "ingress", "target": 80, "published": "80", "protocol": "tcp"},
        {"mode": "ingress", "target": 443, "published": "443", "protocol": "tcp"},
    ]


@pytest.mark.skipif(
    os.environ.get("RUN_DOCKER_DEPLOYMENT_TESTS") != "1",
    reason="Set RUN_DOCKER_DEPLOYMENT_TESTS=1 to run the full Compose stack",
)
def test_compose_stack_starts_and_services_are_healthy():
    environment = {**os.environ, "JWT_SECRET": "deployment-test-secret"}
    project = "sentryfl-deployment-test"
    command = ["docker", "compose", "-p", project, "-f", str(COMPOSE_FILE)]

    try:
        subprocess.run(
            [*command, "up", "--build", "--wait", "--wait-timeout", "180"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        gateway = subprocess.run(
            ["docker", "compose", "-p", project, "exec", "-T", "nginx", "wget", "-qO-", "http://localhost/health"],
            cwd=ROOT,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
        assert '"status":"healthy"' in gateway.stdout

        backend_health = subprocess.run(
            ["docker", "compose", "-p", project, "exec", "-T", "api-server", "node", "-e",
             "fetch('http://python-backend:5000/health').then(r => { if (!r.ok) process.exit(1); })"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        assert backend_health.returncode == 0

        redis_health = subprocess.run(
            ["docker", "compose", "-p", project, "exec", "-T", "python-backend", "python", "-c",
             "import socket; s=socket.create_connection(('redis', 6379), 3); s.close()"],
            cwd=ROOT,
            env=environment,
            check=True,
        )
        assert redis_health.returncode == 0
    finally:
        subprocess.run(
            [*command, "down", "-v", "--remove-orphans"],
            cwd=ROOT,
            env=environment,
            check=False,
        )