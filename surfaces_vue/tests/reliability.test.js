import test from 'node:test';
import assert from 'node:assert/strict';
import { historyItems, truncatedText } from '../src/history.js';
import { transcriptGroups } from '../src/sessionState.js';
import { ManualRuns } from '../src/manualRuns.js';

test('restored continuations and compaction records retain status and assistant metadata', () => {
  const record = { boundary_index: 7, summary_text: '任务摘要', working_state: '字段已核对', transcript_path: 'D:\\workspace\\历史.md', model_used: 'test:model' };
  const rows = historyItems([
    { role: 'user', content: '原始任务' },
    { role: 'assistant', content: null, finish_reason: 'length', max_output_tokens: 16000, reasoning_effort: { requested: 'high', effective: 'medium' } },
    { role: 'user', content: 'internal continuation prompt', _display: { kind: 'continuation', attempt: 1 } },
    { role: 'notice', kind: 'compacted', compaction: record },
    { role: 'notice', kind: 'truncated', text: 'server text' },
  ]);
  assert.deepEqual(rows.map(row => row.kind), ['user', 'assistant', 'continuation', 'compaction', 'notice']);
  assert.equal(rows[1].maxOutputTokens, 16000);
  assert.equal(rows[1].reasoningEffort.effective, 'medium');
  assert.equal(rows[3].record, record);
  assert.equal(rows[4].text, truncatedText);
  assert.equal(rows[4].retriable, true);
  assert.deepEqual(transcriptGroups(rows).map(row => row.kind), rows.map(row => row.kind));
  assert.equal(JSON.stringify(rows).includes('internal continuation prompt'), false);
});

test('a truncated or sleeping manual run never reports success', async () => {
  for (const status of ['truncated', 'sleeping']) {
    let finalized = 0;
    const runs = new ManualRuns({ finalize: async () => { finalized++; return { ok: true }; } });
    runs.track({ session_id: 's', task_id: 't', run_id: 'r' });
    await runs.event('s', { type: 'turn_start' });
    await runs.event('s', { type: 'turn_end', data: { status } });
    await runs.event('s', { type: 'turn_done' });
    assert.equal(finalized, 0);
    assert.equal(runs.entries.get('s').state, 'failed');
  }
});
