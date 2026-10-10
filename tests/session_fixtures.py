"""Isolated session managers and scripted providers for backend integration tests."""

import pytest

from coworker.providers import local_server, ollama_facts
from coworker.providers.base import AssistantTurn, ModelCapabilities, ProviderClient
from coworker.server.manager import SessionManager


class ScriptedProvider(ProviderClient):
    def __init__(self, turns=()):
        self.turns = list(turns)
        self.calls = []

    def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self.turns.pop(0) if self.turns else AssistantTurn(text="done", finish_reason="stop")

    def capabilities(self, model):
        return ModelCapabilities()


def make_session_manager(tmp_path, monkeypatch, provider=None):
    monkeypatch.setattr(SessionManager, "_emit_session_created", lambda *args: None)
    monkeypatch.setattr(SessionManager, "_maybe_autotitle", lambda *args: None)
    return SessionManager(data_dir=tmp_path / "state", provider=provider or ScriptedProvider())


@pytest.fixture
def manager(tmp_path, monkeypatch):
    monkeypatch.setattr(SessionManager, "_emit_session_created", lambda *a: None)
    monkeypatch.setattr(SessionManager, "_maybe_autotitle", lambda *a: None)
    monkeypatch.setattr(SessionManager, "_ollama_alive", lambda *a: False)
    monkeypatch.setattr(SessionManager, "_local_server_alive", lambda *a: False)
    monkeypatch.setattr(ollama_facts, "model_facts", lambda *a, **kw: [])
    monkeypatch.setattr(local_server, "model_facts", lambda *a, **kw: [])
    return SessionManager(workspace=tmp_path, data_dir=tmp_path / "data", provider=ScriptedProvider())
