"""Snapshot model prices are estimates; missing prices stay unknown."""

import pytest

from coworker.providers.prices import estimate_cost, price_for


def test_prices_are_snapshot_estimates_unknown_is_not_free():
    model = "openrouter:nvidia/nemotron-3.5-lightning"
    assert price_for(model)["estimate"] is True
    assert price_for(model.replace("openrouter:", "openrouter-account:")) == price_for(model)
    assert estimate_cost(model, {"input":1_000_000, "output":1_000_000}) == pytest.approx(0.27)
    assert price_for("acme:unknown") is None
    assert estimate_cost("acme:unknown", {"input":500}) is None
