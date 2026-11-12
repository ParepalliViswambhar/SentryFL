"""Versioned evidence envelopes for offline research reports."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional


REPORT_SCHEMA_VERSION = "1.0"
EVIDENCE_STATUSES = frozenset(
    {"measured", "simulated", "scaffold", "skipped", "unsupported"}
)


@dataclass
class ResearchReport:
    """A report that separates measured evidence from demonstrations/scaffolds."""

    experiment: str
    status: str
    protocol: Dict[str, Any]
    results: Any
    limitations: list[str] = field(default_factory=list)
    schema_version: str = REPORT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        if self.status not in EVIDENCE_STATUSES:
            raise ValueError(
                f"status must be one of {sorted(EVIDENCE_STATUSES)}, got {self.status!r}"
            )
        if not self.experiment.strip():
            raise ValueError("experiment must not be empty")

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def write(self, path: str | Path) -> str:
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_text(
            json.dumps(self.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)
        return str(destination)


def wrap_result(
    result: Mapping[str, Any],
    *,
    protocol: Optional[Mapping[str, Any]] = None,
    limitations: Optional[list[str]] = None,
) -> ResearchReport:
    """Convert an experiment function result into the common report contract."""
    status = str(result.get("status", "measured"))
    return ResearchReport(
        experiment=str(result.get("experiment", "unknown")),
        status=status,
        protocol=dict(protocol or {}),
        results=dict(result),
        limitations=list(limitations or []),
    )
