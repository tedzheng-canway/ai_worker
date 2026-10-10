"""Runtime discovery reports project facts without reading secrets or following symlinks."""

import json
from pathlib import Path

import pytest

from coworker.runtime_context import capture


def test_runtime_discovery_never_opens_config_or_follows_project_symlinks(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("TOP_SECRET=private-value", encoding="utf-8")
    (tmp_path / "pyproject.toml").write_text("private-value", encoding="utf-8")
    (tmp_path / "surfaces_vue").mkdir()
    (tmp_path / "surfaces_vue" / "package.json").write_text("private-value", encoding="utf-8")
    monkeypatch.setattr(Path, "read_text", lambda *args, **kwargs: pytest.fail("discovery read file content"))
    facts = capture(tmp_path, [(tmp_path, True)])
    assert facts["project_entries"]["pyproject.toml"]
    assert facts["project_entries"]["surfaces_vue/package.json"]
    assert "private-value" not in json.dumps(facts) and ".env" not in json.dumps(facts)
    assert all(isinstance(value, bool) for value in facts["tools_available"].values())
    original = Path.is_symlink
    monkeypatch.setattr(Path, "is_symlink", lambda self: self.name == "surfaces_vue" or original(self))
    assert not capture(tmp_path, [])["project_entries"]["surfaces_vue/package.json"]
