<script setup>
import { t } from './i18n';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createTempWorkspace, deleteSession, finalizeAutomationRun, getHealth, getMessages, getPersonas, getSessions, getSettings, setSessionFlags, Session } from "./api";
import { approvalLabels, approvalMeta, historyItems } from "./history";
import { contextUsage, historyUsage, settingsWithDefaults } from "./settings";
import { ManualRuns } from "./manualRuns";
import OnboardingView from './components/OnboardingView.vue';
import { dark, setTheme } from './preferences';
import { memoryNotice, undoMemory } from './p3';
import { updateMemory, deleteMemory } from './api';
const onboarding = ref(false);
async function finishSetup(){ onboarding.value=false; await reloadConfig(); }
async function undoSavedMemory(item){ if(item.busy || item.undone)return; item.busy=true; item.error='';try { requireSuccess(await undoMemory(item,{updateMemory,deleteMemory})); item.undone=true; window.dispatchEvent(new Event('ocw-memory-changed')); } catch(e){item.error=e.message;} finally {item.busy=false;} }
import AuditView from "./components/AuditView.vue";
import AutomationsView from "./components/AutomationsView.vue";
import BoardView from "./components/BoardView.vue";
import ConnectorsView from "./components/ConnectorsView.vue";
import SettingsView from "./components/SettingsView.vue";
import QuestionPrompt from "./components/QuestionPrompt.vue";
import FolderDialog from "./components/FolderDialog.vue";
import SelectMenu from "./components/SelectMenu.vue";
import ApprovalPrompt from "./components/ApprovalPrompt.vue";
import MarkdownView from './components/MarkdownView.vue';
import ArtifactPanel from './components/ArtifactPanel.vue';
import SessionAccess from './components/SessionAccess.vue';
import SessionSearch from './components/SessionSearch.vue';
import InboxView from './components/InboxView.vue';
import InboxCard from './components/InboxCard.vue';
import TeamChatView from './components/TeamChatView.vue';
import { getInbox, getUnattended } from './p2api';
import { inboxMatches } from './p2';
import { getAutomations, connectEvents } from './api';
const unattended=ref(false),sessionInbox=ref([]),inboxCount=ref(0),automationUnread=ref(0),backgroundError=ref('');
const connectorFocus=ref(''),automationFocus=ref(''),runContext=ref(null),runToast=ref(null),boardItem=ref(null);
const runContexts=new Map();
const requestEvents=new Set(['permission_required','question_requested','directory_requested','plan_proposed','tool_requested','team_proposed','items_proposed']);
let backgroundTimer,stopEvents,toastTimer,backgroundVersion=0;
function reconcileInbox(item){for(const row of messages.value)if(row.inboxId===item?.id&&!row.resolved)row.resolved='inbox';}
async function refreshBackground(){
  const id=sessionId.value,version=++backgroundVersion;
  const results=await Promise.allSettled([getInbox(),getUnattended(id),getAutomations(),getInbox(id)]);
  if(disposed||version!==backgroundVersion||id!==sessionId.value)return;
  if(results[0].status==='fulfilled')inboxCount.value=results[0].value.length;
  if(results[3].status==='fulfilled'){
    const next=results[3].value;
    for(const old of sessionInbox.value)if(!next.some(row=>row.id===old.id))reconcileInbox(old);
    for(const item of next){if(messages.value.some(row=>row.inboxId===item.id))continue;const live=[...messages.value].reverse().find(row=>inboxMatches(row,item)&&!row.resolved&&!row.inboxId);if(live)live.inboxId=item.id;}
    sessionInbox.value=next;
  }
  if(results[1].status==='fulfilled')unattended.value=results[1].value;
  if(results[2].status==='fulfilled')automationUnread.value=results[2].value.reduce((sum,t)=>sum+(Number(t.unseen_runs)||0),0);
  const failed=results.find(r=>r.status==='rejected');backgroundError.value=failed?'后台状态同步失败：'+failed.reason.message:'';
}
function resolvedInbox(item){if(item?.session_id===sessionId.value){reconcileInbox(item);if(item.kind==='plan'){try{const answer=JSON.parse(item.resolution);if(answer.approved&&answer.mode)mode.value=answer.mode;}catch{}}}refreshBackground();refreshSessions();}
function openConnectors(name=''){connectorFocus.value=name;surface.value='connectors';panel.value='';}
function returnToAutomation(){automationFocus.value=runContext.value?.task_id || '';surface.value='automations';}
function rememberRun(data){if(data.task_id)runContexts.set(data.session_id||data.id,data);}
function globalEvent(event){if(event.type==='automation_run_started'){rememberRun(event.data);runToast.value=event.data;clearTimeout(toastTimer);toastTimer=setTimeout(()=>runToast.value=null,8000);refreshBackground();refreshSessions();}}
import { inspectPdf, sessionSkills, renameSession, setNavLayout, setWorkspaceTrusted } from './api';
import { prepareAttachment } from './attachments';
import { requireSuccess } from './settings';
import { addUsage, usageTotals, normalizeTodos, transcriptGroups } from './sessionState';

const attachments = ref([]), attachmentError = ref(''), attaching = ref(false), fileInput = ref(null);
const skills = ref([]), chosenSkill = ref(''), skillIndex = ref(0), slashDismissed = ref(false);
const panel = ref(''), artifactPath = ref(''), artifactVersion = ref(0), bindingVersion = ref(0);
const searchOpen = ref(false), renameTarget = ref(null), renameDraft = ref(''), actionError = ref(''), actionBusy = ref(false);
const expandedGroups = ref({}), streamReasoning = ref(''), compacting = ref(false), totals = ref({}), todos = ref([]), atBottom = ref(true);
const trustRequest = ref(null), trustError = ref(''), trustSaving = ref(false), temporary = ref(false);
const settingsTab = ref('general');

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

const scroller = ref(null);
let socket = null;
let refreshTimer = null;
let pendingMessage = "";
let attachmentLoads = 0;
const connections = new Map();
const reconnectTimers = new Map();
let disposed = false;
const manualRuns = new ManualRuns({ finalize: finalizeAutomationRun, storage: sessionStorage, onChange: (entries) => { manualRunEntries.value = entries; } });
manualRuns.changed();

const activeSession = computed(() => sessions.value.find((item) => item.session_id === sessionId.value));
const teamLeadId=computed(()=>activeSession.value?.team?.lead_session || sessionId.value);
const teamMembers=computed(()=>sessions.value.filter(row=>row.session_id===teamLeadId.value || row.team?.lead_session===teamLeadId.value));
const teamId=computed(()=>activeSession.value?.team?.team_id || teamMembers.value.find(row=>row.team?.team_id)?.team?.team_id || '');
const recentSessions = computed(() => sessions.value.filter((item) => !item.archived && item.team?.role!=='worker' && !item.session_id.startsWith("__")));
const sessionGroups = computed(() => {
  const rows = recentSessions.value;
  const groups = new Map();
  const pinned = rows.filter(item => item.pinned);
  if (pinned.length) groups.set('pinned', { key: 'pinned', label: '置顶', items: pinned });
  for (const item of rows.filter(item => !item.pinned)) {
    const persona = personas.value.find(p => p.id === item.agent);
    const project = persona?.requires_folder ? item.workspace || '未选择项目' : '';
    const key = config.value.nav_layout === 'grouped' ? `${item.agent}:${project}` : 'recent';
    if (!groups.has(key)) groups.set(key, { key, label: key === 'recent' ? '最近对话' : `${persona?.name || item.agent}${project ? ` · ${project}` : ''}`, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
});
const groupedMessages = computed(() => transcriptGroups(messages.value));
const slashSkills = computed(() => /^\/[^\s]*$/.test(draft.value) && !slashDismissed.value ? skills.value.filter(s => s.enabled && s.name.toLowerCase().includes(draft.value.slice(1).toLowerCase())) : []);
const slashOpen = computed(() => /^\/[^\s]*$/.test(draft.value) && !slashDismissed.value);
const canSend = computed(() => !!(draft.value.trim() || attachments.value.length || chosenSkill.value) && !attaching.value);
const totalTokens = computed(() => Object.values(totals.value).reduce((sum, row) => sum + Object.values(row).reduce((n, v) => n + v, 0), 0));
const archivedSessions = computed(() => sessions.value.filter((item) => item.archived && !item.session_id.startsWith("__")));
const shownArchived = computed(() => showAllArchived.value ? archivedSessions.value : archivedSessions.value.slice(0, config.value.sessions_peek));
const contextWindow = computed(() => Number(config.value.model_context_windows?.[usage.value?.model || model.value]) || 0);
const contextPercent = computed(() => contextWindow.value ? Math.min(100, Math.round((usage.value?.tokens || 0) / contextWindow.value * 100)) : 0);
const runNotes = computed(() => manualRunEntries.value.filter((entry) => entry.note));
const title = computed(() => activeSession.value?.title || "新对话");
const pageTitles = { automations: "自动化", connectors: "连接器", audit: "活动审计", board: "任务看板", settings: "设置", inbox:"收件箱", teamchat:"团队聊天室" };
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
].map(row=>({...row,label:t(row.label),description:t(row.description)})));
const modelOptions = computed(() => [...new Set([model.value, ...models.value].filter(Boolean))].map((item) => ({ value: item, label: config.value.model_labels?.[item] || (item.includes(":") ? item.split(":").slice(1).join(":") : item), description: models.value.includes(item) ? item : `${item} · 当前会话模型` })));
const requestKinds = new Set(["approval", "dirreq", "toolreq", "planreq", "teamreq", "itemsreq", "question"]);
const pending = computed(() => unattended.value ? null : [...messages.value].reverse().find((item) => requestKinds.has(item.kind) && !item.resolved && !sessionInbox.value.some(row=>inboxMatches(item,row))));

function addNotice(text) {
  messages.value.push({ kind: "notice", text });
}

function updateTool(data) {
  const item = [...messages.value].reverse().find((row) => row.kind === "tool" && row.name === data.name && row.status === "running");
  if (item) Object.assign(item, { status: data.status || "ok", preview: data.result_preview || data.reason || "", ...approvalMeta(data) });
}

function handleEvent(event) {
  const data = event.data || {};
  if(event.type==='memory_saved'){ const notice=memoryNotice(data); if(notice)messages.value.push(notice); window.dispatchEvent(new Event('ocw-memory-changed')); return; }
  if(requestEvents.has(event.type))refreshBackground();
  if (event.type !== 'compacting') compacting.value = false;
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
    temporary.value = !!data.temp_workspace;
    if (data.command_trust?.required) trustRequest.value = data.command_trust;
    loadSkills(); refreshBackground();
    if (typeof data.running === "boolean") running.value = data.running;
  } else if (event.type === "turn_start") {
    running.value = true;
    streaming.value = "";
    streamReasoning.value = '';
    const lastUser = [...messages.value].reverse().find(item => item.kind === 'user');
    if (data.source?.connector) messages.value.push({kind:"connector",source:data.source,text:data.source.text || data.display || data.input || "",ts:data.source.ts});
    else if (data.input && lastUser?.sentInput !== data.input && lastUser?.text !== data.input && lastUser?.text !== data.display) messages.value.push({ kind: "user", text: data.display || data.input });
  } else if (event.type === "assistant_delta") {
    streaming.value += data.text || "";
  } else if (event.type === 'reasoning_delta') {
    streamReasoning.value += data.text || '';
  } else if (event.type === 'compacting') {
    compacting.value = true;
  } else if (event.type === "assistant_message") {
    if (data.usage) usage.value = contextUsage(data.usage);
    totals.value = addUsage(totals.value, data.usage);
    if (data.text || data.reasoning || streaming.value || streamReasoning.value) messages.value.push({ kind: "assistant", text: data.text || streaming.value, reasoning: data.reasoning || streamReasoning.value });
    streaming.value = "";
    streamReasoning.value = '';
  } else if (event.type === "tool_proposed") {
    if (data.name === 'todo_write') todos.value = normalizeTodos(data.arguments?.todos || data.arguments?.items);
    messages.value.push({ kind: "tool", id: newId(), name: data.name, args: data.arguments || {}, status: "running" });
  } else if (event.type === "tool_finished") {
    updateTool(data);
    artifactVersion.value++;
  } else if (event.type === "permission_required") {
    messages.value.push({
      kind: "approval",
      name: data.name,
      reason: data.reason,
      args: data.arguments || {},
      category: data.category,
      standingTarget: data.standing_target,
      readonlyOk: !!data.readonly_ok,
      ...approvalMeta(data),
    });
  } else if (event.type === "directory_requested") {
    messages.value.push({ kind: "dirreq", reason: data.reason || "", path: data.path || "", writable: !!data.writable, primary: !!data.primary });
  } else if (event.type === "tool_requested") {
    messages.value.push({ kind: "toolreq", tool: data.name || "", reason: data.reason || "", installable: data.installable === true, version: data.version || "", summary: data.summary || "" });
  } else if (event.type === "plan_proposed") {
    messages.value.push({ kind: "planreq", plan: data.plan || "" });
  } else if (event.type === "team_proposed") {
    messages.value.push({ kind: "teamreq", members: data.members || [], note: data.note || "", enable_chat: !!data.enable_chat });
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
    flushPartial();
    running.value = false;
    artifactVersion.value++;
    refreshSessions();
  } else if (event.type === 'turn_end') {
    if (data.status === 'max_iterations_exceeded') addNotice('本轮已达到最大执行步数，可发送新消息继续。');
  } else if (event.type === "interrupted") {
    flushPartial();
    running.value = false;
    addNotice("已停止生成");
  } else if (event.type === "error") {
    flushPartial();
    running.value = false;
    messages.value.push({ kind: 'notice', text: data.error || '请求失败', retriable: true });
  } else if (event.type === 'input_rejected') {
    running.value = !!socket?.running;
    addNotice(data.error || '输入被拒绝');
  } else if (event.type === "mode_notice" || event.type === "model_changed" || event.type === "compacted") {
    if (event.type === "model_changed" && data.model) model.value = data.model;
    addNotice(data.text || "会话设置已更新");
  }
}

function flushPartial() {
  if (streaming.value || streamReasoning.value) messages.value.push({ kind: 'assistant', text: streaming.value, reasoning: streamReasoning.value });
  streaming.value = ''; streamReasoning.value = '';
}
async function loadSkills() {
  const id = sessionId.value;
  try { const rows = await sessionSkills(id, workspace.value); if (id === sessionId.value) { skills.value = rows; if (chosenSkill.value && !rows.some(s => s.name === chosenSkill.value && s.enabled)) chosenSkill.value = ''; } }
  catch (error) { if (id === sessionId.value) attachmentError.value = `技能列表加载失败：${error.message}`; }
}
async function addFiles(files) {
  const id = sessionId.value; attachmentLoads++; attaching.value = true; attachmentError.value = '';
  const errors = [];
  for (const file of Array.from(files)) {
    try {
      const attachment = await prepareAttachment(file, { max_pages: config.value.pdf_max_pages, max_mb: config.value.pdf_max_mb }, inspectPdf);
      if (id === sessionId.value && !attachments.value.some(a => a.name === attachment.name && (a.text || a.data_url) === (attachment.text || attachment.data_url))) attachments.value.push(attachment);
    } catch (error) { errors.push(error.message); }
  }
  if (id === sessionId.value) attachmentError.value = errors.join('；');
  attachmentLoads--; attaching.value = attachmentLoads > 0;
}
function pasteFiles(event) { const files = [...(event.clipboardData?.items || [])].filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean); if (files.length) { event.preventDefault(); addFiles(files); } }
function dropFiles(event) { if (event.dataTransfer?.files.length) { event.preventDefault(); addFiles(event.dataTransfer.files); } }
function chooseSkill(skill) { chosenSkill.value = skill.name; draft.value = ''; slashDismissed.value = true; }
function openArtifact(event) { surface.value='session'; artifactPath.value = event.detail?.path || ''; panel.value = 'files'; artifactVersion.value++; }
function openBoard(event) { boardItem.value=Number(String(event?.detail?.path || '').replace(/^\D+/,'')) || null; surface.value = 'board'; panel.value = ''; }
function scrollBottom() { atBottom.value = true; nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; }); }
function trackScroll() { const el = scroller.value; if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }
function shortcut(event) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchOpen.value = !searchOpen.value; } }
async function sessionAction(fn) { actionBusy.value = true; actionError.value = ''; try { requireSuccess(await fn()); await refreshSessions(); closeRowMenu(); } catch (error) { actionError.value = error.message; } finally { actionBusy.value = false; } }
function startRename(item) { renameTarget.value = item; renameDraft.value = item.title || ''; closeRowMenu(); }
async function saveRename() { await sessionAction(() => renameSession(renameTarget.value.session_id, renameDraft.value.trim())); if (!actionError.value) renameTarget.value = null; }
async function changeLayout(value) { await sessionAction(() => setNavLayout(value)); if (!actionError.value) { config.value.nav_layout = value; expandedGroups.value = {}; } }
function allowAnyway(item) { if (running.value || !connected.value) return; socket.allowAnyway(item.name, item.args); item.overridden = true; transmit({ text: `请重试 ${item.name}，我已允许这一次完全相同的操作。`, attachments: [] }); }
async function trustWorkspace() { trustSaving.value = true; trustError.value = ''; try { requireSuccess(await setWorkspaceTrusted(trustRequest.value.workspace, true)); trustRequest.value = null; } catch (error) { trustError.value = error.message; } finally { trustSaving.value = false; } }
function savedProject(path) { if (!path) return; workspace.value = path; temporary.value = false; socket?.close(); connections.delete(sessionId.value); connect(); artifactVersion.value++; refreshSessions(); }
function resetSessionUi() { backgroundVersion++; sessionInbox.value=[]; unattended.value=false; runContext.value=null; boardItem.value=null; attachments.value = []; draft.value = ''; chosenSkill.value = ''; skills.value = []; streamReasoning.value = ''; totals.value = {}; todos.value = []; trustRequest.value = null; temporary.value = false; attachmentError.value = ''; artifactPath.value = ''; compacting.value = false; atBottom.value = true; }

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
        connection.readyData = event.data || {};
        connection.running = !!event.data?.running;
        void manualRuns.ready(id, connection.running).then(releaseInactiveConnections);
      }
      if (event.type === "turn_start") connection.running = true;
      if (['turn_done', 'error', 'interrupted'].includes(event.type)) connection.running = false;
      void manualRuns.event(id, event).then(releaseInactiveConnections);
      if (id === sessionId.value) handleEvent(event);
      else if(event.type==='memory_saved')window.dispatchEvent(new Event('ocw-memory-changed'));
    },
    onOpen: () => {
      connection.connected = true;
      if (id === sessionId.value) {
        connected.value = true;
        status.value = folder ? "正在初始化工作区…" : "已连接";
      }
      if (openingText) {
        const packet = typeof openingText === 'string' ? { text: openingText, attachments: [] } : openingText;
        if (id === sessionId.value) {
          messages.value.push({ kind: "user", text: packet.skill ? `/${packet.skill} ${packet.text}` : packet.text, sentInput: packet.text, attachments: packet.attachments, ts: Date.now() / 1000 });
          draft.value = "";
        }
        connection.userMessage(packet.text, openingModel, packet.attachments, packet.skill);
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
  if (socket.readyData) handleEvent({ type: 'ready', data: { ...socket.readyData, command_trust: undefined, running: socket.running } });
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
  await sessionAction(() => setSessionFlags(item.session_id, { archived: !item.archived }));
  if (actionError.value) return;
  rowMenu.value = "";
  await refreshSessions();
  if (!item.archived && item.session_id === sessionId.value) newSession(item.agent || agent.value);
}

async function removeConversation(item) {
  if (deleteArmed.value !== item.session_id) {
    deleteArmed.value = item.session_id;
    return;
  }
  await sessionAction(() => deleteSession(item.session_id));
  if (actionError.value) return;
  rowMenu.value = "";
  deleteArmed.value = "";
  await refreshSessions();
  if (item.session_id === sessionId.value) newSession(item.agent || agent.value);
}

async function selectSession(item) {
  resetSessionUi();
  pendingMessage = "";
  connected.value = false;
  socket = null;
  surface.value = "session";
  sessionId.value = item.session_id;
  runContext.value=runContexts.get(item.session_id) || manualRunEntries.value.find(r=>r.session_id===item.session_id) || null;
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
    totals.value = usageTotals(rows);
    const todo = [...messages.value].reverse().find(item => item.kind === 'tool' && item.name === 'todo_write');
    if (todo) todos.value = normalizeTodos(todo.args.todos || todo.args.items);
  } catch { if (sessionId.value === item.session_id) addNotice("无法加载历史消息"); }
  if (sessionId.value !== item.session_id) return;
  connect();
}

function newSession(persona = personas.value.find(p=>p.default && p.enabled!==false)?.id || agent.value) {
  resetSessionUi();
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
  resetSessionUi();
  manualRuns.track(prepared);
  rememberRun(prepared);runContext.value=prepared;
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
  rememberRun(payload);
  selectSession({ session_id: payload.id || payload.session_id, workspace: payload.workspace, agent: payload.agent });
}

async function reloadConfig() {
  try {
    const [nextSettings, nextPersonas] = await Promise.all([getSettings(), getPersonas()]);
    configError.value = "";
    config.value = settingsWithDefaults(nextSettings);
    models.value = nextSettings.models || [];
    personas.value = nextPersonas;
    await refreshSessions();
    showAllArchived.value = false;
    expandedGroups.value = {};
    if (mode.value === "auto-approve" && !config.value.auto_approve) changeMode("interactive");
    if (!messages.value.length && !running.value) {
      changeModel(nextSettings.model || nextSettings.default_model || models.value[0] || model.value);
      if (!visiblePersonas.value.some((p) => p.id === agent.value)) newSession();
    }
  } catch (error) { configError.value = `设置同步失败：${error.message}`; }
}



function send() {
  let text = draft.value.trim();
  if (!canSend.value || running.value) return;
  if (slashOpen.value && slashSkills.value.length) { chooseSkill(slashSkills.value[Math.max(0, skillIndex.value)]); return; }
  let skill = chosenSkill.value || undefined;
  const explicit = text.match(/^\/(\S+)\s+([\s\S]*)$/);
  if (!skill && explicit && skills.value.some(row => row.name === explicit[1] && row.enabled)) { skill = explicit[1]; text = explicit[2].trim(); }
  const packet = { text, attachments: [...attachments.value], skill };
  if (needsWorkspace.value) {
    sendGate.value = packet;
    folderError.value = "";
    draft.value = "";
    attachments.value = []; chosenSkill.value = '';
    return;
  }
  if (!connected.value || !socket) return;
  transmit(packet);
  draft.value = "";
  attachments.value = []; chosenSkill.value = '';
}
function transmit(packet) {
  messages.value.push({ kind: 'user', text: packet.skill ? `/${packet.skill} ${packet.text}` : packet.text, sentInput: packet.text, attachments: packet.attachments, ts: Date.now() / 1000 });
  running.value = true;
  socket.userMessage(packet.text, model.value, packet.attachments, packet.skill);
  scrollBottom();
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
  draft.value = sendGate.value.text || '';
  attachments.value = sendGate.value.attachments || [];
  chosenSkill.value = sendGate.value.skill || '';
  sendGate.value = "";
  folderError.value = "";
}

function keydown(event) {
  if (event.isComposing || event.keyCode === 229) return;
  if (slashOpen.value && ['ArrowUp','ArrowDown','Enter','Escape'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Escape') slashDismissed.value = true;
    else if (event.key === 'Enter' && slashSkills.value[skillIndex.value]) chooseSkill(slashSkills.value[skillIndex.value]);
    else if (event.key === 'ArrowDown') skillIndex.value = Math.min(slashSkills.value.length - 1, skillIndex.value + 1);
    else if (event.key === 'ArrowUp') skillIndex.value = Math.max(0, skillIndex.value - 1);
    return;
  }
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
  else if (item.kind === "dirreq") socket?.respondDirectory(result.approved, result.path || item.path, result.writable);
  else if (item.kind === "toolreq") socket?.respondTool(result.approved);
  else if (item.kind === "planreq") { socket?.respondPlan(result.approved, result.mode, result.feedback); if (result.approved && result.mode) mode.value = result.mode; }
  else if (item.kind === "teamreq") socket?.respondTeam(result.approved, result.feedback, result.enableChat);
  else if (item.kind === "itemsreq") socket?.respondItems(result.approved, result.feedback);
  item.resolved = result.decision || (result.approved ? "approved" : "denied");
}

function changeMode(value) { mode.value = value === "auto-approve" && !config.value.auto_approve ? "interactive" : value; socket?.setMode(mode.value); }
function changeModel(value) { model.value = value; socket?.setModel(value); }
function toggleTheme() { setTheme(!dark.value); }
function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function compactAge(value) {
  const time = Date.parse(value || "");
  if (!time) return "";
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return t("刚刚");
  if (minutes < 60) return `${minutes} ${t('分钟')}`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} ${t('小时')}`;
  return `${Math.floor(minutes / 1440)} ${t('天')}`;
}

watch([messages, streaming, streamReasoning], () => nextTick(() => {
  if (scroller.value && atBottom.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}), { deep: true });
watch(draft, () => { slashDismissed.value = false; skillIndex.value = 0; });
watch(surface, (value) => { if (value === 'session') loadSkills(); });
watch([sessionId, workspace], loadSkills);
watch(sessionId,refreshBackground);
watch(dark, (value) => document.documentElement.dataset.theme = value ? "dark" : "light", { immediate: true });

onMounted(async () => {
  stopEvents=connectEvents(globalEvent);
  backgroundTimer=setInterval(refreshBackground,4000);
  window.addEventListener("click", closeRowMenu);
  window.addEventListener('keydown', shortcut);
  window.addEventListener('ocw-open-artifact', openArtifact);
  window.addEventListener('ocw-open-board', openBoard);
  try {
    const [health, settings, personaRows, sessionRows] = await Promise.all([getHealth(), getSettings(), getPersonas(), getSessions()]);
    config.value = settingsWithDefaults(settings);
    onboarding.value = settings.onboarded === false;
    model.value = settings.model || settings.default_model || health.model || model.value;
    models.value = settings.models || [];
    personas.value = personaRows;
    sessions.value = sessionRows;
    if (sessionRows[0]) await selectSession(sessionRows[0]);
    else newSession();
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
  backgroundVersion++;clearInterval(backgroundTimer);clearTimeout(toastTimer);stopEvents?.();
  window.removeEventListener("click", closeRowMenu);
  window.removeEventListener('keydown', shortcut);
  window.removeEventListener('ocw-open-artifact', openArtifact);
  window.removeEventListener('ocw-open-board', openBoard);
  for (const connection of connections.values()) connection.close();
  for (const timer of reconnectTimers.values()) clearTimeout(timer);
  if (refreshTimer) window.clearInterval(refreshTimer);
});
</script>

<template>
  <div class="app" :class="{ 'sidebar-hidden': !sidebarOpen }">
    <OnboardingView v-if="onboarding" @close="onboarding=false" @done="finishSetup" @change="reloadConfig" />
    <aside class="sidebar">
      <header class="brand">
        <div class="logo">O</div>
        <strong>AIWorker</strong>
        <button class="icon-button pin" :title="t(&quot;收起侧边栏&quot;)" @click="sidebarOpen = false">‹</button>
      </header>
      <button class="new-button" @click="newSession()"><span>＋</span>{{ t(" 新对话") }}</button>
      <button class="search-button" @click="searchOpen = true">{{ t("⌕ 搜索对话 ") }}<small>Ctrl+K</small></button>
      <label class="section-label">{{ t("导航布局 ") }}<select :value="config.nav_layout || 'flat'" :disabled="actionBusy" @change="changeLayout($event.target.value)"><option value="flat">{{ t("按时间") }}</option><option value="grouped">{{ t("按智能体 / 项目") }}</option></select></label>
      <nav class="session-list">
        <section v-for="group in sessionGroups" :key="group.key" class="session-group">
        <div class="section-label group-title" :title="group.label">{{ ['pinned','recent'].includes(group.key) ? t(group.label) : group.label }}</div>
        <div v-for="item in (expandedGroups[group.key] ? group.items : group.items.slice(0,config.sessions_peek))" :key="item.session_id" class="session-row-wrap">
          <button class="session-row" :class="{ active: surface === 'session' && item.session_id === sessionId }" @click="selectSession(item)">
            <span class="session-icon">◇</span>
            <span class="session-copy"><strong>{{ item.title || t("未命名对话") }}</strong><small>{{ item.agent }} · {{ compactAge(item.updated_at) }}</small></span>
            <span v-if="item.liveness === 'working'" class="live-dot"></span>
          </button>
          <button class="row-menu-button" :title="t(&quot;对话操作&quot;)" @click.stop="toggleRowMenu(item.session_id)">⋯</button>
          <div v-if="rowMenu === item.session_id" class="row-menu" role="menu" @click.stop>
            <button @click="startRename(item)">{{ t("重命名") }}</button>
            <button :disabled="actionBusy" @click="sessionAction(() => setSessionFlags(item.session_id, { pinned: !item.pinned }))">{{ item.pinned ? t("取消置顶") : t("置顶") }}</button>
            <button @click="archiveConversation(item)">{{ t("▣ 归档") }}</button>
            <div class="menu-separator"></div>
            <button class="danger-item" @click="removeConversation(item)">{{ deleteArmed === item.session_id ? t("再次点击确认删除") : t("⌫ 删除") }}</button>
          </div>
        </div>
        <button v-if="group.items.length > config.sessions_peek" class="archived-toggle" @click="expandedGroups[group.key] = !expandedGroups[group.key]">{{ expandedGroups[group.key] ? t("收起对话") : (t("显示更多（") + (group.items.length - config.sessions_peek) + "）") }}</button>
        </section>
        <div v-if="!recentSessions.length && !archivedSessions.length" class="empty-side">{{ t("还没有历史对话") }}</div>
        <div v-if="archivedSessions.length" class="archived-section">
          <button class="archived-toggle" @click="showArchived = !showArchived"><span>{{ showArchived ? '⌄' : '›' }}</span>{{ t("已归档（") }}{{ archivedSessions.length }}）</button>
          <div v-if="showArchived">
            <div v-for="item in shownArchived" :key="item.session_id" class="session-row-wrap">
              <button class="session-row archived-row" @click="selectSession(item)"><span class="session-icon">◇</span><span class="session-copy"><strong>{{ item.title || t("未命名对话") }}</strong><small>{{ item.agent }} · {{ compactAge(item.updated_at) }}</small></span></button>
              <button class="row-menu-button" :title="t(&quot;对话操作&quot;)" @click.stop="toggleRowMenu(item.session_id)">⋯</button>
              <div v-if="rowMenu === item.session_id" class="row-menu" role="menu" @click.stop>
                <button @click="startRename(item)">{{ t("重命名") }}</button>
                <button @click="archiveConversation(item)">{{ t("↶ 取消归档") }}</button>
                <div class="menu-separator"></div>
                <button class="danger-item" @click="removeConversation(item)">{{ deleteArmed === item.session_id ? t("再次点击确认删除") : t("⌫ 删除") }}</button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <button v-if="showArchived && archivedSessions.length > config.sessions_peek" class="archived-toggle" @click="showAllArchived = !showAllArchived">{{ showAllArchived ? t("收起归档") : t("显示更多归档") }}</button>
      <nav class="surface-nav">
        <button :class="{ active: surface === 'automations' }" @click="automationFocus='';surface = 'automations'"><span>◷</span>{{ t("自动化") }}<span v-if="automationUnread" class="badge">{{ automationUnread }}</span></button>
        <button :class="{active:surface==='inbox'}" @click="surface='inbox'"><span>▤</span>{{ t("收件箱") }}<span v-if="inboxCount" class="badge">{{ inboxCount }}</span></button>
        <button :class="{ active: surface === 'connectors' }" @click="openConnectors()"><span>⌁</span>{{ t("连接器") }}</button>
        <button :class="{ active: surface === 'board' }" @click="surface = 'board'"><span>▦</span>{{ t("任务看板") }}</button>
        <button :class="{ active: surface === 'audit' }" @click="surface = 'audit'"><span>◎</span>{{ t("活动审计") }}</button>
        <button :class="{ active: surface === 'settings' }" @click="surface = 'settings'"><span>⚙</span>{{ t("设置") }}</button>
      </nav>
      <footer class="sidebar-footer">
        <button @click="toggleTheme">{{ dark ? '☀' : '◐' }} {{ dark ? t("浅色模式") : t("深色模式") }}</button>
        <span :class="['connection-dot', { online: connected }]"></span><small>{{ t(status) }}</small>
      </footer>
    </aside>

    <main class="main">
      <header class="topbar">
        <button v-if="!sidebarOpen" class="icon-button" :title="t(&quot;展开侧边栏&quot;)" @click="sidebarOpen = true">☰</button>
        <div class="title-block"><strong>{{ surface === 'session' ? (activeSession?.title || t('新对话')) : t(pageTitle) }}</strong><small v-if="surface === 'session'">{{ activePersona?.name || agent }} · {{ model }}<template v-if="workspace"> · {{ workspace }}</template></small><small v-else>AIWorker</small></div>
        <button v-if="surface === 'session'" class="icon-button" :title="t(&quot;新对话&quot;)" @click="newSession()">＋</button>
        <template v-if="surface === 'session'"><button class="btn" @click="artifactPath = ''; panel = panel === 'files' ? '' : 'files'">{{ t("文件") }}</button><button class="btn" @click="loadSkills(); panel = panel === 'access' ? '' : 'access'">{{ t("权限与项目") }}</button></template>
      </header>

      <p v-if="config.model_ready===false" class="status-note">{{ t("当前默认模型尚未连接。") }}<button class="btn" @click="settingsTab='models';surface='settings'">{{ t("配置模型") }}</button></p>
      <p v-if="configError" class="error-text status-note" role="alert">{{ t(configError) }} <button class="btn" @click="reloadConfig">{{ t("重试同步") }}</button></p>
      <p v-if="actionError" class="error-text status-note" role="alert">{{ t(actionError) }}</p>
      <div v-for="entry in runNotes" :key="entry.run_id" class="status-note" role="status">
        {{ entry.note }}
        <button class="btn" @click="selectSession(entry)">{{ t("查看运行会话") }}</button>
        <button v-if="entry.state === 'completed'" class="btn" @click="manualRuns.finish(entry.session_id)">{{ t("重试回写") }}</button>
      </div>
      <p v-if="backgroundError" class="error-text status-note" role="alert">{{ t(backgroundError) }} <button class="btn" @click="refreshBackground">{{ t("重试") }}</button></p>
      <aside v-if="runToast" class="run-toast" role="status">{{ t("自动化「") }}{{ runToast.task_title }}{{ t("」已开始运行 ") }}<button class="btn" @click="openRunSession(runToast);runToast=null">{{ t("查看运行") }}</button><button class="icon-button" :aria-label="t(&quot;关闭运行通知&quot;)" @click="runToast=null">×</button></aside>
      <template v-if="surface === 'session'">
      <div v-if="runContext || sessionId.startsWith('__run__')" class="automation-context">{{ t("自动化运行：") }}{{ runContext?.task_title || t("历史任务") }} <button class="btn" @click="returnToAutomation">{{ t("返回自动化") }}{{ runContext?.task_id ? t("详情") : t("列表") }}</button></div>
      <div v-if="activeSession?.team?.role || teamMembers.length>1" class="team-roster"><span>{{ t("团队成员") }}</span><button v-for="member in teamMembers" :key="member.session_id" class="btn" :disabled="member.session_id===sessionId" @click="selectSession(member)">{{ member.team?.name || member.team?.actor || member.title }} · {{ member.team?.status || member.liveness || t("空闲") }} {{ member.team?.current_item || '' }}</button><button v-if="teamId" class="btn" @click="surface='teamchat'">{{ t("团队聊天 ") }}<span v-if="activeSession?.team?.chat_unread" class="badge">{{ activeSession.team.chat_unread }}</span></button><button class="btn" @click="openBoard">{{ t("团队看板") }}</button></div>
      <p v-if="unattended" class="status-note">{{ t("无人值守已开启 · 待处理事项会保存在收件箱。") }}</p>
      <div ref="scroller" class="conversation" @scroll="trackScroll" @dragover.prevent @drop="dropFiles">
        <section v-if="!messages.length && !streaming" class="hero">
          <div class="hero-mark">◇</div>
          <h1>{{ t("今天想完成什么？") }}</h1>
          <p>{{ t("选择 Coworker，然后描述任务。AIWorker 会在本地工作区中协助你。") }}</p>
          <div class="suggestions">
            <button @click="draft = t(&quot;帮我梳理这个项目的结构和核心模块&quot;)">{{ t("梳理项目结构 ") }}<span>→</span></button>
            <button @click="draft = t(&quot;检查当前项目并修复构建问题&quot;)">{{ t("修复构建问题 ") }}<span>→</span></button>
            <button @click="draft = t(&quot;总结最近的代码改动&quot;)">{{ t("总结代码改动 ") }}<span>→</span></button>
          </div>
        </section>

        <div v-else class="transcript">
          <article v-for="(item, index) in groupedMessages" :key="index" :class="['message', item.kind]">
            <template v-if="item.kind === 'user'">
              <div class="user-bubble">{{ item.text }}</div><small>{{ formatTime(item.ts) }}</small>
              <div v-if="item.attachments?.length" class="attachments"><div v-for="(file,i) in item.attachments" :key="i" class="attachment"><img v-if="file.kind === 'image'" :src="file.data_url" :alt="file.name" /><span>{{ file.name }}</span></div></div>
            </template>
            <template v-else-if="item.kind === 'connector'"><div class="connector-message"><header tabindex="0" :title="[item.source.sender_id,item.source.channel_id].filter(Boolean).join(' · ')"><strong>{{ item.source.connector }} · {{ item.source.sender_name || item.source.sender_id || t("外部消息") }}</strong><small>{{ item.source.channel_name || item.source.channel_id }} · {{ formatTime(item.ts) }}</small></header><p>{{ item.text }}</p><button v-if="item.source.board" class="btn" @click="openBoard">{{ t("查看相关看板") }}</button></div></template>
            <template v-else-if="item.kind === 'assistant'">
              <details v-if="item.reasoning" class="reasoning"><summary>{{ t("思考过程") }}</summary><pre>{{ item.reasoning }}</pre></details>
              <MarkdownView class="assistant-copy" :text="item.text" /><small>{{ formatTime(item.ts) }}</small>
            </template>
            <template v-else-if="item.kind === 'steps'"><details class="tool-group" open><summary>{{ t("工具步骤（") }}{{ item.items.length }}）</summary><details v-for="(step,i) in item.items" :key="step.id || i" class="tool-card"><summary><span :class="['tool-status', step.status]"></span>{{ step.name }} <small>{{ step.status === 'running' ? t("运行中") : step.status === 'denied' ? t("已拒绝") : step.status === 'unknown' ? t("结果未知") : step.status }}</small><small v-if="step.approvalOrigin"> · {{ t(approvalLabels[step.approvalOrigin] || step.approvalOrigin) }}</small></summary><p v-if="step.approvalNote">{{ step.approvalNote }}</p><p v-if="step.approvalGrant">{{ t("授权：") }}{{ step.approvalGrant }}</p><pre>{{ JSON.stringify(step.args, null, 2) }}{{ '\n\n' + (step.preview || '') }}</pre><button v-if="step.approvalOrigin === 'reviewer_denied' && !step.overridden" class="btn" :disabled="running || !connected" @click="allowAnyway(step)">{{ t("仍然允许一次") }}</button></details></details></template>
            <template v-else-if="item.kind === 'memory'"><div class="memory-notice"><strong>{{ item.undone ? t("已撤销记忆") : typeof item.previous==='string' ? t("已修改记忆") : t("已新增记忆") }}</strong><p>{{ item.text }}</p><button v-if="!item.undone" class="btn" :disabled="item.busy" @click="undoSavedMemory(item)">{{ t("撤销记忆") }}</button><p v-if="item.error" class="error-text" role="alert">{{ item.error }}</p></div></template>
            <template v-else-if="item.kind === 'notice'"><div class="notice-line">{{ item.text }} <button v-if="item.retriable" class="btn" :disabled="running || !connected" @click="socket.retry(); running = true">{{ t("重试") }}</button></div></template>
            <template v-else-if="item.kind === 'approval'"><div class="inline-card"><strong>{{ t("允许执行 ") }}{{ item.name }}？</strong><p>{{ item.reason || t("此操作需要你的确认。") }}</p></div></template>
            <template v-else-if="item.kind === 'question'"><div class="inline-card"><strong>{{ item.text }}</strong></div></template>
          </article>
          <article v-if="streaming || streamReasoning" class="message assistant"><details v-if="streamReasoning" class="reasoning" open><summary>{{ t("思考过程") }}</summary><pre>{{ streamReasoning }}</pre></details><MarkdownView class="assistant-copy" :text="streaming" /><span v-if="streaming" class="cursor"></span></article>
          <div v-if="running && (compacting || !streaming)" class="thinking-row"><span></span>{{ compacting ? t("正在压缩上下文…") : t("正在处理任务…") }}</div>
        </div>
      </div>
      <button v-if="!atBottom" class="btn return-bottom" @click="scrollBottom">{{ t("↓ 回到底部") }}</button>
      <details v-if="todos.length" class="todo-progress"><summary>{{ t("任务进度 ") }}{{ todos.filter(t => t.status === 'completed').length }} / {{ todos.length }}</summary><div v-for="(todo,i) in todos" :key="i"><span>{{ todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◉' : '○' }}</span> {{ todo.content }}</div></details>

      <div v-if="sessionInbox.length" class="inline-inbox"><InboxCard v-for="item in sessionInbox" :key="item.id" :item="item" :live-item="messages.find(row=>row.inboxId===item.id)" :auto-approve="mode==='auto-approve'" inline @resolved="resolvedInbox" /></div>
      <section v-if="pending" :class="pending.kind === 'question' ? 'question-bar' : 'request-bar'">
        <QuestionPrompt v-if="pending.kind === 'question'" :key="`question-${sessionId}-${messages.indexOf(pending)}`" :item="pending" @answer="respond" />
        <ApprovalPrompt v-else :key="`request-${sessionId}-${messages.indexOf(pending)}`" :item="pending" :auto-approve="mode === 'auto-approve'" :run-task="!!runContext?.task_id || manualRunEntries.some(entry => entry.session_id === sessionId)" @resolve="resolveRequest" />
      </section>

      <footer class="composer-area">
        <details v-if="totalTokens" class="usage-totals"><summary>{{ t("累计用量 ") }}{{ totalTokens.toLocaleString() }} tokens</summary><div v-for="(row,name) in totals" :key="name">{{ name }}{{ t("：输入 ") }}{{ row.input }}{{ t(" · 输出 ") }}{{ row.output }}{{ t(" · 缓存读取 ") }}{{ row.cache_read }}{{ t(" · 缓存写入 ") }}{{ row.cache_write }}</div></details>
        <div v-if="config.context_bar" class="context-usage" role="status">
          <template v-if="usage && contextWindow">
            <span>{{ t("上下文 ") }}{{ contextPercent }}% · {{ usage.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tokens</span>
            <progress :value="contextPercent" max="100" :aria-label="t(&quot;上下文使用进度&quot;)"></progress>
          </template>
          <span v-else>{{ usage ? (t("上下文 ") + (usage.tokens.toLocaleString()) + t(" tokens（模型容量未知）")) : t("上下文用量：等待模型返回数据") }}</span>
        </div>
        <p v-if="attachmentError" class="error-text" role="alert">{{ t(attachmentError) }}</p>
        <div class="composer" @dragover.prevent @drop="dropFiles">
          <div v-if="attachments.length" class="attachments"><div v-for="(file,i) in attachments" :key="i" class="attachment"><img v-if="file.kind === 'image'" :src="file.data_url" :alt="file.name" /><details v-else-if="file.kind === 'text'"><summary>{{ file.name }}</summary><pre>{{ file.text.slice(0,4000) }}</pre></details><span v-else>{{ file.name }}</span><button type="button" :aria-label="(t(&quot;移除附件 &quot;) + (file.name))" @click="attachments.splice(i,1)">×</button></div></div>
          <div v-if="chosenSkill" class="skill-chip">/{{ chosenSkill }}<button :aria-label="t(&quot;取消技能&quot;)" @click="chosenSkill = ''">×</button></div>
          <div v-if="slashOpen" class="slash-menu" role="listbox" :aria-label="t(&quot;选择技能&quot;)"><button v-for="(skill,i) in slashSkills" :key="skill.name" :class="{active: i === skillIndex}" role="option" :aria-selected="i === skillIndex" @mousedown.prevent @click="chooseSkill(skill)">/{{ skill.name }} <small>{{ skill.description }}</small></button><p v-if="!slashSkills.length">{{ t("没有匹配的已启用技能，按 Esc 可发送普通文字。") }}</p></div>
          <textarea v-model="draft" :disabled="!connected && !needsWorkspace" rows="1" :placeholder="needsWorkspace ? t(&quot;描述任务，发送时选择工作目录&quot;) : connected ? t(&quot;描述任务，Enter 发送，Shift + Enter 换行&quot;) : t(&quot;等待本地服务连接…&quot;)" @keydown="keydown" @paste="pasteFiles"></textarea>
          <div class="composer-toolbar">
            <div class="selectors">
              <button class="btn" :disabled="attaching" :title="t(&quot;添加附件&quot;)" @click="fileInput.click()">{{ attaching ? t("读取中…") : t("＋ 附件") }}</button><input ref="fileInput" type="file" multiple hidden @change="addFiles($event.target.files); $event.target.value = ''" />
              <SelectMenu :model-value="agent" :options="personaOptions" icon="◇" :label="t(&quot;选择智能体&quot;)" @change="changePersona" />
              <SelectMenu :model-value="mode" :options="modeOptions" icon="◉" :label="t(&quot;选择权限模式&quot;)" @change="changeMode" />
              <SelectMenu v-if="modelOptions.length" class="model-selector" :model-value="model" :options="modelOptions" icon="✦" :label="t(&quot;选择模型&quot;)" wide @change="changeModel" />
            </div>
            <button v-if="running" class="stop-button" :title="t(&quot;停止&quot;)" @click="socket.interrupt()">■</button>
            <button v-else class="send-button" :disabled="!canSend || (!connected && !needsWorkspace)" :title="t(&quot;发送&quot;)" :aria-label="t(&quot;发送&quot;)" @click="send">↑</button>
          </div>
        </div>
      </footer>
      </template>
      <AutomationsView v-else-if="surface === 'automations'" :manual-runs="manualRunEntries" :initial-task="automationFocus" @run="openRun" @open-session="openRunSession" @change="refreshBackground" @open-connectors="openConnectors" />
      <ConnectorsView v-else-if="surface === 'connectors'" :initial-connector="connectorFocus" />
      <BoardView v-else-if="surface === 'board'" :key="`${sessionId}-${bindingVersion}`" :session-id="sessionId" :members="teamMembers" :initial-item="boardItem" @open-session="selectSession" />
      <InboxView v-else-if="surface==='inbox'" @open-session="selectSession" @open-connectors="openConnectors" @change="refreshBackground" />
      <TeamChatView v-else-if="surface==='teamchat'" :team-id="teamId" @close="surface='session';refreshSessions()" />
      <AuditView v-else-if="surface === 'audit'" />
      <SettingsView v-else :dark="dark" :initial-tab="settingsTab" @theme-change="setTheme" @settings-change="reloadConfig" @connectors="openConnectors" @use-persona="newSession" @setup="onboarding=true" />
    </main>
    <ArtifactPanel v-if="surface === 'session' && panel === 'files'" :session-id="sessionId" :workspace="workspace" :refresh-key="artifactVersion" :initial-path="artifactPath" @close="panel = ''" />
    <SessionAccess v-if="surface === 'session' && panel === 'access'" :key="sessionId" :session-id="sessionId" :workspace="workspace" :skills="skills" :running="running" :temporary="temporary" :persona="agent" @integrations-change="refreshBackground" @open-connectors="openConnectors" @close="panel = ''" @saved="savedProject" @skills-change="loadSkills" @binding-change="bindingVersion++" @open-board="openBoard" @open-memory="settingsTab = 'memory'; surface = 'settings'; panel = ''" />
    <SessionSearch v-if="searchOpen" :sessions="sessions" :personas="personas" @close="searchOpen = false" @select="selectSession" />
    <div v-if="renameTarget" class="dialog-overlay" @click.self="renameTarget = null"><form class="search-dialog form-card" role="dialog" :aria-label="t(&quot;重命名对话&quot;)" @submit.prevent="saveRename"><h3>{{ t("重命名对话") }}</h3><input v-model="renameDraft" :aria-label="t(&quot;对话标题&quot;)" required autofocus /><p v-if="actionError" class="error-text">{{ t(actionError) }}</p><div class="actions"><button class="btn primary" :disabled="actionBusy || !renameDraft.trim()">{{ t("保存名称") }}</button><button type="button" class="btn" @click="renameTarget = null">{{ t("取消") }}</button></div></form></div>
    <div v-if="trustRequest" class="dialog-overlay"><section class="search-dialog form-card" role="dialog" :aria-label="t(&quot;工作区命令信任&quot;)"><h3>{{ t("信任工作区声明的命令？") }}</h3><p>{{ trustRequest.workspace }}</p><pre>{{ (trustRequest.requested_commands || []).join('\n') }}</pre><p>{{ t("信任后这些声明的命令可按工作区规则执行。你可以在“权限与项目”中撤销。") }}</p><p v-if="trustError" class="error-text">{{ t(trustError) }}</p><div class="actions"><button class="btn" :disabled="trustSaving" @click="trustRequest = null">{{ t("继续逐次询问") }}</button><button class="btn primary" :disabled="trustSaving" @click="trustWorkspace">{{ t("信任此工作区") }}</button></div></section></div>
    <FolderDialog v-if="sendGate" :persona-name="activePersona?.name || agent" :external-error="folderError" @pick="resolveSendFolder" @temp="startTempAndSend" @cancel="cancelSendFolder" />
  </div>
</template>
