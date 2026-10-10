"""Snapshot prices. Unknown rates stay None; reseller rows identify a specific host."""
from functools import lru_cache
from pathlib import Path

import yaml


@lru_cache(maxsize=1)
def _prices() -> dict:
    with Path(__file__).with_name("prices.yaml").open(encoding="utf-8") as stream:
        return yaml.safe_load(stream).get("models", {})


def price_for(model: str) -> dict | None:
    if model.startswith("openrouter-account:"):
        model = "openrouter:" + model.split(":", 1)[1]
    row = _prices().get(model)
    return {**row, "currency": "USD", "per_tokens": 1_000_000, "estimate": True} if row else None


def estimate_cost(model: str, usage: dict) -> float | None:
    row = price_for(model)
    if row is None:
        return None
    total = 0.0
    for key in ("input", "output", "cache_read", "cache_write"):
        tokens = usage.get(key, 0) or 0
        if tokens and row.get(key) is None:
            return None
        total += tokens * (row.get(key) or 0) / 1_000_000
    return total
