"""Provider credential sources and removal respect environment-variable fallback."""

import json

from session_fixtures import make_session_manager


def test_environment_key_source_and_removal_are_consistent(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-private")
    manager = make_session_manager(tmp_path, monkeypatch)
    row = next(p for p in manager.get_providers() if p["name"] == "openai")
    assert row["configured"] and row["key_source"] == "env" and row["env_key"] == "OPENAI_API_KEY"
    assert "env-private" not in json.dumps(row)
    assert not manager.remove_provider("openai")["ok"]
    manager.secrets.put("provider:openai", {"api_key": "stored-private"})
    assert next(p for p in manager.get_providers() if p["name"] == "openai")["key_source"] == "store"
    assert manager.remove_provider("openai")["key_source"] == "env"
