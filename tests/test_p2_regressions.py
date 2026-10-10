"""P2 behavior through the engine, persistence, API and local transports. No accounts required."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from coworker import model_config
from coworker.providers import local_server, ollama_context, ollama_facts
from coworker.providers.base import AssistantTurn, ModelCapabilities, ProviderClient, ToolCall
from coworker.providers.effort import anthropic_effort, openai_compat_effort
from coworker.providers.prices import price_for, estimate_cost
from coworker.providers.router import ProviderRouter
from coworker.server import SessionManager, create_app
from coworker.tools.ask import SKIP_SENTINEL, answer_result
from coworker.interactions import buttons_for, decode


class Recorder(ProviderClient):
    def __init__(self, turns=()):
        self.calls = []
        self.turns = list(turns)

    def complete(self, **kwargs):
        self.calls.append(kwargs)
        return self.turns.pop(0) if self.turns else AssistantTurn(text="done", finish_reason="stop")

    def capabilities(self, model):
        return ModelCapabilities()


@pytest.fixture
def manager(tmp_path, monkeypatch):
    monkeypatch.setattr(SessionManager, "_emit_session_created", lambda *a: None)
    monkeypatch.setattr(SessionManager, "_maybe_autotitle", lambda *a: None)
    monkeypatch.setattr(SessionManager, "_ollama_alive", lambda *a: False)
    monkeypatch.setattr(SessionManager, "_local_server_alive", lambda *a: False)
    monkeypatch.setattr(ollama_facts, "model_facts", lambda *a, **kw: [])
    monkeypatch.setattr(local_server, "model_facts", lambda *a, **kw: [])
    return SessionManager(workspace=tmp_path, data_dir=tmp_path / "data", provider=Recorder())


@pytest.mark.parametrize("resolution,expected", [
    (SKIP_SENTINEL, {"A": None, "B": None}),
    (json.dumps({"A": "中文答案", "B": SKIP_SENTINEL}), {"A": "中文答案", "B": None}),
    (json.dumps({"A": "中文答案", "B": None}), {"A": "中文答案", "B": None}),
])
def test_skip_is_explicit_and_preserves_other_answers(resolution, expected):
    result = answer_result([{"header": "A"}, {"header": "B"}], resolution)
    assert result["answers"] == expected
    assert result["skipped"] == [key for key, value in expected.items() if value is None]
    assert "Do not put this question back" in result["note"]
    assert answer_result([], SKIP_SENTINEL)["answer"] is None
    assert answer_result([], "")["answer"] == ""


def test_skip_releases_waiting_engine_and_is_mirrored(manager):
    async def scenario():
        provider = Recorder([AssistantTurn(tool_calls=[ToolCall(id="ask", name="ask_user", arguments={"question":"请选择地区", "options":["上海","北京"]})])])
        manager.provider = provider
        engine = manager.get_engine("skip", agent="cowork")
        async def drain():
            return [event async for event in engine.run("完成报告")]
        task = asyncio.create_task(drain())
        for _ in range(200):
            pending = manager.inbox.pending("skip")
            if pending:
                break
            await asyncio.sleep(0.01)
        assert pending
        button = next(b for b in buttons_for(pending[0]) if b.label == "Skip")
        item_id, resolution = decode(button.value)
        assert resolution == SKIP_SENTINEL
        assert manager.inbox.resolve(item_id, resolution)
        await asyncio.wait_for(task, 5)
        result = json.loads(next(m["content"] for m in engine.messages if m.get("tool_call_id") == "ask"))
        assert result["skipped"] is True and result["answer"] is None
        assert len(provider.calls) == 2
    asyncio.run(scenario())


@pytest.mark.parametrize("questions,options,label", [
    ([], [], "Skip"), ([], ["A"], "Skip"),
    ([{"question": "First"}, {"question": "Second"}], [], "Skip all questions"),
])
def test_mirror_can_decline_questions_with_or_without_options(questions, options, label):
    item = SimpleNamespace(id="q", kind="question", questions=questions, options=options)
    button = next(button for button in buttons_for(item) if button.label == label)
    assert decode(button.value) == ("q", SKIP_SENTINEL)
    result = answer_result(questions, decode(button.value)[1])
    assert result["skipped"]


def test_grouped_mirror_keeps_app_answer_hint_with_skip_button(manager):
    calls = []
    async def deliver(*args):
        calls.append(args)
    manager.gateway = SimpleNamespace(deliver_interactive=deliver)
    manager.inbox_routing.set_binding("default", channel="telegram", target="123")
    item = manager.inbox.add_question("s", "Questions", questions=[{"question": "First"}])
    asyncio.run(manager.mirror_inbox_item(item))
    assert calls[0][0] == "telegram:123"
    assert "Open the app to answer" in calls[0][1]
    assert decode(calls[0][2][0].value) == (item.id, SKIP_SENTINEL)


def test_model_settings_and_session_override_survive_restart_and_reach_provider(manager, tmp_path):
    model = "anthropic:claude-fable-5-1"
    values = {"context_size":90000, "max_output_tokens":7000, "reasoning_effort":"high", "temperature":0.4, "top_p":0.9, "compaction_threshold_pct":0.6, "default":True}
    assert manager.set_model_config(model, values)["ok"]
    engine = manager.get_engine("persist", agent="cowork")
    assert manager.set_session_model_settings("persist", {"reasoning_effort":"low"})["ok"]
    asyncio.run(_run(engine))
    assert manager.provider.calls[-1]["reasoning_effort"] == "low"
    assert manager.provider.calls[-1]["max_tokens"] == 7000
    assert engine._compaction_config()["context_window"] == 90000
    assert engine._compaction_config()["threshold_pct"] == 0.6
    manager.save("persist", engine)
    rebuilt = SessionManager(workspace=tmp_path, data_dir=tmp_path / "data", provider=Recorder())
    restored = rebuilt.get_engine("persist", agent="cowork")
    assert rebuilt.model == model and restored.model_settings["reasoning_effort"] == "low"
    assert rebuilt.set_session_model_settings("persist", {"reasoning_effort":None})["ok"]
    assert restored.model_settings["reasoning_effort"] == "high"
    restored.switch_model("ollama:qwen3-coder:30b")
    rebuilt.apply_model_settings("persist")
    assert "reasoning_effort" not in restored.model_settings
    assert restored.model_settings["max_tokens"] == 16384


async def _run(engine):
    return [event async for event in engine.run("test")]


def test_api_validates_configuration_and_running_session(manager):
    engine = manager.get_engine("s", agent="cowork")
    with TestClient(create_app(manager)) as client:
        body = {"model": "anthropic:claude-fable-5-1", "values": {"max_output_tokens":4096}}
        assert client.post("/v1/settings/model-config", json=body).json()["ok"]
        cfg = client.get("/v1/settings/model-config", params={"model":body["model"]}).json()
        assert cfg["max_output_tokens"] == {"value":4096, "from":"user"}
        assert cfg["top_p"] == {"value":None, "from":"provider"}
        assert not client.post("/v1/settings/model-config", json={"model":"m", "values":[]}).json()["ok"]
        assert not client.post("/v1/settings/model-config", json={"model":42, "values":{}}).json()["ok"]
        assert not client.post("/v1/settings/model-config", json={"model":"m", "values":{"thinking":True}}).json()["ok"]
        manager.try_mark_running("s")
        before = dict(engine.model_settings)
        assert not client.post("/v1/sessions/s/model-settings", json={"reasoning_effort":"low"}).json()["ok"]
        assert engine.model_settings == before
        manager.mark_idle("s")
        assert client.post("/v1/settings/model-config/remove", json={"model":body["model"]}).json()["ok"]
        assert client.get("/v1/settings/model-config", params={"model":body["model"]}).json()["max_output_tokens"]["from"] == "provider"


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), "0.8", True])
def test_invalid_sampling_values_never_reach_saved_config(bad):
    assert model_config.set("m", {"temperature":bad})[1]
    assert not model_config.get("m")


def test_none_effort_does_not_enter_rank_mapping():
    assert anthropic_effort("claude-fable-5-1", "none", budget_mode=False).params == {}
    assert openai_compat_effort("gpt-5.6-sol", "none").params == {"reasoning_effort":"none"}
    assert openai_compat_effort("moonshotai/Kimi-K3", "none").effective == "low"
    assert ollama_context.to_native_chat({"reasoning_effort":"none"}, 32768)["think"] is False


def test_prices_are_snapshot_estimates_unknown_is_not_free():
    model = "openrouter:nvidia/nemotron-3.5-lightning"
    assert price_for(model)["estimate"] is True
    assert price_for(model.replace("openrouter:", "openrouter-account:")) == price_for(model)
    assert estimate_cost(model, {"input":1_000_000, "output":1_000_000}) == pytest.approx(0.27)
    assert price_for("acme:unknown") is None
    assert estimate_cost("acme:unknown", {"input":500}) is None


def test_ollama_user_context_is_bounded_and_errors_are_not_success(monkeypatch):
    model_config.set("ollama:local", {"context_size":131072})
    monkeypatch.setenv("OPENWORKER_OLLAMA_NUM_CTX", "32768")
    requests=[]
    def handler(request):
        requests.append(request)
        if request.url.path == "/api/show":
            return httpx.Response(200,json={"model_info":{"local.context_length":65536}})
        return httpx.Response(200,content=b'{"error":"context exceeded","message":{"content":"partial"}}\n')
    transport = ollama_context.OllamaContextTransport(inner=httpx.MockTransport(handler))
    with httpx.Client(transport=transport) as client:
        response=client.post("http://localhost:11434/v1/chat/completions",json={"model":"local","messages":[{"role":"user","content":"full prompt"}],"stream":True})
        assert '"error"' in response.text
    body=json.loads(requests[-1].content)
    assert body["options"]["num_ctx"] == 32768 and body["shift"] is False
    assert body["messages"][0]["content"] == "full prompt"
    assert ollama_context.context_window_for("ollama:local") == 32768


def test_ollama_nonstream_native_error_is_not_an_empty_completion():
    transport = ollama_context.OllamaContextTransport(
        num_ctx=32768, inner=httpx.MockTransport(lambda request:
            httpx.Response(200, json={"error": "model failed to load"})),
    )
    with httpx.Client(transport=transport) as client:
        response = client.post("http://localhost:11434/v1/chat/completions",
                               json={"model": "local", "messages": []})
    assert response.status_code == 500
    assert response.json()["error"]["message"] == "model failed to load"


@pytest.mark.parametrize("provider", ["ollama", "llamacpp", "vllm"])
def test_local_capabilities_guard_unsupported_thinking_on_actual_requests(monkeypatch, provider):
    model = provider + ":local"
    row = {"model": model, "thinking": False, "tools": False, "vision": True}
    facts = lambda *a, **kw: [row]
    monkeypatch.setattr(ollama_facts, "model_facts", facts)
    monkeypatch.setattr(local_server, "model_facts", facts)
    recorder = Recorder()
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
