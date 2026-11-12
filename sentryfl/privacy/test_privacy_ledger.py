"""Contract tests for resumable privacy scope and release accounting."""

import pytest

from sentryfl.privacy.privacy_ledger import PrivacyLedger


def test_ledger_records_cumulative_accounting_and_releases():
    ledger = PrivacyLedger(
        mechanism="dp_fedavg",
        scope="client/silo/entity-level",
        accountant="prv",
        target_epsilon=8.0,
        target_delta=1e-5,
    )
    ledger.record_accounting(
        round=1,
        epsilon=1.2,
        delta=1e-5,
        sample_rate=0.5,
        participating_clients=5,
    )
    ledger.record_accounting(
        round=2,
        epsilon=1.8,
        delta=1e-5,
        sample_rate=0.5,
        participating_clients=5,
    )
    ledger.record_release(
        release_type="global_model",
        audience="authorized download",
        status="available",
    )

    summary = ledger.summary()
    assert summary["epsilon"] == 1.8
    assert summary["rounds_accounted"] == 2
    assert summary["release_inventory"][0]["potentially_leaky"] is True


def test_ledger_rejects_non_monotonic_accounting():
    ledger = PrivacyLedger(mechanism="record_dpsgd", scope="record-level")
    ledger.record_accounting(round=1, epsilon=2.0, delta=1e-5)
    with pytest.raises(ValueError, match="cannot decrease"):
        ledger.record_accounting(round=2, epsilon=1.0, delta=1e-5)


def test_ledger_round_trip_restores_checkpoint_state():
    ledger = PrivacyLedger(mechanism="dp_fedavg", scope="client/silo/entity-level")
    ledger.record_accounting(round=1, epsilon=0.5, delta=1e-5)
    ledger.record_release(
        release_type="raw_records",
        audience="client-local process",
        status="not_released",
        potentially_leaky=False,
    )

    restored = PrivacyLedger.from_state_dict(ledger.state_dict())
    assert restored.summary() == ledger.summary()
