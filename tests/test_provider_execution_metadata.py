"""Record the parameters actually sent, including retry/drop and streaming paths."""
from types import SimpleNamespace as NS

import pytest

from coworker.providers.anthropic_provider import AnthropicProvider
from coworker.providers.bedrock_provider import _BedrockConverseClient
from coworker.providers.codex_provider import CodexProvider
from coworker.providers.gemini_provider import GeminiProvider
from coworker.providers.openai_provider import OpenAIProvider
from coworker.providers.openai_responses import OpenAIResponsesProvider
from coworker.providers.registry import _build_openai


def result(provider, *, stream=False, **settings):
    kwargs = {"model": "test-model", "messages": [{"role": "user", "content": "task"}], **settings}
    if stream:
        return next(chunk.turn for chunk in provider.stream(**kwargs) if chunk.turn is not None)
    return provider.complete(**kwargs)


def chat_reply(stream=False):
    content = NS(content="partial", tool_calls=None)
    choice = NS(message=content, delta=content, index=0, finish_reason="length")
    response = NS(choices=[choice], usage=None)
    return [response] if stream else response


@pytest.mark.parametrize("stream", [False, True])
def test_compat_actual_parameters_after_effort_and_cap_rejections(stream):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        if "reasoning_effort" in kwargs:
            raise ValueError("Unsupported parameter: 'reasoning_effort'")
        if "max_tokens" in kwargs:
            raise ValueError("max_tokens is too large")
        return chat_reply(stream)

    provider = OpenAIProvider(client=NS(chat=NS(completions=NS(create=create))))
    turn = result(provider, stream=stream, max_tokens=23000, reasoning_effort="high")
    assert turn.finish_reason == "length" and turn.output_limit is None
    assert turn.effort["requested"] == "high" and turn.effort["effective"] is None
    assert "max_tokens" not in calls[-1] and "reasoning_effort" not in calls[-1]


@pytest.mark.parametrize("stream", [False, True])
def test_compat_renamed_cap_is_still_reported(stream):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        if "max_tokens" in kwargs:
            raise ValueError("'max_tokens' is not supported; use max_completion_tokens")
        return chat_reply(stream)

    provider = OpenAIProvider(client=NS(chat=NS(completions=NS(create=create))))
    turn = result(provider, stream=stream, max_tokens=23000)
    assert calls[-1]["max_completion_tokens"] == turn.output_limit == 23000


def test_compat_automatic_effort_is_recorded_with_tools():
    provider = OpenAIProvider(client=NS(chat=NS(completions=NS(create=lambda **kwargs: chat_reply()))))
    turn = provider.complete(model="gpt-5.6-sol", messages=[], tools=[{"type": "function", "function": {"name": "read_file", "parameters": {"type": "object"}}}])
    assert turn.effort["effective"] == "none" and turn.effort["requested"] is None


@pytest.mark.parametrize("stream", [False, True])
def test_responses_records_limit_and_rejected_effort(stream):
    calls = []
    response = NS(output=[{"type": "message", "content": [{"type": "output_text", "text": "partial"}]}], incomplete_details={"reason": "max_output_tokens"})

    def create(**kwargs):
        calls.append(kwargs)
        if "reasoning" in kwargs:
            raise ValueError("Unsupported parameter: 'reasoning.effort'")
        return [NS(type="response.incomplete", response=response)] if stream else response

    provider = OpenAIResponsesProvider(client=NS(responses=NS(create=create)))
    turn = result(provider, stream=stream, max_tokens=17000, reasoning_effort="high")
    assert turn.finish_reason == "length" and turn.output_limit == 17000
    assert turn.effort["requested"] == "high" and turn.effort["effective"] is None
    assert "reasoning" not in calls[-1]


def test_subscription_does_not_claim_a_cap_that_was_not_sent():
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return [NS(type="response.completed", response=NS(output=[], incomplete_details=None))]

    provider = CodexProvider(client=NS(responses=NS(create=create)))
    turn = result(provider, max_tokens=17000, reasoning_effort="high")
    assert "max_output_tokens" not in calls[0] and turn.output_limit is None
    assert turn.effort["effective"] == "high"


@pytest.mark.parametrize("stream", [False, True])
def test_anthropic_effort_fallback_reports_actual_request(stream):
    calls = []
    response = NS(content=[NS(type="text", text="partial")], stop_reason="max_tokens", usage=None)

    class MessageStream:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get_final_message(self):
            return response

    def open_stream(**kwargs):
        calls.append(kwargs)
        if "output_config" in kwargs:
            raise ValueError("Unsupported output_config.effort")
        if stream:
            return [NS(type="content_block_delta", delta=NS(type="text_delta", text="partial")), NS(type="message_delta", delta=NS(stop_reason="max_tokens"), usage=None)]
        return MessageStream()

    provider = AnthropicProvider(client=NS(messages=NS(create=open_stream, stream=open_stream)), thinking_budget=0)
    turn = provider.stream(model="claude-opus-4-6", messages=[{"role": "user", "content": "task"}], max_tokens=24000, reasoning_effort="high") if stream else None
    turn = next(chunk.turn for chunk in turn if chunk.turn is not None) if stream else provider.complete(model="claude-opus-4-6", messages=[{"role": "user", "content": "task"}], max_tokens=24000, reasoning_effort="high")
    assert turn.finish_reason == "length" and turn.output_limit == 24000
    assert turn.effort["requested"] == "high" and turn.effort["effective"] is None
    assert "output_config" not in calls[-1]


def test_anthropic_reasoning_budget_increases_and_records_actual_ceiling():
    provider = AnthropicProvider(thinking_budget=32000)
    kwargs = provider._request_kwargs(model="claude-sonnet-4-5", messages=[{"role": "user", "content": "task"}], tools=None, settings={"max_tokens": 16000})
    assert kwargs["max_tokens"] > kwargs["thinking"]["budget_tokens"] == 32000


@pytest.mark.parametrize("stream", [False, True])
def test_gemini_actual_limit_and_truncation(stream):
    response = NS(candidates=[NS(content=NS(parts=[NS(text="partial", thought=False)]), finish_reason="MAX_TOKENS")])
    client = NS(models=NS(generate_content=lambda **kwargs: response, generate_content_stream=lambda **kwargs: [response]))
    turn = result(GeminiProvider(client=client), stream=stream, max_tokens=18000)
    assert turn.finish_reason == "length" and turn.output_limit == 18000


@pytest.mark.parametrize("stream", [False, True])
def test_bedrock_actual_limit_and_truncation(stream):
    response = {"output": {"message": {"content": [{"text": "partial"}]}}, "stopReason": "max_tokens"}
    events = {"stream": [{"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": "partial"}}}, {"messageStop": {"stopReason": "max_tokens"}}]}
    client = NS(converse=lambda **kwargs: response, converse_stream=lambda **kwargs: events)
    turn = result(_BedrockConverseClient(client=client), stream=stream, max_tokens=19000)
    assert turn.finish_reason == "length" and turn.output_limit == 19000


@pytest.mark.parametrize("base_url", [None, "https://example.test/v1"])
def test_openai_saved_key_really_overrides_environment(base_url, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "env-value")
    provider = _build_openai({"api_key": "saved-value", "base_url": base_url}, None)
    assert provider._api_key == "saved-value"
