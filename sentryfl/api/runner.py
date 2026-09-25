"""Concurrent experiment lifecycle and metric streaming management."""

import asyncio
import logging
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

logger = logging.getLogger(__name__)

# How often a running experiment emits a liveness heartbeat. This is what keeps
# the dashboard visibly "alive" during the (potentially slow) setup phase and
# between rounds, so a run never looks dead while it is actually working.
HEARTBEAT_INTERVAL_SECONDS = 5.0

# Statuses past which no further liveness is expected — the heartbeat loop exits
# when the run reaches any of these.
_TERMINAL_STATUSES = frozenset({"completed", "failed", "stopped"})


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
        # Liveness heartbeat: a daemon thread emits a periodic `heartbeat` event
        # while the run is active so the dashboard can prove work is happening
        # even before the first round lands. Overridable per-instance for tests.
        self.heartbeat_interval = HEARTBEAT_INTERVAL_SECONDS
        self._heartbeat_stop: Optional[threading.Event] = None
        self._heartbeat_thread: Optional[threading.Thread] = None

    async def start(self) -> None:
        self._task = asyncio.create_task(asyncio.to_thread(self._run))
        await asyncio.sleep(0)

    def _run(self) -> None:
        self.start_time = time.time()
        # Announce 'running' immediately — BEFORE the (slow) setup — so the
        # dashboard leaves the "queued" state and shows an initializing run the
        # moment training spins up, not only after the first round lands.
        self._set_status("running", "Setting up model & data", previous="pending")
        # Begin liveness heartbeats now so the setup phase (model + data load,
        # which can take a while) is visibly alive rather than looking dead.
        self._start_heartbeat()
        try:
            trainer = self.trainer_factory(
                self.config,
                on_round_metrics=self._on_round_metrics,
                stop_event=self.stop_event,
            )
            trainer.setup()
            trainer.train()
            if self.stop_event.is_set():
                self._set_status("stopped", "Experiment stopped", previous="running")
            else:
                self._set_status("completed", "Training complete", previous="running")
        except Exception as exc:
            self.error = str(exc)
            self._set_status("failed", str(exc), previous="running")
            self._emit("error", {"message": str(exc), "round": self.current_round})
        finally:
            self._stop_heartbeat()
            self.end_time = time.time()

    def _on_round_metrics(self, round_number: int, metrics: Dict[str, Any]) -> None:
        # Block here while paused so training halts at a round boundary without
        # losing state. Wake up promptly if a stop is requested. Announce the
        # pause/resume transition from THIS worker thread — the async
        # pause()/resume() methods run in the FastAPI event loop, where the
        # asyncio.run() used to POST the callback would raise.
        paused_here = False
        while not self.pause_event.is_set() and not self.stop_event.is_set():
            if not paused_here:
                paused_here = True
                self._set_status("paused", "Paused at round boundary", previous="running")
            self.pause_event.wait(timeout=0.5)
        if self.stop_event.is_set():
            return
        if paused_here:
            self._set_status("running", "Resumed training", previous="paused")
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
            self._emit_privacy(snapshot, round_number)

    async def _push_metrics(self, metric: Dict[str, Any]) -> None:
        """Push one completed training round to the Node callback.

        Kept as its own coroutine (rather than folded into ``_emit``) so tests
        can intercept per-round pushes without touching status/error telemetry,
        and so a failed push is logged rather than silently swallowed.
        """
        training = metric.get("metrics", {}).get("training", [])
        training_data = training[-1] if training else {}
        payload = {
            "experimentId": self.experiment_id,
            "experiment_id": self.experiment_id,
            "metricType": "training_round_complete",
            "data": {
                "round": metric["round_number"],
                "loss": metric.get("global_loss"),
                "accuracy": metric.get("global_accuracy"),
                "totalRounds": self.config.num_rounds,
                **training_data,
            },
            "timestamp": metric["timestamp"],
        }
        try:
            await self._post(payload)
        except (httpx.HTTPError, OSError) as exc:
            logger.warning(
                "callback training_round_complete failed for %s round %s: %s",
                self.experiment_id, metric.get("round_number"), exc,
            )

    async def _post(self, payload: Dict[str, Any]) -> None:
        """POST one event envelope to the configured Node callback URL."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(str(self.config.callback_url), json=payload)
            response.raise_for_status()

    def _emit(self, metric_type: str, data: Dict[str, Any],
              timestamp: Optional[float] = None) -> None:
        """Fire-and-log a non-round event (status change, error, privacy).

        Safe to call ONLY from the worker thread — it uses ``asyncio.run`` and
        would raise inside the FastAPI event loop. No-ops when no callback URL
        is configured; logs (never swallows) failures so a broken callback is
        diagnosable.
        """
        if not self.config.callback_url:
            return
        payload = {
            "experimentId": self.experiment_id,
            "experiment_id": self.experiment_id,
            "metricType": metric_type,
            "data": data,
            "timestamp": timestamp if timestamp is not None else time.time(),
        }
        try:
            asyncio.run(self._post(payload))
        except Exception as exc:  # noqa: BLE001 - telemetry must never kill a run
            logger.warning("callback %s failed for %s: %s", metric_type, self.experiment_id, exc)

    def _set_status(self, new_status: str, message: Optional[str] = None,
                    previous: Optional[str] = None) -> None:
        """Transition the run's status and broadcast the change live.

        This is what makes the dashboard leave "queued" the instant training
        starts (before round 1) and reflect the terminal completed/stopped/
        failed states without waiting on a poll.
        """
        prev = previous if previous is not None else self.status
        self.status = new_status
        self._emit(
            "experiment_status_change",
            {
                "status": new_status,
                "previousStatus": prev,
                "message": message,
                "currentRound": self.current_round,
                # Carry the round target on every status change so the dashboard
                # can render a real progress % the instant a run starts, rather
                # than waiting for the REST poll to fill it in.
                "totalRounds": self.config.num_rounds,
            },
        )

    def _start_heartbeat(self) -> None:
        """Spin up the liveness heartbeat thread (no-op without a callback URL)."""
        if not self.config.callback_url:
            return
        self._heartbeat_stop = threading.Event()
        self._heartbeat_thread = threading.Thread(
            target=self._heartbeat_loop,
            name=f"heartbeat-{self.experiment_id}",
            daemon=True,
        )
        self._heartbeat_thread.start()

    def _heartbeat_loop(self) -> None:
        """Emit a heartbeat every ``heartbeat_interval`` seconds while active.

        Runs on its own daemon thread so a slow round or setup never starves the
        liveness signal, and so the periodic POST never blocks training. Exits
        promptly once a stop is requested or the run reaches a terminal state.
        """
        stop = self._heartbeat_stop
        assert stop is not None
        # wait() returns True when the stop event is set (clean shutdown) and
        # False on timeout (time to emit) — so the first beat lands one interval
        # in, keeping fast/synchronous runs (and tests) network-quiet.
        while not stop.wait(self.heartbeat_interval):
            if self.stop_event.is_set() or self.status in _TERMINAL_STATUSES:
                break
            self._emit_heartbeat()

    def _emit_heartbeat(self) -> None:
        """Fire a single liveness heartbeat carrying current progress + phase."""
        phase = "initializing" if (self.status == "running" and self.current_round == 0) else "training"
        elapsed = round(time.time() - self.start_time, 1) if self.start_time else 0
        message = (
            "Setting up model & data"
            if phase == "initializing"
            else f"Training round {self.current_round}"
        )
        self._emit(
            "heartbeat",
            {
                "status": self.status,
                "currentRound": self.current_round,
                "totalRounds": self.config.num_rounds,
                "phase": phase,
                "message": message,
                "elapsedSeconds": elapsed,
            },
        )

    def _stop_heartbeat(self) -> None:
        """Signal the heartbeat thread to exit and wait briefly for it."""
        if self._heartbeat_stop is not None:
            self._heartbeat_stop.set()
        thread = self._heartbeat_thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=1.0)

    def _emit_privacy(self, snapshot: Dict[str, Any], round_number: int) -> None:
        """Emit a privacy_budget_update when the round carried privacy metrics,
        so the epsilon gauge and budget warnings move live."""
        privacy = snapshot.get("privacy")
        if isinstance(privacy, list) and privacy:
            latest = privacy[-1]
        elif isinstance(privacy, dict):
            latest = privacy
        else:
            return
        epsilon = latest.get("epsilon")
        if epsilon is None:
            return
        self._emit(
            "privacy_budget_update",
            {
                "round": round_number,
                "epsilon": epsilon,
                "delta": latest.get("delta"),
                "percentageConsumed": latest.get("percentageConsumed")
                or latest.get("percentage_consumed"),
            },
        )

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
