"""Machine-readable provenance manifests for reproducible experiments.

The PRD requires every run to record enough provenance to reproduce the
protocol: source revision, resolved configuration, seed, dataset and split
checksums, model revision, hardware, command, and dependency lock state.
This module deliberately stores metadata and digests only; it never copies raw
dataset records into an experiment bundle.
"""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional, Union


MANIFEST_SCHEMA_VERSION = "1.0"
EVIDENCE_STATUSES = frozenset(
    {
        "implemented",
        "measured",
        "simulated",
        "experimentally_unverified",
        "unsupported",
    }
)


def _json_safe(value: Any) -> Any:
    """Convert common configuration values into stable JSON-compatible data."""
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    # Configuration objects should not normally reach here, but preserving a
    # stable representation is safer than failing while writing provenance.
    return str(value)


def canonical_json(value: Any) -> bytes:
    """Serialize a value deterministically for hashing and storage."""
    return json.dumps(
        _json_safe(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    """Return a SHA-256 digest for bytes."""
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    """Return a SHA-256 digest for canonical JSON data."""
    return sha256_bytes(canonical_json(value))


def sha256_file(path: Union[str, Path]) -> str:
    """Hash a file without loading it entirely into memory."""
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def dataset_descriptor(root: Union[str, Path]) -> Dict[str, Any]:
    """Describe dataset files by relative path, size, and SHA-256.

    Relative paths make manifests portable across machines. Files are sorted
    before hashing so the aggregate checksum is independent of filesystem
    traversal order.
    """
    base = Path(root)
    if not base.exists():
        raise FileNotFoundError(f"Dataset path not found: {base}")
    if not base.is_dir():
        raise ValueError(f"Dataset path must be a directory: {base}")

    files: List[Dict[str, Any]] = []
    for path in sorted(
        (candidate for candidate in base.rglob("*") if candidate.is_file()),
        key=lambda candidate: candidate.relative_to(base).as_posix(),
    ):
        relative = path.relative_to(base).as_posix()
        files.append(
            {
                "path": relative,
                "size_bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )

    return {
        "root_name": base.name,
        "file_count": len(files),
        "files": files,
        "sha256": sha256_json(files),
    }


def dependency_lock_descriptor(repo_dir: Union[str, Path]) -> Dict[str, Any]:
    """Hash dependency declaration/lock files that are present in the repo."""
    root = Path(repo_dir)
    candidates = (
        "requirements.txt",
        "pyproject.toml",
        "poetry.lock",
        "Pipfile.lock",
        "api-server/package-lock.json",
        "dashboard/package-lock.json",
    )
    files = []
    for relative in candidates:
        path = root / relative
        if path.is_file():
            files.append({"path": relative, "sha256": sha256_file(path)})
    return {"files": files, "sha256": sha256_json(files)}


def git_provenance(repo_dir: Union[str, Path]) -> Dict[str, Any]:
    """Read the current Git revision without making Git a runtime dependency."""
    root = Path(repo_dir)
    revision = "unknown"
    dirty = None
    try:
        revision_result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(root),
            check=True,
            capture_output=True,
            text=True,
        )
        revision = revision_result.stdout.strip() or "unknown"
        dirty_result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(root),
            check=True,
            capture_output=True,
            text=True,
        )
        dirty = bool(dirty_result.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        # A source archive or installed wheel may not have a .git directory.
        pass
    return {"revision": revision, "working_tree_dirty": dirty}


def default_hardware() -> Dict[str, Any]:
    """Return lightweight host information when a caller has no probe data."""
    return {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "python": platform.python_version(),
    }


@dataclass
class ExperimentManifest:
    """Serializable provenance contract for one experiment run."""

    code_revision: str
    config: Dict[str, Any]
    seed: int
    dataset: Dict[str, Any]
    split_checksum: str
    model_revision: Dict[str, Any]
    hardware: Dict[str, Any]
    command: List[str]
    dependency_lock: Dict[str, Any]
    working_tree_dirty: Optional[bool] = None
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    schema_version: str = MANIFEST_SCHEMA_VERSION
    evidence_status: str = "measured"

    def to_dict(self) -> Dict[str, Any]:
        """Return JSON-compatible manifest data."""
        return _json_safe(asdict(self))

    def write(self, path: Union[str, Path]) -> str:
        """Write the manifest atomically and return its path."""
        destination = Path(path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(self.to_dict(), handle, indent=2, sort_keys=True)
            handle.write("\n")
        temporary.replace(destination)
        return str(destination)


def build_manifest(
    *,
    config: Mapping[str, Any],
    seed: int,
    dataset_name: str,
    dataset_root: Union[str, Path],
    split_checksum: str,
    model: Any,
    model_config: Optional[Mapping[str, Any]] = None,
    dataset_contract: Optional[Mapping[str, Any]] = None,
    hardware: Optional[Mapping[str, Any]] = None,
    command: Optional[Iterable[str]] = None,
    repo_dir: Optional[Union[str, Path]] = None,
    evidence_status: str = "measured",
) -> ExperimentManifest:
    """Build a complete manifest for a configured run.

    ``split_checksum`` is supplied by the training pipeline because only that
    layer knows the exact temporal ranges and window materialization used by a
    run. The dataset descriptor contains file checksums but no raw values.
    """
    if not split_checksum:
        raise ValueError("split_checksum must be a non-empty digest")
    if evidence_status not in EVIDENCE_STATUSES:
        raise ValueError(
            f"evidence_status must be one of {sorted(EVIDENCE_STATUSES)}, "
            f"got {evidence_status!r}"
        )

    repository = Path(repo_dir) if repo_dir is not None else Path.cwd()
    model_revision = {
        "class": f"{model.__class__.__module__}.{model.__class__.__qualname__}",
        "revision": (model_config or {}).get("revision")
        or (model_config or {}).get("backbone", "unversioned"),
        "configuration": _json_safe(model_config or {}),
    }
    revision = git_provenance(repository)
    return ExperimentManifest(
        code_revision=revision["revision"],
        config=_json_safe(config),
        seed=int(seed),
        dataset={
            "name": dataset_name,
            **dataset_descriptor(dataset_root),
            "contract": _json_safe(dataset_contract or {}),
        },
        split_checksum=split_checksum,
        model_revision=model_revision,
        hardware=_json_safe(hardware or default_hardware()),
        command=list(command) if command is not None else list(sys.argv),
        dependency_lock=dependency_lock_descriptor(repository),
        working_tree_dirty=revision["working_tree_dirty"],
        evidence_status=evidence_status,
    )


__all__ = [
    "MANIFEST_SCHEMA_VERSION",
    "EVIDENCE_STATUSES",
    "ExperimentManifest",
    "build_manifest",
    "canonical_json",
    "dataset_descriptor",
    "dependency_lock_descriptor",
    "git_provenance",
    "sha256_bytes",
    "sha256_file",
    "sha256_json",
]
