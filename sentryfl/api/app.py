"""FastAPI application exposing SentryFL experiment control endpoints."""

import uuid
from typing import Callable, Dict, Optional, Any, Union
import json

from fastapi import APIRouter, BackgroundTasks, FastAPI, Header, HTTPException, Query, Response, UploadFile, File, Form, Request

from .runner import ExperimentRunner
from .remote_transport import RemoteClientRegistry, decode_update, parse_client_update_payload
from .schemas import (
    ExperimentConfig,
    ExperimentStatus,
    RemoteEnrollmentRequest,
    RemoteUpdateRequest,
)


def _sanitize_for_json(val: Any) -> Any:
    if isinstance(val, dict):
        return {str(k): _sanitize_for_json(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_sanitize_for_json(v) for v in val]
    if hasattr(val, "item") and callable(getattr(val, "item")):
        return val.item()
    if isinstance(val, (int, float, str, bool)) or val is None:
        return val
    return str(val)


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
        if remote_clients.enabled and not remote_clients.authorize(experiment_id, request.client_id, token):
            raise HTTPException(status_code=401, detail="invalid remote client token")
        try:
            update = decode_update(request.update_base64)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        result = runner.process_client_upload(
            client_id=request.client_id,
            parameters=update,
            num_samples=request.num_samples,
            metrics=request.metrics,
            auto_aggregate=True,
            upload_bytes=len(request.update_base64),
        )
        if not result.get("accepted"):
            raise HTTPException(status_code=422, detail=result.get("error", "update rejected by aggregation server"))
        recorded = result.pop("_recorded_event", None)
        if recorded and hasattr(runner, "async_emit_upload_updates"):
            await runner.async_emit_upload_updates(recorded)
        return _sanitize_for_json({
            "experiment_id": experiment_id,
            "client_id": request.client_id,
            "accepted": True,
            "round": result.get("round", runner.current_round),
            "status": result.get("status"),
            "pending_clients": result.get("pending_clients", 0),
        })

    @router.post("/train/{experiment_id}/model/upload")
    async def upload_model_file(
        experiment_id: str,
        request: Request,
    ):
        """Upload a locally trained client model file or update payload and aggregate weights."""
        runner = _get_runner(runners, experiment_id)
        cid = request.headers.get("x-client-id") or "client_remote"
        samples = int(request.headers.get("x-num-samples") or 100)
        metrics = {}
        auto_aggregate = True
        params = None
        upload_bytes = 0

        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" in content_type:
            form = await request.form()
            cid = form.get("client_id") or cid
            if form.get("num_samples"):
                try:
                    samples = int(form.get("num_samples"))
                except ValueError:
                    pass
            metrics_json = form.get("metrics_json")
            if metrics_json:
                try:
                    metrics = json.loads(metrics_json)
                except Exception:
                    pass
            auto_agg_val = form.get("auto_aggregate")
            if auto_agg_val is not None:
                auto_aggregate = str(auto_agg_val).lower() in ("true", "1", "yes")

            file_field = form.get("file")
            if file_field is not None and hasattr(file_field, "read"):
                raw_content = await file_field.read()
                upload_bytes = len(raw_content)
                try:
                    params, file_samples, file_metrics = parse_client_update_payload(raw_content)
                    if file_samples:
                        samples = file_samples
                    if file_metrics:
                        metrics.update(file_metrics)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            else:
                raise HTTPException(status_code=400, detail="Missing file in multipart form")
        else:
            body = await request.body()
            upload_bytes = len(body)
            if not body:
                raise HTTPException(status_code=400, detail="Missing model file or payload")
            try:
                data = json.loads(body.decode("utf-8"))
                cid = data.get("client_id", cid)
                samples = data.get("num_samples", samples)
                metrics.update(data.get("metrics", {}))
                auto_aggregate = data.get("auto_aggregate", auto_aggregate)
                update_b64 = data.get("update_base64")
                if not update_b64:
                    raise ValueError("JSON request must include update_base64")
                params, file_samples, file_metrics = parse_client_update_payload(update_b64)
                if file_metrics:
                    # Explicit JSON metrics take precedence over embedded metrics
                    merged_metrics = dict(file_metrics)
                    merged_metrics.update(metrics)
                    metrics = merged_metrics
                if not data.get("num_samples") and file_samples:
                    samples = file_samples
            except (json.JSONDecodeError, UnicodeDecodeError):
                try:
                    params, file_samples, file_metrics = parse_client_update_payload(body)
                    if file_samples:
                        samples = file_samples
                    if file_metrics:
                        metrics.update(file_metrics)
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc

        result = runner.process_client_upload(
            client_id=cid,
            parameters=params,
            num_samples=samples,
            metrics=metrics,
            auto_aggregate=auto_aggregate,
            upload_bytes=upload_bytes,
        )
        if not result.get("accepted"):
            raise HTTPException(status_code=422, detail=result.get("error", "update rejected by aggregation server"))

        recorded = result.pop("_recorded_event", None)
        if recorded and hasattr(runner, "async_emit_upload_updates"):
            await runner.async_emit_upload_updates(recorded)

        return _sanitize_for_json({
            "experiment_id": experiment_id,
            "client_id": cid,
            "accepted": True,
            "round": result.get("round", runner.current_round),
            "status": result.get("status"),
            "aggregation_stats": result.get("aggregation_stats", {}),
        })

    @router.post("/train/{experiment_id}/aggregate")
    async def trigger_aggregation(experiment_id: str):
        runner = _get_runner(runners, experiment_id)
        if hasattr(runner, "trigger_manual_aggregation"):
            agg_res = runner.trigger_manual_aggregation()
            recorded = agg_res.pop("_recorded_event", None)
            if recorded and hasattr(runner, "async_emit_upload_updates"):
                await runner.async_emit_upload_updates(recorded)
            return _sanitize_for_json(agg_res)
        server = getattr(getattr(runner, "trainer", None), "aggregation_server", None)
        if server is None or not server.pending_updates:
            return {
                "experiment_id": experiment_id,
                "status": "no_pending_updates",
                "round": runner.current_round,
            }
        next_round = runner.current_round + 1
        stats = server.aggregate_updates(round_num=next_round, min_clients=1)
        runner.current_round = next_round
        runner._cached_artifact_round = None
        return _sanitize_for_json({
            "experiment_id": experiment_id,
            "status": "aggregated",
            "round": runner.current_round,
            "stats": stats,
        })

    @router.post("/train/{experiment_id}/mia/evaluate")
    async def evaluate_mia(experiment_id: str):
        """Run empirical MIA & privacy report evaluation on the current global model."""
        runner = _get_runner(runners, experiment_id)
        if not hasattr(runner, "evaluate_mia_report"):
            raise HTTPException(status_code=501, detail="MIA evaluation not supported by runner")
        return _sanitize_for_json(runner.evaluate_mia_report())

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
