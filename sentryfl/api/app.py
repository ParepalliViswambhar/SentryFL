"""FastAPI application exposing SentryFL experiment control endpoints."""

import uuid
from typing import Callable, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, FastAPI, Header, HTTPException, Query, Response

from .runner import ExperimentRunner
from .remote_transport import RemoteClientRegistry, decode_update
from .schemas import (
    ExperimentConfig,
    ExperimentStatus,
    RemoteEnrollmentRequest,
    RemoteUpdateRequest,
)


def create_app(
    runner_factory: Optional[Callable[..., ExperimentRunner]] = None,
    remote_enrollment_secret: Optional[str] = None,
) -> FastAPI:
    application = FastAPI(
        title="SentryFL ML Backend",
        version="1.0.0",
        description="Federated learning experiment control and metrics API.",
    )
    runners: Dict[str, ExperimentRunner] = {}
    factory = runner_factory or ExperimentRunner
    remote_clients = RemoteClientRegistry(remote_enrollment_secret)
    router = APIRouter()

    @router.post("/train", response_model=ExperimentStatus, status_code=202)
    async def create_experiment(config: ExperimentConfig, background_tasks: BackgroundTasks):
        experiment_id = str(uuid.uuid4())
        runner = factory(experiment_id, config)
        runners[experiment_id] = runner
        background_tasks.add_task(runner.start)
        return runner.get_status()

    @router.get("/train")
    async def list_experiments():
        """List all known experiments and their current status."""
        return {
            "experiments": [runner.get_status().model_dump() for runner in runners.values()],
            "total": len(runners),
        }

    @router.delete("/train/{experiment_id}")
    async def stop_experiment(experiment_id: str):
        runner = _get_runner(runners, experiment_id)
        await runner.stop()
        return runner.get_status()

    @router.post("/train/{experiment_id}/pause", response_model=ExperimentStatus)
    async def pause_experiment(experiment_id: str):
        runner = _get_runner(runners, experiment_id)
        await runner.pause()
        return runner.get_status()

    @router.post("/train/{experiment_id}/resume", response_model=ExperimentStatus)
    async def resume_experiment(experiment_id: str):
        runner = _get_runner(runners, experiment_id)
        await runner.resume()
        return runner.get_status()

    @router.get("/train/{experiment_id}/status", response_model=ExperimentStatus)
    async def get_status(experiment_id: str):
        return _get_runner(runners, experiment_id).get_status()

    @router.get("/train/{experiment_id}/metrics")
    async def get_metrics(
        experiment_id: str,
        start_round: Optional[int] = Query(None, ge=1),
        end_round: Optional[int] = Query(None, ge=1),
        limit: Optional[int] = Query(None, ge=1),
        offset: int = Query(0, ge=0),
    ):
        return _get_runner(runners, experiment_id).get_metrics(
            start_round=start_round, end_round=end_round, limit=limit, offset=offset
        )

    @router.get("/train/{experiment_id}/metrics/{category}")
    async def get_metrics_by_category(
        experiment_id: str,
        category: str,
        start_round: Optional[int] = Query(None, ge=1),
        end_round: Optional[int] = Query(None, ge=1),
        limit: Optional[int] = Query(None, ge=1),
        offset: int = Query(0, ge=0),
    ):
        if category not in {"training", "privacy", "communication", "evaluation"}:
            raise HTTPException(status_code=400, detail=f"Unknown metric category: {category}")
        return _get_runner(runners, experiment_id).get_metrics(
            start_round=start_round, end_round=end_round,
            category=category, limit=limit, offset=offset,
        )

    @router.get("/train/{experiment_id}/report")
    async def get_report(experiment_id: str):
        return _get_runner(runners, experiment_id).get_report()

    @router.get("/train/{experiment_id}/model")
    async def download_model(experiment_id: str):
        """Download the current global model for local client inference."""
        runner = _get_runner(runners, experiment_id)
        try:
            artifact = runner.get_model_artifact()
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return Response(
            content=artifact,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{experiment_id}-global-model.pt"',
            },
        )

    @router.post("/train/{experiment_id}/clients/enroll")
    async def enroll_remote_client(
        experiment_id: str, request: RemoteEnrollmentRequest
    ):
        _get_runner(runners, experiment_id)
        try:
            token = remote_clients.enroll(
                experiment_id, request.client_id, request.shared_secret
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except (PermissionError, ValueError) as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"experiment_id": experiment_id, "client_id": request.client_id, "token": token}

    @router.post("/train/{experiment_id}/clients/update")
    async def submit_remote_update(
        experiment_id: str,
        request: RemoteUpdateRequest,
        authorization: Optional[str] = Header(None),
    ):
        runner = _get_runner(runners, experiment_id)
        token = authorization.removeprefix("Bearer ").strip() if authorization else ""
        if not remote_clients.authorize(experiment_id, request.client_id, token):
            raise HTTPException(status_code=401, detail="invalid remote client token")
        server = getattr(getattr(runner, "trainer", None), "aggregation_server", None)
        if server is None:
            raise HTTPException(status_code=409, detail="aggregation server is not ready")
        try:
            update = decode_update(request.update_base64)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        accepted = server.collect_client_updates(
            request.client_id, update, request.num_samples, request.metrics
        )
        if not accepted:
            raise HTTPException(status_code=422, detail="update rejected by aggregation server")
        return {
            "experiment_id": experiment_id,
            "client_id": request.client_id,
            "accepted": True,
            "pending_clients": len(server.pending_updates),
        }

    @router.get("/health")
    async def health_check():
        return {"status": "healthy", "active_experiments": len(runners), "version": "1.0.0"}

    application.include_router(router)
    application.include_router(router, prefix="/api")
    application.state.runners = runners
    return application


def _get_runner(runners: Dict[str, ExperimentRunner], experiment_id: str) -> ExperimentRunner:
    runner = runners.get(experiment_id)
    if runner is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return runner


app = create_app()
