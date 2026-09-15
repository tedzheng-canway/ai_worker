<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { deleteSession, getHealth, getMessages, getPersonas, getSessions, getSettings, setSessionFlags, Session } from "./api";
import AuditView from "./components/AuditView.vue";
import AutomationsView from "./components/AutomationsView.vue";
import BoardView from "./components/BoardView.vue";
import ConnectorsView from "./components/ConnectorsView.vue";
import SettingsView from "./components/SettingsView.vue";

const newId = () => crypto.randomUUID?.().slice(0, 12) || Math.random().toString(36).slice(2, 14);
const sessions = ref([]);
const personas = ref([]);
const messages = ref([]);
const sessionId = ref(newId());
const agent = ref("cowork");
const workspace = ref("");
const model = ref("gpt-5.6-sol");
const models = ref([]);
const mode = ref("interactive");
const draft = ref("");
const connected = ref(false);
const running = ref(false);
const streaming = ref("");
const status = ref("正在连接本地服务…");
const sidebarOpen = ref(true);
const surface = ref("session");
const rowMenu = ref("");
const deleteArmed = ref("");
const showArchived = ref(false);
const dark = ref(localStorage.getItem("openworker-theme") === "dark");
const scroller = ref(null);
let socket = null;
let refreshTimer = null;
let pendingMessage = "";

const activeSession = computed(() => sessions.value.find((item) => item.session_id === sessionId.value));
const recentSessions = computed(() => sessions.value.filter((item) => !item.archived && !item.session_id.startsWith("__")));
const archivedSessions = computed(() => sessions.value.filter((item) => item.archived && !item.session_id.startsWith("__")));
const title = computed(() => activeSession.value?.title || "新对话");
const pageTitles = { automations: "自动化", connectors: "连接器", audit: "活动审计", board: "任务看板", settings: "设置" };
const pageTitle = computed(() => surface.value === "session" ? title.value : pageTitles[surface.value]);
const activePersona = computed(() => personas.value.find((item) => item.id === agent.value));
const visiblePersonas = computed(() => {
  const rows = personas.value.filter((item) => item.enabled !== false && item.surfaced !== false);
  return rows.length ? rows : [{ id: "cowork", name: "Coworker" }, { id: "chat", name: "Chat" }, { id: "code", name: "Code", requires_folder: true }];
});
const pending = computed(() => [...messages.value].reverse().find((item) => ["approval", "question"].includes(item.kind) && !item.resolved));

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content ? JSON.stringify(content, null, 2) : "";
  return content.filter((part) => part?.type === "text").map((part) => part.text).join("\n\n");
}

function historyItems(rows) {
  const toolResults = Object.fromEntries(rows.filter((row) => row.role === "tool" && row.tool_call_id).map((row) => [row.tool_call_id, contentText(row.content)]));
  const result = [];
  for (const row of rows) {
    if (row.role === "user") result.push({ kind: "user", text: typeof row._display === "string" ? row._display : contentText(row.content), ts: row.ts });
    if (row.role === "assistant") {
      if (row.content || row.reasoning) result.push({ kind: "assistant", text: contentText(row.content), reasoning: row.reasoning, ts: row.ts });
      for (const call of row.tool_calls || []) {
        let args = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch {}
        result.push({ kind: "tool", id: call.id, name: call.function?.name, args, status: "ok", preview: toolResults[call.id] });
      }
    }
    if (row.role === "notice") result.push({ kind: "notice", text: row.text || row.content || "系统提示" });
  }
  return result.filter((item) => item.text || item.kind === "tool" || item.reasoning);
}

function addNotice(text) {
  messages.value.push({ kind: "notice", text });
}

function updateTool(data) {
  const item = [...messages.value].reverse().find((row) => row.kind === "tool" && row.name === data.name && row.status === "running");
  if (item) Object.assign(item, { status: data.status || "ok", preview: data.result_preview || data.reason || "" });
}

function handleEvent(event) {
  const data = event.data || {};
  if (event.type === "ready") {
    connected.value = true;
    status.value = "已连接";
    if (data.model) model.value = data.model;
    if (data.mode) mode.value = data.mode;
    if (data.workspace) workspace.value ||= data.workspace;
    if (typeof data.running === "boolean") running.value = data.running;
  } else if (event.type === "turn_start") {
    running.value = true;
    streaming.value = "";
    if (data.input && messages.value.at(-1)?.text !== data.input) messages.value.push({ kind: "user", text: data.display || data.input });
  } else if (event.type === "assistant_delta") {
    streaming.value += data.text || "";
  } else if (event.type === "assistant_message") {
    if (data.text || data.reasoning) messages.value.push({ kind: "assistant", text: data.text || streaming.value, reasoning: data.reasoning || "" });
    streaming.value = "";
  } else if (event.type === "tool_proposed") {
    messages.value.push({ kind: "tool", id: newId(), name: data.name, args: data.arguments || {}, status: "running" });
  } else if (event.type === "tool_finished") {
    updateTool(data);
  } else if (event.type === "permission_required") {
    messages.value.push({ kind: "approval", name: data.name, reason: data.reason, args: data.arguments || {} });
  } else if (event.type === "question_requested") {
    messages.value.push({ kind: "question", text: data.question || "请选择", options: data.options || [], allowText: data.allow_text !== false });
  } else if (event.type === "turn_done") {
    running.value = false;
    refreshSessions();
  } else if (event.type === "interrupted") {
    if (streaming.value) messages.value.push({ kind: "assistant", text: streaming.value });
    streaming.value = "";
    running.value = false;
    addNotice("已停止生成");
  } else if (event.type === "error" || event.type === "input_rejected") {
    running.value = false;
    addNotice(data.error || "请求失败");
  } else if (event.type === "mode_notice" || event.type === "model_changed" || event.type === "compacted") {
    addNotice(data.text || "会话设置已更新");
  }
}

function connect() {
  socket?.close();
  connected.value = false;
  status.value = "正在连接…";
  socket = new Session(sessionId.value, workspace.value, agent.value, {
    onEvent: handleEvent,
    onOpen: () => {
      connected.value = true;
      status.value = "已连接";
      if (pendingMessage) {
        const text = pendingMessage;
        pendingMessage = "";
        messages.value.push({ kind: "user", text, ts: Date.now() / 1000 });
        draft.value = "";
        socket.userMessage(text, model.value);
      }
    },
    onClose: () => { connected.value = false; status.value = "连接已断开"; },
  });
}

async function refreshSessions() {
  try { sessions.value = await getSessions(); } catch {}
}

function closeRowMenu() {
  rowMenu.value = "";
  deleteArmed.value = "";
}

function toggleRowMenu(id) {
  rowMenu.value = rowMenu.value === id ? "" : id;
  deleteArmed.value = "";
}

async function archiveConversation(item) {
  await setSessionFlags(item.session_id, { archived: !item.archived });
  rowMenu.value = "";
  await refreshSessions();
  if (!item.archived && item.session_id === sessionId.value) newSession(item.agent || agent.value);
}

async function removeConversation(item) {
  if (deleteArmed.value !== item.session_id) {
    deleteArmed.value = item.session_id;
    return;
  }
  const result = await deleteSession(item.session_id);
  if (result.ok === false) return;
  rowMenu.value = "";
  deleteArmed.value = "";
  await refreshSessions();
  if (item.session_id === sessionId.value) newSession(item.agent || agent.value);
}

async function selectSession(item) {
  surface.value = "session";
  sessionId.value = item.session_id;
  agent.value = item.agent || "cowork";
  workspace.value = item.workspace || "";
  model.value = item.model || model.value;
  mode.value = item.mode || mode.value;
  messages.value = [];
  streaming.value = "";
  running.value = false;
  try { messages.value = historyItems(await getMessages(item.session_id)); } catch { addNotice("无法加载历史消息"); }
  connect();
}

function newSession(persona = agent.value) {
  surface.value = "session";
  sessionId.value = newId();
  agent.value = persona;
  workspace.value = "";
  messages.value = [];
  streaming.value = "";
  running.value = false;
  connect();
}

function changePersona(event) {
  newSession(event.target.value);
}

async function openRun(prepared) {
  surface.value = "session";
  sessionId.value = prepared.session_id;
  workspace.value = prepared.workspace || "";
  agent.value = prepared.agent || "cowork";
  messages.value = [];
  pendingMessage = prepared.prompt || "";
  connect();
}

function openRunSession(payload) {
  selectSession({ session_id: payload.id, workspace: payload.workspace, agent: payload.agent });
}

async function reloadConfig() {
  const [nextSettings, nextPersonas] = await Promise.all([getSettings(), getPersonas()]);
  models.value = nextSettings.models || [];
  personas.value = nextPersonas;
}

function setTheme(value) {
  dark.value = value;
  localStorage.setItem("openworker-theme", value ? "dark" : "light");
}

function send() {
  const text = draft.value.trim();
  if (!text || running.value || !connected.value) return;
  if (activePersona.value?.requires_folder && !workspace.value) {
    const path = window.prompt("该 Coworker 需要工作目录，请输入绝对路径：");
    if (!path) return;
    workspace.value = path;
    pendingMessage = text;
    connect();
    return;
  }
  messages.value.push({ kind: "user", text, ts: Date.now() / 1000 });
  draft.value = "";
  socket.userMessage(text, model.value);
}

function keydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
}

function respond(value) {
  if (!pending.value) return;
  if (pending.value.kind === "approval") socket.approve(value);
  else socket.answer(value);
  pending.value.resolved = value;
}

function changeMode() { socket?.setMode(mode.value); }
function changeModel() { socket?.setModel(model.value); }
function toggleTheme() {
  dark.value = !dark.value;
  localStorage.setItem("openworker-theme", dark.value ? "dark" : "light");
}
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function compactAge(value) {
  const time = Date.parse(value || "");
  if (!time) return "";
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1440)} 天`;
}

watch([messages, streaming], () => nextTick(() => {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}), { deep: true });
watch(dark, (value) => document.documentElement.dataset.theme = value ? "dark" : "light", { immediate: true });

onMounted(async () => {
  window.addEventListener("click", closeRowMenu);
  try {
    const [health, settings, personaRows, sessionRows] = await Promise.all([getHealth(), getSettings(), getPersonas(), getSessions()]);
    model.value = health.model || settings.default_model || model.value;
    models.value = settings.models || [];
    personas.value = personaRows;
    sessions.value = sessionRows;
    if (sessionRows[0]) await selectSession(sessionRows[0]);
    else connect();
    refreshTimer = window.setInterval(refreshSessions, 5000);
  } catch (error) {
    status.value = `本地服务不可用：${error.message}`;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeRowMenu);
  socket?.close();
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="app" :class="{ 'sidebar-hidden': !sidebarOpen }">
    <aside class="sidebar">
      <header class="brand">
        <div class="logo">O</div>
        <strong>AIWorker</strong>
        <button class="icon-button pin" title="收起侧边栏" @click="sidebarOpen = false">‹</button>
      </header>
      <button class="new-button" @click="newSession()"><span>＋</span> 新对话</button>
      <div class="section-label">最近对话</div>
      <nav class="session-list">
        <div v-for="item in recentSessions" :key="item.session_id" class="session-row-wrap">
          <button class="session-row" :class="{ active: surface === 'session' && item.session_id === sessionId }" @click="selectSession(item)">
            <span class="session-icon">◇</span>
            <span class="session-copy"><strong>{{ item.title || '未命名对话' }}</strong><small>{{ item.agent }} · {{ compactAge(item.updated_at) }}</small></span>
            <span v-if="item.liveness === 'working'" class="live-dot"></span>
          </button>
          <button class="row-menu-button" title="对话操作" @click.stop="toggleRowMenu(item.session_id)">⋯</button>
          <div v-if="rowMenu === item.session_id" class="row-menu" role="menu" @click.stop>
            <button @click="archiveConversation(item)">▣ 归档</button>
            <div class="menu-separator"></div>
            <button class="danger-item" @click="removeConversation(item)">{{ deleteArmed === item.session_id ? '再次点击确认删除' : '⌫ 删除' }}</button>
          </div>
        </div>
        <div v-if="!recentSessions.length && !archivedSessions.length" class="empty-side">还没有历史对话</div>
        <div v-if="archivedSessions.length" class="archived-section">
          <button class="archived-toggle" @click="showArchived = !showArchived"><span>{{ showArchived ? '⌄' : '›' }}</span>已归档（{{ archivedSessions.length }}）</button>
          <div v-if="showArchived">
            <div v-for="item in archivedSessions" :key="item.session_id" class="session-row-wrap">
              <button class="session-row archived-row" @click="selectSession(item)"><span class="session-icon">◇</span><span class="session-copy"><strong>{{ item.title || '未命名对话' }}</strong><small>{{ item.agent }} · {{ compactAge(item.updated_at) }}</small></span></button>
              <button class="row-menu-button" title="对话操作" @click.stop="toggleRowMenu(item.session_id)">⋯</button>
              <div v-if="rowMenu === item.session_id" class="row-menu" role="menu" @click.stop>
                <button @click="archiveConversation(item)">↶ 取消归档</button>
                <div class="menu-separator"></div>
                <button class="danger-item" @click="removeConversation(item)">{{ deleteArmed === item.session_id ? '再次点击确认删除' : '⌫ 删除' }}</button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <nav class="surface-nav">
        <button :class="{ active: surface === 'automations' }" @click="surface = 'automations'"><span>◷</span>自动化</button>
        <button :class="{ active: surface === 'connectors' }" @click="surface = 'connectors'"><span>⌁</span>连接器</button>
        <button :class="{ active: surface === 'board' }" @click="surface = 'board'"><span>▦</span>任务看板</button>
        <button :class="{ active: surface === 'audit' }" @click="surface = 'audit'"><span>◎</span>活动审计</button>
        <button :class="{ active: surface === 'settings' }" @click="surface = 'settings'"><span>⚙</span>设置</button>
      </nav>
      <footer class="sidebar-footer">
        <button @click="toggleTheme">{{ dark ? '☀' : '◐' }} {{ dark ? '浅色模式' : '深色模式' }}</button>
        <span :class="['connection-dot', { online: connected }]"></span><small>{{ status }}</small>
      </footer>
    </aside>

    <main class="main">
      <header class="topbar">
        <button v-if="!sidebarOpen" class="icon-button" title="展开侧边栏" @click="sidebarOpen = true">☰</button>
        <div class="title-block"><strong>{{ pageTitle }}</strong><small v-if="surface === 'session'">{{ activePersona?.name || agent }} · {{ model }}<template v-if="workspace"> · {{ workspace }}</template></small><small v-else>AIWorker</small></div>
        <button v-if="surface === 'session'" class="icon-button" title="新对话" @click="newSession()">＋</button>
      </header>

      <template v-if="surface === 'session'">
      <div ref="scroller" class="conversation">
        <section v-if="!messages.length && !streaming" class="hero">
          <div class="hero-mark">◇</div>
          <h1>今天想完成什么？</h1>
          <p>选择 Coworker，然后描述任务。AIWorker 会在本地工作区中协助你。</p>
          <div class="suggestions">
            <button @click="draft = '帮我梳理这个项目的结构和核心模块'">梳理项目结构 <span>→</span></button>
            <button @click="draft = '检查当前项目并修复构建问题'">修复构建问题 <span>→</span></button>
            <button @click="draft = '总结最近的代码改动'">总结代码改动 <span>→</span></button>
          </div>
        </section>

        <div v-else class="transcript">
          <article v-for="(item, index) in messages" :key="index" :class="['message', item.kind]">
            <template v-if="item.kind === 'user'">
              <div class="user-bubble">{{ item.text }}</div><small>{{ formatTime(item.ts) }}</small>
            </template>
            <template v-else-if="item.kind === 'assistant'">
              <details v-if="item.reasoning" class="reasoning"><summary>思考过程</summary><pre>{{ item.reasoning }}</pre></details>
              <div class="assistant-copy">{{ item.text }}</div><small>{{ formatTime(item.ts) }}</small>
            </template>
            <template v-else-if="item.kind === 'tool'">
              <details class="tool-card"><summary><span :class="['tool-status', item.status]"></span>{{ item.name }} <small>{{ item.status === 'running' ? '运行中' : item.status }}</small></summary><pre>{{ JSON.stringify(item.args, null, 2) }}<template v-if="item.preview">\n\n{{ item.preview }}</template></pre></details>
            </template>
            <template v-else-if="item.kind === 'notice'"><div class="notice-line">{{ item.text }}</div></template>
            <template v-else-if="item.kind === 'approval'"><div class="inline-card"><strong>允许执行 {{ item.name }}？</strong><p>{{ item.reason || '此操作需要你的确认。' }}</p></div></template>
            <template v-else-if="item.kind === 'question'"><div class="inline-card"><strong>{{ item.text }}</strong></div></template>
          </article>
          <article v-if="streaming" class="message assistant"><div class="assistant-copy">{{ streaming }}<span class="cursor"></span></div></article>
          <div v-if="running && !streaming" class="thinking-row"><span></span>正在处理任务…</div>
        </div>
      </div>

      <section v-if="pending" class="approval-bar">
        <template v-if="pending.kind === 'approval'">
          <div><strong>需要确认</strong><span>{{ pending.name }}</span></div>
          <button class="secondary" @click="respond('deny')">拒绝</button><button class="primary" @click="respond('once')">允许一次</button>
        </template>
        <template v-else>
          <div><strong>{{ pending.text }}</strong></div>
          <button v-for="option in pending.options" :key="option.value || option.label || option" class="secondary" @click="respond(option.value || option.label || option)">{{ option.label || option }}</button>
        </template>
      </section>

      <footer class="composer-area">
        <div class="composer">
          <textarea v-model="draft" :disabled="!connected" rows="1" :placeholder="connected ? '描述任务，Enter 发送，Shift + Enter 换行' : '等待本地服务连接…'" @keydown="keydown"></textarea>
          <div class="composer-toolbar">
            <div class="selectors">
              <select :value="agent" title="Coworker" @change="changePersona"><option v-for="item in visiblePersonas" :key="item.id" :value="item.id">{{ item.name || item.id }}</option></select>
              <select v-model="mode" title="权限模式" @change="changeMode"><option value="discuss">讨论</option><option value="interactive">每次确认</option><option value="auto-approve">自动审批</option><option value="auto">绕过审批</option></select>
              <select v-if="models.length" v-model="model" title="模型" @change="changeModel"><option v-for="item in models" :key="item" :value="item">{{ item }}</option></select>
            </div>
            <button v-if="running" class="stop-button" title="停止" @click="socket.interrupt()">■</button>
            <button v-else class="send-button" :disabled="!draft.trim() || !connected" title="发送" @click="send">↑</button>
          </div>
        </div>
      </footer>
      </template>
      <AutomationsView v-else-if="surface === 'automations'" @run="openRun" @open-session="openRunSession" />
      <ConnectorsView v-else-if="surface === 'connectors'" />
      <BoardView v-else-if="surface === 'board'" :session-id="sessionId" />
      <AuditView v-else-if="surface === 'audit'" />
      <SettingsView v-else :dark="dark" @theme-change="setTheme" @settings-change="reloadConfig" />
    </main>
  </div>
</template>
