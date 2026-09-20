"""Integration tests for the SentryFL Python backend API."""

import asyncio

from fastapi.testclient import TestClient

from sentryfl.api.app import create_app
from sentryfl.api.runner import ExperimentRunner
from sentryfl.api.schemas import ExperimentConfig


class FakeTrainer:
    def __init__(self, config, on_round_metrics, stop_event):
        self.on_round_metrics = on_round_metrics
        self.stop_event = stop_event

    def setup(self):
        pass

    def train(self):
        for round_number in range(1, 4):
            if self.stop_event.is_set():
                return
            self.on_round_metrics(round_number, {
                "training": [{"round": round_number, "loss": 1.0 / round_number,
                              "accuracy": 0.5}],
            })


def runner_factory(experiment_id, config):
    return ExperimentRunner(experiment_id, config, trainer_factory=FakeTrainer)


def test_train_status_and_metrics_endpoints():
    client = TestClient(create_app(runner_factory))
    response = client.post("/train", json={"num_rounds": 3})
    assert response.status_code == 202
    experiment_id = response.json()["experiment_id"]

    status = client.get(f"/train/{experiment_id}/status")
    assert status.status_code == 200
    assert status.json()["status"] == "completed"

    metrics = client.get(f"/train/{experiment_id}/metrics?start_round=2")
    assert metrics.status_code == 200
    body = metrics.json()
    assert body["total"] == 2
    assert [item["round_number"] for item in body["metrics"]] == [2, 3]


def test_list_experiments_endpoint():
    client = TestClient(create_app(runner_factory))
    client.post("/train", json={"num_rounds": 3})
    client.post("/train", json={"num_rounds": 3})

    listing = client.get("/train")
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 2
    assert len(body["experiments"]) == 2


def test_per_category_metrics_endpoint():
    client = TestClient(create_app(runner_factory))
    experiment_id = client.post("/train", json={"num_rounds": 3}).json()["experiment_id"]

    training = client.get(f"/train/{experiment_id}/metrics/training")
    assert training.status_code == 200
    body = training.json()
    assert body["total"] == 3
    assert all(item["metric_type"] == "training" for item in body["metrics"])

    bad = client.get(f"/train/{experiment_id}/metrics/nonsense")
    assert bad.status_code == 400


def test_report_endpoint():
    client = TestClient(create_app(runner_factory))
    experiment_id = client.post("/train", json={"num_rounds": 3}).json()["experiment_id"]

    report = client.get(f"/train/{experiment_id}/report")
    assert report.status_code == 200
    body = report.json()
    assert body["experiment_id"] == experiment_id
    assert body["rounds_recorded"] == 3
    assert body["total_rounds"] == 3


def test_pause_and_resume_endpoints():
    client = TestClient(create_app(runner_factory))
    experiment_id = client.post("/train", json={"num_rounds": 3}).json()["experiment_id"]

    # FakeTrainer finishes synchronously, so by now it is completed; pause/resume
    # should still respond with a valid status and not error.
    pause = client.post(f"/train/{experiment_id}/pause")
    assert pause.status_code == 200
    resume = client.post(f"/train/{experiment_id}/resume")
    assert resume.status_code == 200
    assert resume.json()["status"] in {"pending", "running", "paused", "completed", "stopped"}


def test_stop_endpoint_requests_graceful_stop():
    client = TestClient(create_app(runner_factory))
    response = client.post("/api/train", json={"num_rounds": 3})
    experiment_id = response.json()["experiment_id"]

    stop = client.delete(f"/api/train/{experiment_id}")
    assert stop.status_code == 200
    assert stop.json()["status"] in {"pending", "running", "stopped", "completed"}


def test_health_and_missing_experiment():
    client = TestClient(create_app(runner_factory))
    assert client.get("/health").json()["status"] == "healthy"
    assert client.get("/train/missing/status").status_code == 404


def test_metric_callback_is_invoked(monkeypatch):
    sent = []

    async def fake_push(self, metric):
        sent.append(metric)

    monkeypatch.setattr(ExperimentRunner, "_push_metrics", fake_push)
    runner = ExperimentRunner(
        "experiment-1",
        ExperimentConfig(callback_url="http://api-server/internal/metrics"),
        trainer_factory=FakeTrainer,
    )
    runner._run()

    assert len(sent) == 3
    assert sent[0]["experiment_id"] == "experiment-1"
