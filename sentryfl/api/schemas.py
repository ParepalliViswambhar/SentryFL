"""Request and response schemas for the SentryFL backend API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class ExperimentConfig(BaseModel):
    """API configuration, accepting API fields and nested SentryFL overrides."""

    dataset: str = Field("SMD", pattern="^(SMD|NSL-KDD)$")
    num_clients: int = Field(10, ge=1)
    clients_per_round: Optional[int] = Field(None, ge=1)
    num_rounds: int = Field(100, ge=1)
    epsilon: float = Field(1.0, gt=0)
    delta: float = Field(1e-5, gt=0, le=1)
    batch_size: int = Field(32, ge=1)
    local_epochs: int = Field(1, ge=1)
    learning_rate: float = Field(0.001, gt=0)
    selection_ratio: float = Field(0.05, ge=0, le=1)
    enable_byzantine_robust: bool = False
    enable_quantization: bool = False
    enable_knowledge_distillation: bool = False
    callback_url: Optional[HttpUrl] = None
    data_path: str = "./data"
    # "synthetic" generates a zero-setup demo dataset; "real" uses downloaded
    # files under data_path/<dataset>/. Default demo so a fresh install runs.
    data_source: str = Field("synthetic", pattern="^(synthetic|real)$")
    data_split: str = Field("iid", pattern="^(iid|non-iid|heterogeneous)$")
    model_params: Dict[str, Any] = Field(default_factory=dict)
    experiment_name: Optional[str] = None
    max_train_rows: int = Field(5000, ge=100)
    max_test_rows: int = Field(2000, ge=100)
    client_data_mode: str = Field("redundant", pattern="^(redundant|disjoint)$")
    client_overlap_ratio: float = Field(0.5, ge=0, lt=1)
    workflow_mode: str = Field("sentryfl", pattern="^(sentryfl|standard_fedavg)$")
    device: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)

    def to_training_config(self) -> Dict[str, Any]:
        """Convert API fields into ConfigurationSystem's nested shape."""
        result = dict(self.config)
        model_params = dict(self.model_params)
        result.setdefault("model", {}).update({
            key: model_params[key]
            for key in ("backbone", "hidden_dim", "dropout")
            if key in model_params
        })
        result.setdefault("data", {}).update({
            key: model_params[key]
            for key in ("window_size", "stride")
            if key in model_params
        })
        result.setdefault("parameter_efficiency", {}).update({
            key: model_params[key]
            for key in ("adms_enabled", "selection_ratio")
            if key in model_params
        })
        result.setdefault("experiment", {}).update({
            "name": self.experiment_name or result.get("experiment", {}).get("name", "default_experiment"),
            "seed": model_params.get("seed", result.get("experiment", {}).get("seed", 42)),
        })
        result.setdefault("data", {}).update({
            "dataset": self.dataset,
            "data_source": self.data_source,
        })
        result.setdefault("data", {}).update({
            "max_train_rows": self.max_train_rows,
            "max_test_rows": self.max_test_rows,
        })
        result.setdefault("training", {}).update({
            "num_rounds": self.num_rounds,
            "local_epochs": self.local_epochs,
            "batch_size": self.batch_size,
            "learning_rate": self.learning_rate,
        })
        federated = result.setdefault("federated", {})
        federated.update({
            "num_clients": self.num_clients,
            "clients_per_round": min(
                self.num_clients,
                self.clients_per_round or federated.get("clients_per_round", self.num_clients),
            ),
            "client_data_mode": self.client_data_mode,
            "client_overlap_ratio": self.client_overlap_ratio,
            "partition_strategy": "non_iid" if self.data_split == "non-iid" else "iid",
            "byzantine_robust": self.enable_byzantine_robust,
        })
        result.setdefault("privacy", {}).update({
            "enabled": self.epsilon > 0 and self.workflow_mode == "sentryfl",
            "epsilon": self.epsilon,
            "delta": self.delta,
        })
        result.setdefault("experiment", {}).update({
            "workflow_mode": self.workflow_mode,
        })
        result.setdefault("parameter_efficiency", {}).update({
            "selection_ratio": self.selection_ratio,
        })
        result.setdefault("optimization", {}).update({
            "quantization_enabled": self.enable_quantization,
            "knowledge_distillation_enabled": self.enable_knowledge_distillation,
        })
        if self.workflow_mode == "standard_fedavg":
            result.setdefault("parameter_efficiency", {}).update({
                "adms_enabled": False,
                "method": "full_head",
            })
        return result


class ExperimentStatus(BaseModel):
    experiment_id: str
    status: str
    current_round: int
    total_rounds: int
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    error: Optional[str] = None


class RemoteEnrollmentRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=128)
    shared_secret: str = Field(..., min_length=1)


class RemoteUpdateRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=128)
    num_samples: int = Field(..., gt=0)
    update_base64: str = Field(..., min_length=1)
    metrics: Dict[str, Any] = Field(default_factory=dict)


class TrainingMetrics(BaseModel):
    experiment_id: str
    round_number: int
    timestamp: float
    global_loss: Optional[float] = None
    global_accuracy: Optional[float] = None
    epsilon_consumed: Optional[float] = None
    delta: Optional[float] = None
    bytes_transferred: Optional[int] = None
    client_metrics: List[Dict[str, Any]] = Field(default_factory=list)
    metrics: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)


class PrivacyMetrics(BaseModel):
    epsilon: Optional[float] = None
    delta: Optional[float] = None
    mia_success_rate: Optional[float] = None


class CommunicationMetrics(BaseModel):
    bytes_transferred: Optional[int] = None
    num_clients: Optional[int] = None


class EvaluationMetrics(BaseModel):
    f1_score: Optional[float] = None
    auc_roc: Optional[float] = None
    auc_pr: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
