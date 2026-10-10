const { fixture, server, chromium, expect, assert } = require('./p0.browser.cjs');
const path = require('node:path');

function setup(state) {
  state.settings.onboarded = true;
  state.settings.model_ready = true;
  state.providers = [{ name: 'test', title: 'Test Provider', configured: true, needs_key: true, key_source: 'env', env_key: 'TEST_API_KEY', fields: [{ key: 'api_key', label: 'API 密钥', secret: true, required: true }] }];
  state.history = [];
  state.connectors = [{ name: 'telegram', title: 'Telegram', connected: true, two_way: true, account: 'Bot', allowed_users: [], approval_owner_ids: [], tools: [] }];
  state.extraRoute = (url, body, req) => {
    if (url.pathname === '/v1/providers') return state.providers;
    if (url.pathname.endsWith('/messages')) return { messages: state.history };
    if (url.pathname.endsWith('/artifacts/read')) return { ok: true, kind: 'markdown', path: 'D:/workspace/history.md', name: 'history.md', content: '原始任务细节' };
    if (url.pathname === '/v1/connectors') return { connectors: state.connectors };
    if (url.pathname === '/v1/cloud/status') return { signed_in: false };
    if (url.pathname.includes('/telegram/approval-owners/')) {
      const telegram = state.connectors[0];
      telegram.approval_owner_ids = url.pathname.endsWith('/add') ? [...telegram.approval_owner_ids, body.user_id] : telegram.approval_owner_ids.filter(id => id !== body.user_id);
      return { ok: true };
    }
  };
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.P0_BROWSER_CHANNEL || 'msedge', headless: true });
  const base = 'http://127.0.0.1:' + server.address().port;
  let count = 0;
  async function check(name, fn, configure = () => {}) {
    const f = await fixture(browser, base, state => { setup(state); configure(state); });
    try { await fn(f); await f.close(); console.log('PASS ' + (++count) + ': ' + name); }
    catch (error) { await f.page.screenshot({ path: path.join(__dirname, '../dist/reliability-failure.png'), fullPage: true }); throw error; }
  }
  try {
    await check('live continuation, actual budgets and exhausted output remain retryable', async ({ page, state }) => {
      state.emit('s1', 'turn_start', { input: '完成任务' });
      state.emit('s1', 'assistant_message', { text: '部分结果', finish_reason: 'length', max_output_tokens: 16000, reasoning_effort: { requested: 'high', effective: 'medium' } });
      state.emit('s1', 'continuation', { attempt: 1 });
      await expect(page.getByText('输出达到上限，正在续接')).toBeVisible();
      await expect(page.getByText('实际输出上限：16000 tokens')).toBeVisible();
      await expect(page.getByText('推理强度：medium (请求：high)')).toBeVisible();
      state.emit('s1', 'turn_end', { status: 'truncated' });
      state.emit('s1', 'turn_done');
      await expect(page.getByText(/输出多次达到上限，任务尚未完成/)).toBeVisible();
      await page.locator('.notice-line').getByRole('button', { name: '重试', exact: true }).click();
      await expect.poll(() => state.sent.filter(row => row.type === 'retry').length).toBe(1);
    });
    await check('compaction details and full transcript survive reopening a session', async ({ page, state }) => {
      const record = { boundary_index: 12, summary_text: '## 任务摘要\n保存所有字段。', working_state: '已写入报告，等待复核。', user_messages: ['输出到 D:/报告.csv'], user_messages_dropped: 3, model_used: 'test:summary', transcript_path: 'D:/workspace/history.md' };
      state.emit('s1', 'compacted', { text: 'Context compacted', compaction: record });
      await page.getByTestId('compaction-record').locator('summary').first().click();
      await expect(page.getByText('保存所有字段。')).toBeVisible();
      await expect(page.getByText('已写入报告，等待复核。')).toBeVisible();
      await expect(page.getByText(/test:summary/)).toBeVisible();
      await page.getByRole('button', { name: '查看原始历史' }).click();
      await expect.poll(() => state.requests.some(row => row.path.endsWith('/artifacts/read') && row.query.includes('history.md'))).toBe(true);
      await expect(page.locator('.artifact-panel')).toContainText('原始任务细节');
      state.history = [{ role: 'notice', kind: 'compacted', compaction: record }, { role: 'user', content: 'internal nudge', _display: { kind: 'continuation', attempt: 2 } }, { role: 'notice', kind: 'truncated' }];
      await page.reload();
      await page.getByTestId('compaction-record').locator('summary').first().click();
      await expect(page.getByText('保存所有字段。')).toBeVisible();
      await expect(page.getByText('internal nudge')).toHaveCount(0);
      await expect(page.getByText(/输出达到上限，正在续接/)).toContainText('(2/2)');
      await expect(page.locator('.notice-line').getByRole('button', { name: '重试', exact: true })).toBeEnabled();
      await page.setViewportSize({ width: 430, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    });
    await check('environment key source hides removal and saved key restores removal', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.locator('.subnav').getByRole('button', { name: '模型', exact: true }).click();
      await page.getByTestId('provider-test').click();
      await expect(page.getByTestId('provider-key-source')).toContainText('TEST_API_KEY');
      await expect(page.getByRole('button', { name: '移除密钥…' })).toHaveCount(0);
      state.providers[0].key_source = 'store';
      await page.locator('.subnav').getByRole('button', { name: '通用', exact: true }).click();
      await page.locator('.subnav').getByRole('button', { name: '模型', exact: true }).click();
      await page.getByTestId('provider-test').click();
      await expect(page.getByRole('button', { name: '移除密钥…' })).toBeVisible();
      await expect(page.getByText('密钥已保存在本机。')).toBeVisible();
    });
    await check('Telegram approval owners can be added and removed through the Vue account view', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '连接器' }).click();
      await page.locator('.connector-card').filter({ hasText: 'Telegram' }).click();
      await expect(page.getByText('群组审批须指定负责人；私聊默认仅允许绑定聊天的本人审批。')).toBeVisible();
      await page.getByLabel('人员 Bot').fill('99');
      await page.getByRole('button', { name: '将输入人员设为审批负责人' }).click();
      await expect(page.getByRole('button', { name: '移除审批负责人' })).toBeVisible();
      assert.deepEqual(state.requests.find(row => row.path.endsWith('/telegram/approval-owners/add')).body, { user_id: '99' });
      await page.getByRole('button', { name: '移除审批负责人' }).click();
      await expect(page.getByText('尚未指定审批负责人')).toBeVisible();
      assert.deepEqual(state.requests.find(row => row.path.endsWith('/telegram/approval-owners/remove')).body, { user_id: '99' });
    });
    console.log(count + ' P0/P1 reliability browser scenarios passed.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
