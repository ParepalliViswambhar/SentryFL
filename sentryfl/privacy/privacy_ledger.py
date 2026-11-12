"""Resumable privacy accounting and release inventory for experiment reports.

The ledger is deliberately mechanism-agnostic.  DP-FedAvg and record-level
DP-SGD provide their own accountant state; this module records the resulting
events, scope, and potentially leaky releases in one serializable contract.
It never turns an empirical MIA result into a formal privacy guarantee.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Mapping, Optional


@dataclass
class AccountingEvent:
    """One cumulative privacy readout at a training boundary."""

    round: int
    epsilon: float
    delta: float
    mechanism: str
    scope: str
    accountant: Optional[str] = None
    sample_rate: Optional[float] = None
    participating_clients: Optional[int] = None


@dataclass
class ReleaseEvent:
    """A model/update/artifact release or internally exposed state."""

    round: Optional[int]
    release_type: str
    audience: str
    status: str
    potentially_leaky: bool = True
    details: Dict[str, Any] = field(default_factory=dict)


class PrivacyLedger:
    """Track formal accounting events separately from release inventory."""

    SCHEMA_VERSION = "1.0"

    def __init__(
        self,
        *,
        mechanism: str,
        scope: str,
        accountant: Optional[str] = None,
        target_epsilon: Optional[float] = None,
        target_delta: Optional[float] = None,
    ) -> None:
        self.mechanism = str(mechanism)
        self.scope = str(scope)
        self.accountant = accountant
        self.target_epsilon = target_epsilon
        self.target_delta = target_delta
        self.accounting_events: List[AccountingEvent] = []
        self.release_events: List[ReleaseEvent] = []

    @property
    def latest(self) -> Optional[AccountingEvent]:
        return self.accounting_events[-1] if self.accounting_events else None

    def record_accounting(
        self,
        *,
        round: int,
        epsilon: float,
        delta: float,
        mechanism: Optional[str] = None,
        scope: Optional[str] = None,
        accountant: Optional[str] = None,
        sample_rate: Optional[float] = None,
        participating_clients: Optional[int] = None,
    ) -> AccountingEvent:
        """Record a cumulative accountant readout and reject regressions."""
        if int(round) < 1:
            raise ValueError(f"round must be >= 1, got {round!r}")
        if epsilon < 0 or delta < 0:
            raise ValueError("epsilon and delta must be non-negative")
        if self.latest is not None and epsilon + 1e-12 < self.latest.epsilon:
            raise ValueError(
                "cumulative epsilon cannot decrease: "
                f"{epsilon} < {self.latest.epsilon}"
            )
        if self.accounting_events and int(round) <= self.accounting_events[-1].round:
            raise ValueError("accounting events must advance strictly by round")

        event = AccountingEvent(
            round=int(round),
            epsilon=float(epsilon),
            delta=float(delta),
            mechanism=str(mechanism or self.mechanism),
            scope=str(scope or self.scope),
            accountant=accountant or self.accountant,
            sample_rate=None if sample_rate is None else float(sample_rate),
            participating_clients=(
                None if participating_clients is None else int(participating_clients)
            ),
        )
        self.accounting_events.append(event)
        return event

    def record_release(
        self,
        *,
        release_type: str,
        audience: str,
        status: str,
        round: Optional[int] = None,
        potentially_leaky: bool = True,
        details: Optional[Mapping[str, Any]] = None,
    ) -> ReleaseEvent:
        """Record a release without implying that it is formally private."""
        event = ReleaseEvent(
            round=None if round is None else int(round),
            release_type=str(release_type),
            audience=str(audience),
            status=str(status),
            potentially_leaky=bool(potentially_leaky),
            details=dict(details or {}),
        )
        self.release_events.append(event)
        return event

    def state_dict(self) -> Dict[str, Any]:
        """Return checkpoint-safe ledger state."""
        return {
            "schema_version": self.SCHEMA_VERSION,
            "mechanism": self.mechanism,
            "scope": self.scope,
            "accountant": self.accountant,
            "target_epsilon": self.target_epsilon,
            "target_delta": self.target_delta,
            "accounting_events": [asdict(item) for item in self.accounting_events],
            "release_events": [asdict(item) for item in self.release_events],
        }

    @classmethod
    def from_state_dict(cls, state: Mapping[str, Any]) -> "PrivacyLedger":
        """Restore a ledger and validate its cumulative ordering."""
        ledger = cls(
            mechanism=state.get("mechanism", "none"),
            scope=state.get("scope", "not_applicable"),
            accountant=state.get("accountant"),
            target_epsilon=state.get("target_epsilon"),
            target_delta=state.get("target_delta"),
        )
        for raw in state.get("accounting_events", []):
            ledger.record_accounting(**raw)
        for raw in state.get("release_events", []):
            ledger.record_release(**raw)
        return ledger

    def summary(self) -> Dict[str, Any]:
        """Return the report-facing formal scope and release inventory."""
        latest = self.latest
        return {
            "schema_version": self.SCHEMA_VERSION,
            "mechanism": self.mechanism,
            "scope": self.scope,
            "accountant": self.accountant,
            "target_epsilon": self.target_epsilon,
            "target_delta": self.target_delta,
            "rounds_accounted": len(self.accounting_events),
            "epsilon": latest.epsilon if latest else None,
            "delta": latest.delta if latest else None,
            "accounting_events": [asdict(item) for item in self.accounting_events],
            "release_inventory": [asdict(item) for item in self.release_events],
        }


__all__ = ["AccountingEvent", "ReleaseEvent", "PrivacyLedger"]
