import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIP_SENTINEL, skipRemaining, resolutionLabel } from '../src/question-answers.js';
test('skip remaining preserves answers and represents each unanswered question explicitly', () => {
  const specs=[{header:'A',question:'first'},{question:'第二题'},{header:'C',question:'third'}];
  assert.deepEqual(skipRemaining(specs,{A:'上海'}),{A:'上海','第二题':SKIP_SENTINEL,C:SKIP_SENTINEL});
});
test('resolved questions show readable skip labels in Inbox', () => {
  assert.equal(resolutionLabel(SKIP_SENTINEL),'已跳过');
  assert.equal(resolutionLabel('{"A":"上海","B":"__ocw_skip__"}'),'A: 上海；B: 已跳过');
  assert.equal(resolutionLabel('plain answer'),'plain answer');
});
