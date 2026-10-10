"""llama.cpp and vLLM as providers (providers/local_server.py, registry.py): the user's
own server through its /v1, what each reports about its model, and how the server's
model lists, liveness and adoption treat them."""

from __future__ import annotations

import json

import httpx
import pytest

from coworker import model_config
from coworker.providers import local_machine, local_server, ollama_facts
from coworker.providers.capabilities import capabilities_for
from coworker.providers.registry import get_descriptor, provider_descriptors
from coworker.providers.router import ProviderRouter

from session_fixtures import ScriptedProvider, manager


@pytest.fixture(autouse=True)
def _state(tmp_path, monkeypatch):
    monkeypatch.setenv("COWORKER_STATE_DIR", str(tmp_path / "state"))
    local_server.forget_all()


def _fake_http(monkeypatch, handler):
    fake = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(httpx, "get", lambda url, headers=None, timeout=None: fake.get(url, headers=headers))
    monkeypatch.setattr(httpx, "post", lambda url, json=None, headers=None, timeout=None: fake.post(url, json=json, headers=headers))


def test_descriptors_carry_a_kind_for_grouping():
    kinds = {d.name: d.kind for d in provider_descriptors()}
    assert kinds["ollama"] == kinds["llamacpp"] == kinds["vllm"] == "local"
    assert kinds["openai-codex"] == "subscription"
    assert kinds["openai"] == kinds["anthropic"] == "api_key"
    for name in ("llamacpp", "vllm"):
        d = get_descriptor(name)
        assert d is not None and not d.needs_key
        assert [f.key for f in d.fields] == ["base_url", "api_key"]
        assert not any(f.required for f in d.fields)
        assert capabilities_for(f"{name}:some/model").tools


def test_v1_base_takes_the_root_or_an_explicit_v1():
    assert local_server.v1_base("llamacpp", None) == "http://localhost:8080/v1"
    assert local_server.v1_base("llamacpp", "http://box.local:9000/") == "http://box.local:9000/v1"
    assert local_server.v1_base("vllm", "http://box.local:8000/v1") == "http://box.local:8000/v1"


def test_the_builder_sends_a_placeholder_key_when_none_is_set():
    client = get_descriptor("llamacpp").build({"base_url": "http://localhost:8080"}, None)
    assert client._base_url == "http://localhost:8080/v1"
    assert client._api_key == "none"
    client = get_descriptor("vllm").build({"base_url": "http://gpu:8000", "api_key": "s3"}, None)
    assert client._base_url == "http://gpu:8000/v1" and client._api_key == "s3"


def test_llamacpp_facts_come_from_models_and_props(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "/models/nemotron-3.5-lightning-30b-q4_k_m.gguf",
                                                         "meta": {"n_ctx_train": 1048576, "size": 25 * local_machine.GB}}]})
        if request.url.path == "/props":
            return httpx.Response(200, json={"default_generation_settings": {"n_ctx": 32768},
                                             "chat_template": "{% if tools %}...{% endif %}"})
        return httpx.Response(404)

    _fake_http(monkeypatch, handler)
    monkeypatch.setattr(local_machine, "model_memory_bytes", lambda: 96 * local_machine.GB)
    (row,) = local_server.model_facts("llamacpp", "http://localhost:8080")
    assert row["model"] == "llamacpp:/models/nemotron-3.5-lightning-30b-q4_k_m.gguf"
    assert row["context"] == 32768 and row["context_from"] == "server"
    assert row["context_max"] == 1048576 and row["tools"] is True
    assert row["fit"] == "runs_well" and row["recommendation"] == "NVIDIA Nemotron 3.5 Lightning"
    assert row["thinking"] is True  # from the recommendation table
    # Compaction sizes itself to the server's window.
    assert local_server.context_window_for(row["model"]) == 32768
    assert local_server.context_window_for("ollama:x") is None


def test_vllm_facts_probe_whether_tool_calling_is_on(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4", "max_model_len": 131072}]})
        if request.url.path == "/v1/chat/completions":
            calls.append(json.loads(request.content))
            return httpx.Response(400, json={"error": {"message": '"auto" tool choice requires --enable-auto-tool-choice and --tool-call-parser to be set'}})
        return httpx.Response(404)

    _fake_http(monkeypatch, handler)
    (row,) = local_server.model_facts("vllm", "http://gpu:8000", "k")
    assert row["tools"] is False and row["context"] == 131072
    assert calls[0]["max_tokens"] == 1 and calls[0]["tools"]
    assert local_server.alive("vllm", "http://gpu:8000", "k") is True


def test_the_server_offers_and_adopts_a_local_servers_model(tmp_path, monkeypatch):
    from coworker.server.manager import SessionManager

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    rows = [{"model": "llamacpp:/m/a.gguf", "name": "/m/a.gguf", "tools": True, "context": 32768}]
    monkeypatch.setattr(local_server, "model_facts", lambda name, base, key=None, fresh=False: rows)
    monkeypatch.setattr(local_server, "alive", lambda name, base, key=None: True)
    mgr = SessionManager(data_dir=tmp_path / "data")
    out = mgr.set_provider("llamacpp", {"base_url": "http://localhost:8080"})
    assert out["ok"]
    settings = mgr.get_settings()
    assert "llamacpp:/m/a.gguf" in settings["models"]
    assert mgr.model_selectable("llamacpp:/m/a.gguf")
    # A server started without tool calling offers nothing to the picker.
    rows[0]["tools"] = False
    assert mgr._local_server_models("llamacpp") == []


def test_thinking_switch_reaches_llama_cpp_and_vllm_as_template_kwargs(monkeypatch):
    """Ollama reads `think`; llama.cpp and vLLM read the chat template's enable_thinking."""
    from coworker.providers import openai_provider

    sent = {}
    monkeypatch.setattr(openai_provider.OpenAIProvider, "complete", lambda self, **kw: sent.update(kw) or "ok")
    for name in ("llamacpp", "vllm"):
        client = get_descriptor(name).build({}, None)
        client.complete(model="m", messages=[], max_tokens=10, extra_body={"think": False})
        assert sent["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}
        assert sent["max_tokens"] == 10
        sent.clear()
        client.complete(model="m", messages=[])
        assert "extra_body" not in sent
    assert local_server.thinking_as_template_kwargs(
        {"extra_body": {"think": True, "chat_template_kwargs": {"x": 1}}}
    ) == {"extra_body": {"chat_template_kwargs": {"x": 1, "enable_thinking": True}}}


def test_a_chat_template_with_enable_thinking_means_a_thinking_switch(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/models":
            return httpx.Response(200, json={"data": [{"id": "some-unlisted-model.gguf", "meta": {}}]})
        if request.url.path == "/props":
            return httpx.Response(200, json={"chat_template": "{% if enable_thinking %}<think>{% endif %}"})
        return httpx.Response(404)

    _fake_http(monkeypatch, handler)
    (row,) = local_server.model_facts("llamacpp", "http://localhost:8080", fresh=True)
    assert row["thinking"] is True and row["recommendation"] is None


@pytest.mark.parametrize("provider", ["ollama", "llamacpp", "vllm"])
def test_local_capabilities_guard_unsupported_thinking_on_actual_requests(monkeypatch, provider):
    model = provider + ":local"
    row = {"model": model, "thinking": False, "tools": False, "vision": True}
    facts = lambda *a, **kw: [row]
    monkeypatch.setattr(ollama_facts, "model_facts", facts)
    monkeypatch.setattr(local_server, "model_facts", facts)
    recorder = ScriptedProvider()
    recorder.stream = recorder.complete
    router = ProviderRouter()
    router._clients[provider] = recorder
    capabilities = router.capabilities(model)
    assert capabilities.tools is False and capabilities.vision is True
    settings = {"reasoning_effort": "high", "extra_body": {"think": True, "keep_alive": 60}}
    for call in (router.complete, router.stream):
        call(model=model, messages=[], **settings)
        assert recorder.calls[-1]["extra_body"] == {"keep_alive": 60}
        assert "reasoning_effort" not in recorder.calls[-1]
    assert settings["extra_body"]["think"] is True


def test_saved_context_reports_server_limit_in_settings(manager, monkeypatch):
    row = {"model": "vllm:local", "context": 8192, "tools": True, "thinking": False}
    monkeypatch.setattr(local_server, "model_facts", lambda *a, **kw: [row])
    result = manager.set_model_config("vllm:local", {"context_size": 32768})
    assert result["context_size"] == {"value": 32768, "from": "user"}
    assert result["runtime_context_size"] == 8192


def test_changing_local_endpoint_updates_engine_context_lookup(manager, monkeypatch):
    local_server.remember_server("vllm", "http://old:8000", None)
    manager.secrets.put("provider:vllm", {"base_url": "http://new:8000", "api_key": "local-key"})
    received = []
    def facts(name, base, key=None, **kwargs):
        received.append((name, base, key))
        return [{"name": "local", "context": 16384}]
    monkeypatch.setattr(local_server, "model_facts", facts)
    manager._refresh_provider("vllm")
    assert local_server.context_window_for("vllm:local") == 16384
    assert received[-1] == ("vllm", "http://new:8000", "local-key")


def test_local_listing_does_not_claim_missing_inference_route(monkeypatch):
    local_server.forget_all()
    monkeypatch.setattr(httpx, "get", lambda *a,**kw: httpx.Response(200,json={"data":[{"id":"m","max_model_len":32768}]}))
    monkeypatch.setattr(httpx, "post", lambda *a,**kw: httpx.Response(404,text="wrong route"))
    row=local_server.model_facts("vllm","http://gpu:8000")[0]
    assert row["inference_ready"] is False
