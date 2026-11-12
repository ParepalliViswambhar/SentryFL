"""Contract tests for validated round updates."""

import torch
import torch.nn as nn

from sentryfl.federated.server import AggregationServer


class TinyAggregationModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(2, 1)

    def forward(self, x):
        return self.fc(x)


def _update(server):
    return {
        name: parameter.detach().clone()
        for name, parameter in server.global_model.named_parameters()
    }


def test_update_contract_rejects_bad_counts_and_incompatible_payloads(tmp_path):
    server = AggregationServer(TinyAggregationModel(), checkpoint_dir=str(tmp_path))
    valid = _update(server)

    assert not server.collect_client_updates("zero", valid, 0)
    assert not server.collect_client_updates("unknown", {"missing": torch.ones(1)}, 1)
    assert not server.collect_client_updates(
        "shape", {**valid, "fc.weight": torch.ones(3, 2)}, 1
    )
    assert not server.collect_client_updates(
        "dtype", {name: value.double() for name, value in valid.items()}, 1
    )
    assert set(server.rejected_updates) == {"zero", "unknown", "shape", "dtype"}


def test_round_requires_matching_parameter_keys(tmp_path):
    server = AggregationServer(TinyAggregationModel(), checkpoint_dir=str(tmp_path))
    valid = _update(server)
    partial = {"fc.weight": valid["fc.weight"]}

    assert server.collect_client_updates("first", valid, 1)
    assert not server.collect_client_updates("partial", partial, 1)
    assert "partial" in server.rejected_updates


def test_accepted_and_rejected_update_counts_are_reported(tmp_path):
    server = AggregationServer(TinyAggregationModel(), checkpoint_dir=str(tmp_path))
    valid = _update(server)
    server.collect_client_updates("valid", valid, 1)
    server.collect_client_updates("invalid", {"missing": torch.ones(1)}, 1)

    stats = server.aggregate_updates(round_num=1)
    assert stats["accepted_updates"] == 1
    assert stats["rejected_updates"]["invalid"]
