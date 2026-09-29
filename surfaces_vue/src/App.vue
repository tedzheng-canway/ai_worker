<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createTempWorkspace, deleteSession, finalizeAutomationRun, getHealth, getMessages, getPersonas, getSessions, getSettings, setSessionFlags, Session } from "./api";
import { approvalLabels, approvalMeta, historyItems } from "./history";
import { contextUsage, historyUsage, settingsWithDefaults } from "./settings";
import { ManualRuns } from "./manualRuns";
import AuditView from "./components/AuditView.vue";
import AutomationsView from "./components/AutomationsView.vue";
import BoardView from "./components/BoardView.vue";
import ConnectorsView from "./components/ConnectorsView.vue";
import SettingsView from "./components/SettingsView.vue";
import QuestionPrompt from "./components/QuestionPrompt.vue";
import FolderDialog from "./components/FolderDialog.vue";
import SelectMenu from "./components/SelectMenu.vue";
import ApprovalPrompt from "./components/ApprovalPrompt.vue";

const newId = () => crypto.randomUUID?.().slice(0, 12) || Math.random().toString(36).slice(2, 14);
const sessions = ref([]);
const personas = ref([]);
const messages = ref([]);
const sessionId = ref(newId());
const agent = ref("cowork");
const workspace = ref("");
const model = ref("gpt-5.6-sol");
const models = ref([]);
const config = ref(settingsWithDefaults({}));
const usage = ref(null);
const showAllSessions = ref(false);
const showAllArchived = ref(false);
const manualRunEntries = ref([]);
const configError = ref("");
const mode = ref("interactive");
const draft = ref("");
const sendGate = ref("");
const folderError = ref("");
const connected = ref(false);
const sessionReady = ref(false);
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
const connections = new Map();
const reconnectTimers = new Map();
let disposed = false;
const manualRuns = new ManualRuns({ finalize: finalizeAutomationRun, storage: sessionStorage, onChange: (entries) => { manualRunEntries.value = entries; } });
manualRuns.changed();

const activeSession = computed(() => sessions.value.find((item) => item.session_id === sessionId.value));
const recentSessions = computed(() => sessions.value.filter((item) => !item.archived && !item.session_id.startsWith("__")));
const archivedSessions = computed(() => sessions.value.filter((item) => item.archived && !item.session_id.startsWith("__")));
const shownSessions = computed(() => showAllSessions.value ? recentSessions.value : recentSessions.value.slice(0, config.value.sessions_peek));
const shownArchived = computed(() => showAllArchived.value ? archivedSessions.value : archivedSessions.value.slice(0, config.value.sessions_peek));
const contextWindow = computed(() => Number(config.value.model_context_windows?.[usage.value?.model || model.value]) || 0);
const contextPercent = computed(() => contextWindow.value ? Math.min(100, Math.round((usage.value?.tokens || 0) / contextWindow.value * 100)) : 0);
const runNotes = computed(() => manualRunEntries.value.filter((entry) => entry.note));
const title = computed(() => activeSession.value?.title || "新对话");
const pageTitles = { automations: "自动化", connectors: "连接器", audit: "活动审计", board: "任务看板", settings: "设置" };
const pageTitle = computed(() => surface.value === "session" ? title.value : pageTitles[surface.value]);
const activePersona = computed(() => personas.value.find((item) => item.id === agent.value));
const needsWorkspace = computed(() => Boolean((activePersona.value?.requires_folder || agent.value === "code") && !workspace.value));
const visiblePersonas = computed(() => {
  const rows = personas.value.filter((item) => item.enabled !== false && item.surfaced !== false);
  return rows.length ? rows : [{ id: "cowork", name: "Coworker" }, { id: "chat", name: "Chat" }, { id: "code", name: "Code", requires_folder: true }];
});
const personaOptions = computed(() => visiblePersonas.value.map((item) => ({ value: item.id, label: item.name || item.id, description: item.tagline || "切换智能体" })));
const modeOptions = computed(() => [
  { value: "discuss", label: "讨论模式", description: "仅讨论方案，不执行操作" },
  { value: "interactive", label: "每次确认", description: "执行敏感操作前向你确认" },
  ...(config.value.auto_approve ? [{ value: "auto-approve", label: "自动审批", description: "自动批准低风险操作" }] : []),
  { value: "auto", label: "绕过审批", description: "直接执行所有操作" },
]);
const modelOptions = computed(() => [...new Set([model.value, ...models.value].filter(Boolean))].map((item) => ({ value: item, label: config.value.model_labels?.[item] || (item.includes(":") ? item.split(":").slice(1).join(":") : item), description: models.value.includes(item) ? item : `${item} · 当前会话模型` })));
const requestKinds = new Set(["approval", "dirreq", "toolreq", "planreq", "teamreq", "itemsreq", "question"]);
const pending = computed(() => [...messages.value].reverse().find((item) => requestKinds.has(item.kind) && !item.resolved));

function addNotice(text) {
  messages.value.push({ kind: "notice", text });
}

function updateTool(data) {
  const item = [...messages.value].reverse().find((row) => row.kind === "tool" && row.name === data.name && row.status === "running");
  if (item) Object.assign(item, { status: data.status || "ok", preview: data.result_preview || data.reason || "", ...approvalMeta(data) });
}

function handleEvent(event) {
  const data = event.data || {};
  if (event.type === "ready") {
    connected.value = true;
    sessionReady.value = true;
    status.value = "已连接";
    if (data.model) model.value = data.model;
    if (data.mode) {
      mode.value = data.mode;
      if (mode.value === "auto-approve" && !config.value.auto_approve) changeMode("interactive");
    }
    if (data.workspace) workspace.value ||= data.workspace;
    if (typeof data.running === "boolean") running.value = data.running;
  } else if (event.type === "turn_start") {
    running.value = true;
    streaming.value = "";
    if (data.input && messages.value.at(-1)?.text !== data.input) messages.value.push({ kind: "user", text: data.display || data.input });
  } else if (event.type === "assistant_delta") {
    streaming.value += data.text || "";
  } else if (event.type === "assistant_message") {
    if (data.usage) usage.value = contextUsage(data.usage);
    if (data.text || data.reasoning) messages.value.push({ kind: "assistant", text: data.text || streaming.value, reasoning: data.reasoning || "" });
    streaming.value = "";
  } else if (event.type === "tool_proposed") {
    messages.value.push({ kind: "tool", id: newId(), name: data.name, args: data.arguments || {}, status: "running" });
  } else if (event.type === "tool_finished") {
    updateTool(data);
  } else if (event.type === "permission_required") {
    messages.value.push({
      kind: "approval",
      name: data.name,
      reason: data.reason,
      args: data.arguments || {},
      category: data.category,
      standingTarget: data.standing_target,
      readonlyOk: !!data.readonly_ok,
    });
  } else if (event.type === "directory_requested") {
    messages.value.push({ kind: "dirreq", reason: data.reason || "", path: data.path || "", writable: !!data.writable, primary: !!data.primary });
  } else if (event.type === "tool_requested") {
    messages.value.push({ kind: "toolreq", tool: data.name || "", reason: data.reason || "", installable: data.installable === true, version: data.version || "", summary: data.summary || "" });
  } else if (event.type === "plan_proposed") {
    messages.value.push({ kind: "planreq", plan: data.plan || "" });
  } else if (event.type === "team_proposed") {
    messages.value.push({ kind: "teamreq", members: data.members || [], note: data.note || "" });
  } else if (event.type === "items_proposed") {
    messages.value.push({ kind: "itemsreq", items: data.items || [], note: data.note || "" });
  } else if (event.type === "question_requested") {
    messages.value.push({
      kind: "question",
      text: data.question || "请选择",
      header: data.header || "",
      options: data.options || [],
      questions: data.questions || [],
      allowText: data.allow_text !== false,
      multi: !!data.multi,
    });
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
    if (event.type === "model_changed" && data.model) model.value = data.model;
    addNotice(data.text || "会话设置已更新");
  }
}

function releaseInactiveConnections() {
  for (const [id, connection] of connections) {
    if (id !== sessionId.value && !manualRuns.watching(id)) {
      connection.close();
      connections.delete(id);
      clearTimeout(reconnectTimers.get(id));
      reconnectTimers.delete(id);
    }
  }
}

function openConnection(id, folder, persona, openingText = "") {
  const openingModel = model.value;
  const connection = new Session(id, folder, persona, {
    onEvent: (event) => {
      if (event.type === "ready") {
        connection.ready = true;
        connection.running = !!event.data?.running;
        void manualRuns.ready(id, connection.running).then(releaseInactiveConnections);
      }
      if (event.type === "turn_start") connection.running = true;
      if (event.type === "turn_done") connection.running = false;
      void manualRuns.event(id, event).then(releaseInactiveConnections);
      if (id === sessionId.value) handleEvent(event);
    },
    onOpen: () => {
      connection.connected = true;
      if (id === sessionId.value) {
        connected.value = true;
        status.value = folder ? "正在初始化工作区…" : "已连接";
      }
      if (openingText) {
        if (id === sessionId.value) {
          messages.value.push({ kind: "user", text: openingText, ts: Date.now() / 1000 });
          draft.value = "";
        }
        connection.userMessage(openingText, openingModel);
        openingText = "";
      }
    },
    onClose: () => {
      connection.connected = false;
      connections.delete(id);
      if (id === sessionId.value) { connected.value = false; status.value = "连接已断开"; }
      if (!disposed && manualRuns.watching(id)) {
        manualRuns.disconnected(id);
        reconnectTimers.set(id, window.setTimeout(() => {
          reconnectTimers.delete(id);
          if (disposed || connections.has(id) || !manualRuns.watching(id)) return;
          const resumed = openConnection(id, folder, persona);
          if (id === sessionId.value) socket = resumed;
        }, 3000));
      }
    },
  });
  connections.set(id, connection);
  return connection;
}

function connect() {
  releaseInactiveConnections();
  socket = null;
  connected.value = false;
  sessionReady.value = false;
  if (needsWorkspace.value) {
    status.value = "发送任务时请选择工作目录";
    return;
  }
  status.value = "正在连接…";
  socket = connections.get(sessionId.value) || openConnection(sessionId.value, workspace.value, agent.value, pendingMessage);
  pendingMessage = "";
  connected.value = !!socket.connected;
  sessionReady.value = !!socket.ready;
  running.value = !!socket.running;
  if (connected.value) status.value = "已连接";
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
  pendingMessage = "";
  connected.value = false;
  socket = null;
  surface.value = "session";
  sessionId.value = item.session_id;
  agent.value = item.agent || "cowork";
  workspace.value = item.workspace || "";
  model.value = item.model || model.value;
  mode.value = item.mode || mode.value;
  messages.value = [];
  usage.value = null;
  streaming.value = "";
  running.value = false;
  try {
    const rows = await getMessages(item.session_id);
    if (sessionId.value !== item.session_id) return;
    messages.value = historyItems(rows);
    usage.value = historyUsage(rows);
  } catch { if (sessionId.value === item.session_id) addNotice("无法加载历史消息"); }
  if (sessionId.value !== item.session_id) return;
  connect();
}

function newSession(persona = agent.value) {
  surface.value = "session";
  sessionId.value = newId();
  agent.value = visiblePersonas.value.some((p) => p.id === persona) ? persona : visiblePersonas.value[0]?.id || "cowork";
  model.value = config.value.model || config.value.default_model || models.value[0] || model.value;
  if (mode.value === "auto-approve" && !config.value.auto_approve) mode.value = "interactive";
  usage.value = null;
  workspace.value = "";
  messages.value = [];
  streaming.value = "";
  running.value = false;
  pendingMessage = "";
  sendGate.value = "";
  folderError.value = "";
  connect();
}

function changePersona(value) {
  newSession(value);
}

async function openRun(prepared) {
  manualRuns.track(prepared);
  surface.value = "session";
  sessionId.value = prepared.session_id;
  workspace.value = prepared.workspace || "";
  agent.value = prepared.agent || "cowork";
  messages.value = [];
  usage.value = null;
  streaming.value = "";
  running.value = false;
  pendingMessage = prepared.prompt || "";
  connect();
}

function openRunSession(payload) {
  selectSession({ session_id: payload.id, workspace: payload.workspace, agent: payload.agent });
}

async function reloadConfig() {
  try {
    const [nextSettings, nextPersonas] = await Promise.all([getSettings(), getPersonas()]);
    configError.value = "";
    config.value = settingsWithDefaults(nextSettings);
    models.value = nextSettings.models || [];
    personas.value = nextPersonas;
    showAllSessions.value = false;
    showAllArchived.value = false;
    if (mode.value === "auto-approve" && !config.value.auto_approve) changeMode("interactive");
    if (!messages.value.length && !running.value) {
      changeModel(nextSettings.model || nextSettings.default_model || models.value[0] || model.value);
      if (!visiblePersonas.value.some((p) => p.id === agent.value)) newSession();
    }
  } catch (error) { configError.value = `设置同步失败：${error.message}`; }
}

function setTheme(value) {
  dark.value = value;
  localStorage.setItem("openworker-theme", value ? "dark" : "light");
}

function send() {
  const text = draft.value.trim();
  if (!text || running.value) return;
  if (needsWorkspace.value) {
    sendGate.value = text;
    folderError.value = "";
    draft.value = "";
    return;
  }
  if (!connected.value || !socket) return;
  messages.value.push({ kind: "user", text, ts: Date.now() / 1000 });
  draft.value = "";
  socket.userMessage(text, model.value);
}

function resolveSendFolder(path) {
  if (!sendGate.value) return;
  workspace.value = path;
  pendingMessage = sendGate.value;
  sendGate.value = "";
  folderError.value = "";
  connect();
}

async function startTempAndSend() {
  folderError.value = "";
  try {
    const result = await createTempWorkspace(sessionId.value);
    if (!result.ok || !result.path) {
      folderError.value = result.error || "无法创建临时工作目录";
      return;
    }
    resolveSendFolder(result.path);
  } catch (error) {
    folderError.value = error?.message || "无法创建临时工作目录";
  }
}

function cancelSendFolder() {
  draft.value = sendGate.value;
  sendGate.value = "";
  folderError.value = "";
}

function keydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
}

function respond(value) {
  if (!pending.value || pending.value.kind !== "question") return;
  socket?.answer(value);
  pending.value.resolved = value;
}

function resolveRequest(result) {
  const item = pending.value;
  if (!item || item.kind === "question") return;
  if (item.kind === "approval") socket?.approve(result.decision);
  else if (item.kind === "dirreq") socket?.respondDirectory(result.approved, item.path, result.writable);
  else if (item.kind === "toolreq") socket?.respondTool(result.approved);
  else if (item.kind === "planreq") socket?.respondPlan(result.approved);
  else if (item.kind === "teamreq") socket?.respondTeam(result.approved);
  else if (item.kind === "itemsreq") socket?.respondItems(result.approved);
  item.resolved = result.decision || (result.approved ? "approved" : "denied");
}

function changeMode(value) { mode.value = value === "auto-approve" && !config.value.auto_approve ? "interactive" : value; socket?.setMode(mode.value); }
function changeModel(value) { model.value = value; socket?.setModel(value); }
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
    config.value = settingsWithDefaults(settings);
    model.value = settings.model || settings.default_model || health.model || model.value;
    models.value = settings.models || [];
    personas.value = personaRows;
    sessions.value = sessionRows;
    if (sessionRows[0]) await selectSession(sessionRows[0]);
    else connect();
    for (const entry of manualRunEntries.value) {
      if (manualRuns.watching(entry.session_id) && !connections.has(entry.session_id)) openConnection(entry.session_id, entry.workspace, entry.agent);
    }
    refreshTimer = window.setInterval(refreshSessions, 5000);
  } catch (error) {
    status.value = `本地服务不可用：${error.message}`;
  }
});

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener("click", closeRowMenu);
  for (const connection of connections.values()) connection.close();
  for (const timer of reconnectTimers.values()) clearTimeout(timer);
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
        <div v-for="item in shownSessions" :key="item.session_id" class="session-row-wrap">
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
        <button v-if="recentSessions.length > config.sessions_peek" class="archived-toggle" @click="showAllSessions = !showAllSessions">{{ showAllSessions ? '收起对话' : `显示更多（${recentSessions.length - shownSessions.length}）` }}</button>
        <div v-if="!recentSessions.length && !archivedSessions.length" class="empty-side">还没有历史对话</div>
        <div v-if="archivedSessions.length" class="archived-section">
          <button class="archived-toggle" @click="showArchived = !showArchived"><span>{{ showArchived ? '⌄' : '›' }}</span>已归档（{{ archivedSessions.length }}）</button>
          <div v-if="showArchived">
            <div v-for="item in shownArchived" :key="item.session_id" class="session-row-wrap">
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
      <button v-if="showArchived && archivedSessions.length > config.sessions_peek" class="archived-toggle" @click="showAllArchived = !showAllArchived">{{ showAllArchived ? '收起归档' : '显示更多归档' }}</button>
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

      <p v-if="configError" class="error-text status-note" role="alert">{{ configError }} <button class="btn" @click="reloadConfig">重试同步</button></p>
      <div v-for="entry in runNotes" :key="entry.run_id" class="status-note" role="status">
        {{ entry.note }}
        <button class="btn" @click="selectSession(entry)">查看运行会话</button>
        <button v-if="entry.state === 'completed'" class="btn" @click="manualRuns.finish(entry.session_id)">重试回写</button>
      </div>
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
              <details class="tool-card"><summary><span :class="['tool-status', item.status]"></span>{{ item.name }} <small>{{ item.status === 'running' ? '运行中' : item.status === 'denied' ? '已拒绝' : item.status === 'unknown' ? '结果未知' : item.status }}</small><small v-if="item.approvalOrigin"> · {{ approvalLabels[item.approvalOrigin] || item.approvalOrigin }}</small></summary><p v-if="item.approvalNote">{{ item.approvalNote }}</p><p v-if="item.approvalGrant">授权：{{ item.approvalGrant }}</p><pre>{{ JSON.stringify(item.args, null, 2) }}<template v-if="item.preview">\n\n{{ item.preview }}</template></pre></details>
            </template>
            <template v-else-if="item.kind === 'notice'"><div class="notice-line">{{ item.text }}</div></template>
            <template v-else-if="item.kind === 'approval'"><div class="inline-card"><strong>允许执行 {{ item.name }}？</strong><p>{{ item.reason || '此操作需要你的确认。' }}</p></div></template>
            <template v-else-if="item.kind === 'question'"><div class="inline-card"><strong>{{ item.text }}</strong></div></template>
          </article>
          <article v-if="streaming" class="message assistant"><div class="assistant-copy">{{ streaming }}<span class="cursor"></span></div></article>
          <div v-if="running && !streaming" class="thinking-row"><span></span>正在处理任务…</div>
        </div>
      </div>

      <section v-if="pending" :class="pending.kind === 'question' ? 'question-bar' : 'request-bar'">
        <QuestionPrompt v-if="pending.kind === 'question'" :key="`question-${sessionId}-${messages.indexOf(pending)}`" :item="pending" @answer="respond" />
        <ApprovalPrompt v-else :key="`request-${sessionId}-${messages.indexOf(pending)}`" :item="pending" @resolve="resolveRequest" />
      </section>

      <footer class="composer-area">
        <div v-if="config.context_bar" class="context-usage" role="status">
          <template v-if="usage && contextWindow">
            <span>上下文 {{ contextPercent }}% · {{ usage.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tokens</span>
            <progress :value="contextPercent" max="100" aria-label="上下文使用进度"></progress>
          </template>
          <span v-else>{{ usage ? `上下文 ${usage.tokens.toLocaleString()} tokens（模型容量未知）` : '上下文用量：等待模型返回数据' }}</span>
        </div>
        <div class="composer">
          <textarea v-model="draft" :disabled="!connected && !needsWorkspace" rows="1" :placeholder="needsWorkspace ? '描述任务，发送时选择工作目录' : connected ? '描述任务，Enter 发送，Shift + Enter 换行' : '等待本地服务连接…'" @keydown="keydown"></textarea>
          <div class="composer-toolbar">
            <div class="selectors">
              <SelectMenu :model-value="agent" :options="personaOptions" icon="◇" label="选择智能体" @change="changePersona" />
              <SelectMenu :model-value="mode" :options="modeOptions" icon="◉" label="选择权限模式" @change="changeMode" />
              <SelectMenu v-if="modelOptions.length" class="model-selector" :model-value="model" :options="modelOptions" icon="✦" label="选择模型" wide @change="changeModel" />
            </div>
            <button v-if="running" class="stop-button" title="停止" @click="socket.interrupt()">■</button>
            <button v-else class="send-button" :disabled="!draft.trim() || (!connected && !needsWorkspace)" title="发送" @click="send">↑</button>
          </div>
        </div>
      </footer>
      </template>
      <AutomationsView v-else-if="surface === 'automations'" :manual-runs="manualRunEntries" @run="openRun" @open-session="openRunSession" />
      <ConnectorsView v-else-if="surface === 'connectors'" />
      <BoardView v-else-if="surface === 'board'" :session-id="sessionId" />
      <AuditView v-else-if="surface === 'audit'" />
      <SettingsView v-else :dark="dark" @theme-change="setTheme" @settings-change="reloadConfig" />
    </main>
    <FolderDialog v-if="sendGate" :persona-name="activePersona?.name || agent" :external-error="folderError" @pick="resolveSendFolder" @temp="startTempAndSend" @cancel="cancelSendFolder" />
  </div>
</template>
