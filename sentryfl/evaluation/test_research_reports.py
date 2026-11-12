import json

import pytest

from sentryfl.evaluation.research_reports import ResearchReport, wrap_result


def test_report_rejects_unknown_evidence_status():
    with pytest.raises(ValueError, match="status"):
        ResearchReport("E1", "unknown", {}, {})


def test_report_round_trips_as_json(tmp_path):
    report = wrap_result(
        {"experiment": "E2", "status": "measured", "rows": [{"bytes": 4}]},
        protocol={"representation": "serialized tensors"},
    )
    path = report.write(tmp_path / "report.json")
    loaded = json.loads((tmp_path / "report.json").read_text())
    assert path.endswith("report.json")
    assert loaded["schema_version"] == "1.0"
    assert loaded["protocol"]["representation"] == "serialized tensors"
