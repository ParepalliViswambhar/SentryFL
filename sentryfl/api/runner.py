"""Concurrent experiment lifecycle and metric streaming management."""

import asyncio
import threading
import time
from copy import deepcopy
from typing import Any, Callable, Dict, List, Optional

import httpx
import torch

from sentryfl.models.plm_backbone import PLMAnomalyDetector
from sentryfl.trainer import MainTrainer
from sentryfl.utils.config import ConfigurationSystem

from .schemas import ExperimentConfig, ExperimentStatus


class ExperimentRunner:
    """Runs one training experiment in a worker thread."""

    def __init__(self, experiment_id: str, config: ExperimentConfig,
                 trainer_factory: Optional[Callable[..., MainTrainer]] = None):
        self.experiment_id = experiment_id
        self.config = config
        self.trainer_factory = trainer_factory or build_trainer
        self.status = "pending"
        self.current_round = 0
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.error: Optional[str] = None
        self.metrics_history: List[Dict[str, Any]] = []
        self.stop_event = threading.Event()
        # pause_event is SET when the experiment may proceed and CLEARED to
        # pause it. The worker thread blocks on it at each round boundary.
        self.pause_event = threading.Event()
        self.pause_event.set()
        self._task: Optional[asyncio.Task] = None
        self._lock = threading.Lock()

    async def start(self) -> None:
        self._task = asyncio.create_task(asyncio.to_thread(self._run))
        await asyncio.sleep(0)

    def _run(self) -> None:
        self.status = "running"
        self.start_time = time.time()
        try:
            trainer = self.trainer_factory(
                self.config,
                on_round_metrics=self._on_round_metrics,
                stop_event=self.stop_event,
            )
            trainer.setup()
            trainer.train()
            self.status = "stopped" if self.stop_event.is_set() else "completed"
        except Exception as exc:
            self.status = "failed"
            self.error = str(exc)
        finally:
            self.end_time = time.time()

    def _on_round_metrics(self, round_number: int, metrics: Dict[str, Any]) -> None:
        # Block here while paused so training halts at a round boundary without
        # losing state. Wake up promptly if a stop is requested.
        while not self.pause_event.is_set() and not self.stop_event.is_set():
            self.status = "paused"
            self.pause_event.wait(timeout=0.5)
        if self.stop_event.is_set():
            return
        if self.status == "paused":
            self.status = "running"
        with self._lock:
            self.current_round = round_number
            snapshot = deepcopy(metrics)
            entry = {
                "experiment_id": self.experiment_id,
                "round_number": round_number,
                "timestamp": time.time(),
                "global_loss": _latest(snapshot.get("training"), "loss"),
                "global_accuracy": _latest(snapshot.get("training"), "accuracy"),
                "metrics": snapshot,
            }
            self.metrics_history.append(entry)
        if self.config.callback_url:
            asyncio.run(self._push_metrics(entry))

    async def _push_metrics(self, metric: Dict[str, Any]) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                training = metric.get("metrics", {}).get("training", [])
                training_data = training[-1] if training else {}
                response = await client.post(
                    str(self.config.callback_url),
                    json={
                        "experimentId": self.experiment_id,
                        "experiment_id": self.experiment_id,
                        "metricType": "training_round_complete",
                        "data": {
                            "round": metric["round_number"],
                            "loss": metric.get("global_loss"),
                            "accuracy": metric.get("global_accuracy"),
                            **training_data,
                        },
                        "timestamp": metric["timestamp"],
                    },
                )
                response.raise_for_status()
        except (httpx.HTTPError, OSError):
            return

    async def stop(self) -> None:
        self.stop_event.set()
        # Ensure a paused worker wakes up to observe the stop request.
        self.pause_event.set()
        if self._task and self.status in {"pending", "running", "paused"}:
            await asyncio.sleep(0)

    async def pause(self) -> None:
        """Request the experiment pause at the next round boundary."""
        if self.status in {"pending", "running"}:
            self.pause_event.clear()
        await asyncio.sleep(0)

    async def resume(self) -> None:
        """Resume a paused experiment."""
        if self.status == "paused":
            self.status = "running"
        self.pause_event.set()
        await asyncio.sleep(0)

    def get_status(self) -> ExperimentStatus:
        return ExperimentStatus(
            experiment_id=self.experiment_id,
            status=self.status,
            current_round=self.current_round,
            total_rounds=self.config.num_rounds,
            start_time=self.start_time,
            end_time=self.end_time,
            error=self.error,
        )

    def get_metrics(self, start_round: Optional[int] = None,
                    end_round: Optional[int] = None,
                    category: Optional[str] = None,
                    limit: Optional[int] = None,
                    offset: int = 0) -> Dict[str, Any]:
        """Return a paginated metrics envelope.

        Shape: {"metrics": [...], "total": int, "limit": int|None, "offset": int}.
        When ``category`` is given (training/privacy/communication/evaluation),
        each entry is reduced to that category's records plus round metadata.
        """
        with self._lock:
            metrics = list(self.metrics_history)
        if start_round is not None:
            metrics = [item for item in metrics if item["round_number"] >= start_round]
        if end_round is not None:
            metrics = [item for item in metrics if item["round_number"] <= end_round]

        if category is not None:
            metrics = [self._project_category(item, category) for item in metrics]

        total = len(metrics)
        if offset:
            metrics = metrics[offset:]
        if limit is not None:
            metrics = metrics[:limit]

        return {"metrics": metrics, "total": total, "limit": limit, "offset": offset}

    @staticmethod
    def _project_category(entry: Dict[str, Any], category: str) -> Dict[str, Any]:
        """Reduce a metrics entry to a single category's records."""
        category_data = entry.get("metrics", {}).get(category, [])
        return {
            "experiment_id": entry.get("experiment_id"),
            "round_number": entry.get("round_number"),
            "timestamp": entry.get("timestamp"),
            "metric_type": category,
            "data": category_data,
        }

    def get_report(self) -> Dict[str, Any]:
        """Return a JSON summary report of the experiment.

        The dashboard renders PDF/CSV client-side; this provides the structured
        summary those exporters (and the Node /report proxy) consume.
        """
        status = self.get_status()
        with self._lock:
            history = list(self.metrics_history)
        latest = history[-1] if history else {}
        duration = None
        if self.start_time is not None:
            end = self.end_time if self.end_time is not None else time.time()
            duration = end - self.start_time
        return {
            "experiment_id": self.experiment_id,
            "status": status.status,
            "current_round": status.current_round,
            "total_rounds": status.total_rounds,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_seconds": duration,
            "error": self.error,
            "final_loss": latest.get("global_loss"),
            "final_accuracy": latest.get("global_accuracy"),
            "rounds_recorded": len(history),
            "config": self.config.model_dump() if hasattr(self.config, "model_dump") else {},
        }


def _latest(metrics: Optional[List[Dict[str, Any]]], key: str) -> Optional[Any]:
    return metrics[-1].get(key) if metrics else None


def build_trainer(config: ExperimentConfig, **hooks: Any) -> MainTrainer:
    resolved = ConfigurationSystem.from_dict(config.to_training_config())
    model_config = resolved.get_section("model")
    input_dim = 38 if config.dataset == "SMD" else 41
    model = PLMAnomalyDetector(
        input_dim=input_dim,
        hidden_dim=model_config["hidden_dim"],
        model_name=model_config["backbone"],
        freeze_backbone=model_config["freeze_backbone"],
        dropout=model_config.get("dropout", 0.1),
    )
    return MainTrainer(
        config=resolved,
        model=model,
        data_path=config.data_path,
        device=config.device or ("cuda" if torch.cuda.is_available() else "cpu"),
        **hooks,
    )
