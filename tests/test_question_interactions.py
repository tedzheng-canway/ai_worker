"""Question skipping, grouped answers and connector mirrors use the same resolution."""

import asyncio
import json
from types import SimpleNamespace

import pytest

from coworker.interactions import buttons_for, decode
from coworker.providers.base import AssistantTurn, ToolCall
from coworker.tools.ask import SKIP_SENTINEL, answer_result

from session_fixtures import ScriptedProvider, manager


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
        provider = ScriptedProvider([AssistantTurn(tool_calls=[ToolCall(id="ask", name="ask_user", arguments={"question":"请选择地区", "options":["上海","北京"]})])])
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
