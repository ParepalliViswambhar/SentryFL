"""Tests for the reproducibility manifest contract."""

import json
from pathlib import Path

import torch.nn as nn

from sentryfl.utils.manifest import (
    build_manifest,
    dataset_descriptor,
    sha256_json,
)


def test_dataset_descriptor_is_sorted_and_changes_when_a_file_changes(tmp_path):
    dataset = tmp_path / "SMD"
    dataset.mkdir()
    (dataset / "test.txt").write_text("2\n", encoding="utf-8")
    (dataset / "train.txt").write_text("1\n", encoding="utf-8")

    first = dataset_descriptor(dataset)
    assert [entry["path"] for entry in first["files"]] == ["test.txt", "train.txt"]

    (dataset / "train.txt").write_text("changed\n", encoding="utf-8")
    second = dataset_descriptor(dataset)
    assert first["sha256"] != second["sha256"]


def test_manifest_round_trip_contains_required_provenance(tmp_path):
    dataset = tmp_path / "dataset"
    dataset.mkdir()
    (dataset / "data.txt").write_text("content\n", encoding="utf-8")
    output = tmp_path / "run" / "manifest.json"

    manifest = build_manifest(
        config={"experiment": {"seed": 7}},
        seed=7,
        dataset_name="SMD",
        dataset_root=dataset,
        split_checksum=sha256_json({"train": [0, 8], "val": [8, 9]}),
        model=nn.Linear(1, 1),
        model_config={"revision": "test-model"},
        command=["python", "-m", "sentryfl.cli", "train"],
        repo_dir=tmp_path,
    )
    manifest.write(output)

    loaded = json.loads(output.read_text(encoding="utf-8"))
    required = {
        "code_revision",
        "config",
        "seed",
        "dataset",
        "split_checksum",
        "model_revision",
        "hardware",
        "command",
        "dependency_lock",
    }
    assert required.issubset(loaded)
    assert loaded["seed"] == 7
    assert loaded["dataset"]["files"][0]["sha256"]
    assert Path(output).is_file()
