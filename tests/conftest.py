"""Backend regression tests must never read or modify the user's live state."""

import pytest


@pytest.fixture(autouse=True)
def isolated_state(tmp_path, monkeypatch):
    monkeypatch.setenv("COWORKER_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("COWORKER_SCRATCH_BASE", str(tmp_path / "scratch"))

