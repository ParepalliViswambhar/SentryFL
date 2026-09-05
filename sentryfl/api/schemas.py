"""Request and response schemas for the SentryFL backend API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, HttpUrl


class ExperimentConfig(BaseModel):
    """API configuration, accepting API fields and nested SentryFL overrides."""

    dataset: str = Field("SMD", pattern="^(SMD|NSL-KDD)$")
    num_clients: int = Field(10, ge=1)
    num_rounds: int = Field(100, ge=1)
    epsilon: float = Field(1.0, gt=0)
    delta: float = Field(1e-5, gt=0, le=1)
    batch_size: int = Field(32, ge=1)
    learning_rate: float = Field(0.001, gt=0)
    selection_ratio: float = Field(0.05, ge=0, le=1)
    enable_byzantine_robust: bool = False
    enable_quantization: bool = False
    enable_knowledge_distillation: bool = False
    callback_url: Optional[HttpUrl] = None
    data_path: str = "./data"
    device: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)

    def to_training_config(self) -> Dict[str, Any]:
        """Convert API fields into ConfigurationSystem's nested shape."""
        result = dict(self.config)
        result.setdefault("data", {}).update({"dataset": self.dataset})
        result.setdefault("training", {}).update({
            "num_rounds": self.num_rounds,
            "batch_size": self.batch_size,
            "learning_rate": self.learning_rate,
        })
        federated = result.setdefault("federated", {})
        federated.update({
            "num_clients": self.num_clients,
            "clients_per_round": min(
                self.num_clients,
                federated.get("clients_per_round", self.num_clients),
            ),
            "byzantine_robust": self.enable_byzantine_robust,
        })
        result.setdefault("privacy", {}).update({
            "enabled": self.epsilon > 0,
            "epsilon": self.epsilon,
            "delta": self.delta,
        })
        result.setdefault("parameter_efficiency", {}).update({
            "selection_ratio": self.selection_ratio,
        })
        result.setdefault("optimization", {}).update({
            "quantization_enabled": self.enable_quantization,
            "knowledge_distillation_enabled": self.enable_knowledge_distillation,
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
