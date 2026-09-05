"""FastAPI application exposing SentryFL experiment control endpoints."""

import uuid
from typing import Callable, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, FastAPI, HTTPException, Query

from .runner import ExperimentRunner
from .schemas import ExperimentConfig, ExperimentStatus


def create_app(runner_factory: Optional[Callable[..., ExperimentRunner]] = None) -> FastAPI:
    application = FastAPI(
        title="SentryFL ML Backend",
        version="1.0.0",
        description="Federated learning experiment control and metrics API.",
    )
    runners: Dict[str, ExperimentRunner] = {}
    factory = runner_factory or ExperimentRunner
    router = APIRouter()

    @router.post("/train", response_model=ExperimentStatus, status_code=202)
    async def create_experiment(config: ExperimentConfig, background_tasks: BackgroundTasks):
        experiment_id = str(uuid.uuid4())
        runner = factory(experiment_id, config)
        runners[experiment_id] = runner
        background_tasks.add_task(runner.start)
        return runner.get_status()

    @router.delete("/train/{experiment_id}")
    async def stop_experiment(experiment_id: str):
        runner = _get_runner(runners, experiment_id)
        await runner.stop()
        return runner.get_status()

    @router.get("/train/{experiment_id}/status", response_model=ExperimentStatus)
    async def get_status(experiment_id: str):
        return _get_runner(runners, experiment_id).get_status()

    @router.get("/train/{experiment_id}/metrics")
    async def get_metrics(
        experiment_id: str,
        start_round: Optional[int] = Query(None, ge=1),
        end_round: Optional[int] = Query(None, ge=1),
    ):
        return _get_runner(runners, experiment_id).get_metrics(start_round, end_round)

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
