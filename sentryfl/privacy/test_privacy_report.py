from scripts.run_privacy_evaluation import build_report


def test_privacy_report_keeps_dp_units_separate():
    report = build_report(run_mia=False)
    rows = report.results["accounting"]
    assert {row["mechanism"] for row in rows} == {"dp_fedavg", "record_dpsgd"}
    assert {row["privacy_unit"] for row in rows} == {"client/silo/entity", "record"}
    assert report.results["mia"]["status"] == "not_run"
