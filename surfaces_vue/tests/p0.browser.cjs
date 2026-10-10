// Reuse the reference frontend's existing Playwright installation; no backend is started.
const { chromium, expect } = require('../../surfaces/gui/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../dist');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + (req.url === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function fixture(browser, base, configure) {
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const state = {
    settings: { model: 'test:one', models: ['test:one', 'test:two'], sessions_peek: 2, auto_approve: true, context_bar: true,
      model_context_windows: { 'test:one': 1000 }, pdf_fallback: 'text', pdf_max_pages: 20, pdf_max_mb: 10,
      compaction_threshold_pct: 0.8, compaction_cap_tokens: 250000, compaction_model: '' },
    personas: [{ id: 'cowork', name: 'Coworker', enabled: true }, { id: 'chat', name: 'Chat', enabled: true }],
    sessions: [1, 2, 3, 4].map((n) => ({ session_id: `s${n}`, title: `会话 ${n}`, agent: 'cowork', workspace: '', model: 'test:one', mode: 'interactive' })),
    sockets: new Map(), sent: [], requests: [], finalized: 0, rejectCompaction: false, rejectPdf: false, rejectMcp: false,
    task: { id: 'task-1', title: '日报', instructions: '生成报告', enabled: true, schedule: '每天', run_count: 0, workspace: 'D:/project', agent: 'cowork' },
    runs: [],
  };
  configure?.(state);
  await page.addInitScript(() => {
    window.__COWORKER_HTTP__ = 'http://127.0.0.1:9876';
    window.__COWORKER_WS__ = 'ws://127.0.0.1:9876';
    window.__COWORKER_API_TOKEN__ = 'test-token';
  });
  await page.route('http://127.0.0.1:9876/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData() ? req.postDataJSON() : {};
    state.requests.push({ path: url.pathname, query: url.search, method: req.method(), body, headers: req.headers() });
    let result = { ok: true };
    const p = url.pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    const extra = await state.extraRoute?.(url, body, req);
    if (extra !== undefined) result = extra;
    else if (p === '/v1/health') result = { model: state.settings.model };
    else if (p === '/v1/settings') result = state.settings;
    else if (p === '/v1/personas') result = { personas: state.personas };
    else if (p.startsWith('/v1/personas/')) { Object.assign(state.personas.find((p) => p.id === url.pathname.split('/').at(-1)), body); result = { ok: true, personas: state.personas }; }
    else if (p === '/v1/providers') result = [];
    else if (p === '/v1/skills') result = { skills: [] };
    else if (p === '/v1/memory') result = { memory: [] };
    else if (p === '/v1/memory/settings') result = { enabled: true, user_rules: '' };
    else if (p === '/v1/sessions') result = { sessions: state.sessions };
    else if (p.endsWith('/messages')) result = { messages: p.includes('/s1/') ? [
      { role: 'assistant', usage: { model: 'test:one', input: 100, cache_read: 200 }, tool_calls: [{ id: 'denied-1', function: { name: 'run_shell', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'denied-1', content: 'blocked', _display: { approval_origin: 'reviewer_denied', approval_note: '风险过高', approval_grant: 'deny' } },
    ] : [] };
    else if (p === '/v1/settings/compaction' || p === '/v1/settings/pdf') {
      const rejected = p.endsWith('/compaction') ? state.rejectCompaction : state.rejectPdf;
      result = rejected ? { ok: false, error: '保存被拒绝' } : { ok: true, ...body };
      if (!rejected) Object.assign(state.settings, body);
    } else if (p === '/v1/settings/default-model') state.settings.model = body.model;
    else if (p === '/v1/settings/models/remove') state.settings.models = state.settings.models.filter((m) => m !== body.model);
    else if (p.startsWith('/v1/settings/')) Object.assign(state.settings, body);
    else if (p === '/v1/connectors') result = { connectors: [] };
    else if (p === '/v1/mcp') result = req.method() === 'GET' ? { servers: [] } : state.rejectMcp ? { ok: false, error: 'MCP 添加失败' } : { ok: true };
    else if (p === '/v1/automations') result = { tasks: [state.task] };
    else if (p === '/v1/automations/task-1') result = { task: state.task, runs: state.runs };
    else if (p === '/v1/automations/task-1/run') {
      state.runs.push({ run_id: 'run-1', session_id: '__run__run-1', status: 'running', started_at: Date.now() / 1000 });
      result = { ok: true, run_id: 'run-1', session_id: '__run__run-1', workspace: 'D:/project', agent: 'cowork', prompt: '生成报告' };
    } else if (p.endsWith('/finalize')) { state.finalized++; state.task.run_count++; state.task.last_status = 'ok'; state.runs[0].status = 'ok'; }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) });
  });
  await page.routeWebSocket('ws://127.0.0.1:9876/**', (ws) => {
    const id = decodeURIComponent(new URL(ws.url()).pathname.split('/').at(-1));
    state.sockets.set(id, ws);
    ws.onMessage((raw) => {
      const message = JSON.parse(raw);
      state.sent.push({ id, ...message });
      if (message.type === 'user_message') ws.send(JSON.stringify({ type: 'turn_start', data: { input: message.text } }));
    });
    ws.onClose(() => state.sockets.delete(id));
    ws.send(JSON.stringify({ type: 'ready', data: { running: false, model: state.sessions.find((s) => s.session_id === id)?.model || state.settings.model, mode: 'interactive', ...(state.ready || {}) } }));
  });
  state.emit = (id, type, data = {}) => state.sockets.get(id).send(JSON.stringify({ type, data }));
  await page.goto(base);
  if (state.waitForStartup) await state.waitForStartup(page);
  else {
    await expect(page.locator('.session-row')).toHaveCount(2);
    await expect.poll(() => state.sockets.has(state.sessions[0].session_id)).toBe(true);
  }
  return { page, state, close: async () => { assert.deepEqual(errors, []); await context.close(); } };
}

module.exports = { fixture, server, chromium, expect, assert };
if (require.main === module) (async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.P0_BROWSER_CHANNEL || 'msedge', headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  let count = 0;
  async function check(name, fn) {
    const f = await fixture(browser, base);
    try { await fn(f); await f.close(); console.log(`PASS ${++count}: ${name}`); }
    catch (error) { await f.page.screenshot({ path: path.join(__dirname, '../dist/p0-failure.png') }); throw error; }
  }
  try {
    await check('settings reject failed saves; compression/PDF payloads and values round-trip', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.locator('.subnav').getByRole('button', { name: '上下文', exact: true }).click();
      const pct = page.getByLabel('触发阈值（%）');
      await expect(pct).toHaveValue('80');
      state.rejectCompaction = true;
      await pct.fill('85');
      await page.getByRole('button', { name: '保存压缩设置' }).click();
      await expect(page.getByRole('alert')).toContainText('保存被拒绝');
      await expect(page.locator('.save-toast')).toHaveCount(0);
      await expect(pct).toHaveValue('85');
      state.rejectCompaction = false;
      await page.getByRole('button', { name: '保存压缩设置' }).click();
      await expect(page.locator('.save-toast')).toContainText('已保存');
      assert.equal(state.settings.compaction_threshold_pct, 0.85);
      await page.getByLabel('回退模式').selectOption('images');
      await page.getByLabel('最大页数').fill('30');
      state.rejectPdf = true;
      await page.getByRole('button', { name: '保存 PDF 设置' }).click();
      await expect(page.getByRole('alert')).toContainText('保存被拒绝');
      await expect(page.locator('.save-toast')).toHaveCount(0);
      state.rejectPdf = false;
      await page.getByRole('button', { name: '保存 PDF 设置' }).click();
      await expect(page.locator('.save-toast')).toContainText('已保存');
      assert.equal(state.settings.pdf_fallback, 'images');
      await page.reload();
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.locator('.subnav').getByRole('button', { name: '上下文', exact: true }).click();
      await expect(pct).toHaveValue('85');
      await expect(page.getByLabel('回退模式')).toHaveValue('images');
      await expect(page.getByLabel('最大页数')).toHaveValue('30');
    });
    await check('MCP preserves paths/arguments and failed form input', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '连接器' }).click();
      await page.getByRole('button', { name: '＋ 自定义 MCP' }).click();
      await page.getByLabel('服务器名称').fill('local-test');
      await page.getByLabel('可执行程序').fill('C:\\Program Files\\node.exe');
      await page.getByLabel('启动参数（每行一个）').fill('-y\npackage-name\nD:\\My Project');
      state.rejectMcp = true;
      await page.getByRole('button', { name: '添加服务器', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('MCP 添加失败');
      await expect(page.getByLabel('可执行程序')).toHaveValue('C:\\Program Files\\node.exe');
      const req = state.requests.filter((r) => r.path === '/v1/mcp' && r.method === 'POST').at(-1);
      assert.deepEqual(req.body.config.args, ['-y', 'package-name', 'D:\\My Project']);
      state.rejectMcp = false;
      await page.getByRole('button', { name: '添加服务器', exact: true }).click();
      await expect(page.getByLabel('服务器名称')).toHaveCount(0);
    });
    await check('history denial, live usage, sidebar count and settings synchronization', async ({ page, state }) => {
      await expect(page.locator('.turn-summary')).toContainText('已拒绝');
      await expect(page.locator('.tool-turn')).not.toHaveAttribute('open', '');
      await page.locator('.turn-summary').click();
      await expect(page.getByTestId('reviewer-deny-card')).toContainText('风险过高');
      await expect(page.getByTestId('usage-chip')).toContainText('30%');
      await page.getByTestId('usage-chip').click();
      await expect(page.getByRole('progressbar', { name: '上下文使用进度' })).toHaveAttribute('aria-valuenow', '30');
      await expect(page.locator('.usage-metrics')).toContainText('200');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('usage-popover')).toHaveCount(0);
      state.emit('s1', 'assistant_message', { text: 'hello', usage: { model: 'test:one', input: 500 } });
      await expect(page.getByTestId('usage-chip')).toContainText('50%');
      await page.getByRole('button', { name: '显示更多（2）' }).click();
      await expect(page.locator('.session-row')).toHaveCount(4);
      state.emit('s1', 'ready', { running: false, model: 'test:one', mode: 'auto-approve' });
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.getByLabel('每组显示会话数').fill('1');
      await page.getByLabel('每组显示会话数').blur();
      await expect(page.locator('.session-row')).toHaveCount(1);
      await page.getByLabel('启用自动审批模式').uncheck();
      await expect.poll(() => state.sent.some((e) => e.id === 's1' && e.type === 'set_mode' && e.mode === 'interactive')).toBeTruthy();
      await page.getByLabel('显示上下文使用进度').uncheck();
      await expect(page.locator('.save-toast')).toBeVisible();
      await page.locator('.session-row').first().click();
      await expect(page.locator('.usage-ring')).toHaveCount(0);
      await expect(page.getByTestId('usage-chip')).toContainText('300');
      await page.getByRole('button', { name: '选择权限模式' }).click();
      await expect(page.getByRole('option').filter({ hasText: '自动审批' })).toHaveCount(0);
    });
    await check('model removal/default and persona changes reach the composer', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.locator('.subnav').getByRole('button', { name: '模型', exact: true }).click();
      await page.locator('.provider-model-row').filter({ hasText: 'test:two' }).getByRole('button', { name: '设为默认' }).click();
      await expect.poll(() => state.settings.model).toBe('test:two');
      await page.locator('.new-button').click();
      await expect(page.getByRole('button', { name: '选择模型' })).toContainText('two');
      await page.locator('.surface-nav').getByRole('button', { name: '设置' }).click();
      await page.locator('.subnav').getByRole('button', { name: '模型', exact: true }).click();
      await page.locator('.provider-model-row').filter({ hasText: 'test:one' }).getByRole('checkbox').uncheck();
      await expect.poll(() => state.settings.models).toEqual(['test:two']);
      await page.locator('.subnav').getByRole('button', { name: '智能体', exact: true }).click();
      await page.locator('.list-card').filter({ hasText: 'Chat' }).locator('input').uncheck();
      await expect.poll(() => state.personas[1].enabled).toBe(false);
      await page.locator('.new-button').click();
      await page.getByRole('button', { name: '选择智能体' }).click();
      await expect(page.getByRole('option').filter({ hasText: 'Chat' })).toHaveCount(0);
    });
    await check('manual run survives switching conversations and finalizes once', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '自动化' }).click();
      await page.getByRole('button').filter({ hasText: '日报' }).click();
      await page.getByRole('button', { name: '立即运行', exact: true }).click();
      await expect.poll(() => state.sent.some((e) => e.id === '__run__run-1' && e.type === 'user_message')).toBeTruthy();
      await expect(page.locator('.stop-button')).toBeVisible();
      await page.locator('.session-row').first().click();
      state.emit('__run__run-1', 'assistant_message', { text: 'report done' });
      state.emit('__run__run-1', 'turn_end', { status: 'completed' });
      state.emit('__run__run-1', 'turn_done');
      state.emit('__run__run-1', 'turn_done');
      await expect.poll(() => state.finalized).toBe(1);
      await expect(page.locator('.transcript')).not.toContainText('report done');
      await page.locator('.surface-nav').getByRole('button', { name: '自动化' }).click();
      await expect(page.locator('.list-card')).toContainText('1 次运行');
    });
    await check('failed manual run does not call the success-only endpoint', async ({ page, state }) => {
      await page.locator('.surface-nav').getByRole('button', { name: '自动化' }).click();
      await page.getByRole('button').filter({ hasText: '日报' }).click();
      await page.getByRole('button', { name: '立即运行', exact: true }).click();
      await expect.poll(() => state.sent.some((e) => e.id === '__run__run-1' && e.type === 'user_message')).toBeTruthy();
      state.emit('__run__run-1', 'error', { error: '模型不可用' });
      state.emit('__run__run-1', 'turn_done');
      await expect(page.locator('.status-note')).toContainText('未上报成功');
      assert.equal(state.finalized, 0);
    });
    console.log(`${count} browser regression scenarios passed.`);
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); server.close(); process.exitCode = 1; });
