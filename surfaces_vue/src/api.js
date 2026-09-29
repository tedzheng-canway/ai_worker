const httpBase = () => globalThis.__COWORKER_HTTP__ || import.meta.env.VITE_COWORKER_HTTP || "http://127.0.0.1:8765";
const wsBase = () => globalThis.__COWORKER_WS__ || import.meta.env.VITE_COWORKER_WS || "ws://127.0.0.1:8765";
const apiToken = () => globalThis.__COWORKER_API_TOKEN__ || import.meta.env.VITE_COWORKER_API_TOKEN || (typeof __COWORKER_DEV_TOKEN__ === "string" ? __COWORKER_DEV_TOKEN__ : "");

const tokenHeader = `X-${"Open"}${"Worker"}-Token`;

export async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = apiToken();
  if (token) headers.set(tokenHeader, token);
  const response = await globalThis.fetch(`${httpBase()}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function openSocket(url) {
  const token = apiToken();
  return token ? new WebSocket(url, ["openworker", token]) : new WebSocket(url);
}

export async function fetchBlob(path) {
  const headers = new Headers();
  if (apiToken()) headers.set(tokenHeader, apiToken());
  const response = await fetch(`${httpBase()}${path}`, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.blob();
}
export function connectEvents(onEvent) {
  let socket, timer, closed = false;
  function open() {
    if (closed) return;
    socket = openSocket(`${wsBase()}/ws/events`);
    socket.onmessage = (event) => { try { onEvent(JSON.parse(event.data)); } catch {} };
    socket.onclose = () => { if (!closed) timer = setTimeout(open, 5000); };
  }
  open();
  return () => { closed = true; clearTimeout(timer); if (socket) { socket.onclose = null; socket.close(); } };
}

export const getHealth = () => request("/v1/health");
export const getSettings = () => request("/v1/settings");
export const getPersonas = async () => (await request("/v1/personas")).personas || [];
export const getSessions = async () => (await request("/v1/sessions")).sessions || [];
export const getMessages = async (id) => (await request(`/v1/sessions/${encodeURIComponent(id)}/messages`)).messages || [];
export const getRecentWorkspaces = async () => (await request("/v1/workspaces/recent")).workspaces || [];
export const pickFolderViaServer = async () => {
  const result = await request("/v1/workspaces/pick", { method: "POST" });
  return result.ok && result.path ? result.path : null;
};
export const openWorkspace = (path) => request("/v1/workspaces/open", json("POST", { path, create: false }));
export const createTempWorkspace = (id) => request("/v1/workspaces/temp", json("POST", { session_id: id, git: true }));
export const setSessionFlags = (id, flags) => request(`/v1/sessions/${encodeURIComponent(id)}`, json("PATCH", flags));
export const deleteSession = (id) => request(`/v1/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
export const renameSession = (id, title) => setSessionFlags(id, { title });
export const setNavLayout = (nav_layout) => request('/v1/settings/nav-layout', json('POST', { nav_layout }));
const sessionPath = (id) => `/v1/sessions/${encodeURIComponent(id)}`;
export const inspectPdf = (data_url) => request('/v1/attachments/inspect-pdf', json('POST', { data_url }));
export const getArtifacts = async (id) => (await request(`${sessionPath(id)}/artifacts`)).artifacts || [];
export const readArtifact = (id, path) => request(`${sessionPath(id)}/artifacts/read?${new URLSearchParams({ path })}`);
export const revealArtifact = (id, path, mode = 'reveal') => request(`${sessionPath(id)}/artifacts/reveal`, json('POST', { path, mode }));
export const getRoots = async (id) => (await request(`${sessionPath(id)}/roots`)).roots || [];
export const addRoot = (id, path, writable) => request(`${sessionPath(id)}/roots`, json('POST', { path, writable }));
export const removeRoot = (id, path) => request(`${sessionPath(id)}/roots?${new URLSearchParams({ path })}`, { method: 'DELETE' });
export const saveSessionAsProject = (id, path) => request(`${sessionPath(id)}/save-as-project`, json('POST', { path }));
export const getTrustedWorkspaces = async () => (await request('/v1/workspaces/trusted')).workspaces || [];
export const setWorkspaceTrusted = (path, trusted) => request('/v1/workspaces/trust', json('POST', { path, trusted }));
export const getProjectMenu = (id, kind) => request(`${sessionPath(id)}/project-menu?${new URLSearchParams({ kind })}`);
export const setProjectBinding = (id, kind, name) => request(`${sessionPath(id)}/bindings`, json('PUT', { kind, name }));
export const nameCurrentProject = (id, kind, name) => request(`${sessionPath(id)}/project-name`, json('POST', { kind, name }));
export const sessionSkills = async (id, workspace) => (await request(`${sessionPath(id)}/skills${workspace ? `?${new URLSearchParams({ workspace })}` : ''}`)).skills || [];
export const setSessionSkill = (id, skill, enabled, workspace) => request(`${sessionPath(id)}/skills`, json('POST', { skill, enabled, ...(workspace ? { workspace } : {}) }));
export const revealSkill = (name) => request(`/v1/skills/${encodeURIComponent(name)}/reveal`, json('POST', {}));
export const stageSkillUpload = (data_b64, filename) => request('/v1/skills/upload', json('POST', { data_b64, filename }));
export const confirmSkillUpload = (token) => request('/v1/skills/upload/confirm', json('POST', { token, scope: 'global' }));

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const getBoard = (id) => request(`/v1/sessions/${encodeURIComponent(id)}/board`);
export const getBoardItem = (id, item) => request(`/v1/sessions/${encodeURIComponent(id)}/board/item?id=${item}`);
export const boardTransition = (id, item, to, comment = "") => request(`/v1/sessions/${encodeURIComponent(id)}/board/transition`, json("POST", { item, to, comment }));
export const boardComment = (id, item, body) => request(`/v1/sessions/${encodeURIComponent(id)}/board/comment`, json("POST", { item, body }));

export const getAutomations = async () => (await request("/v1/automations")).tasks || [];
export const getAutomation = (id) => request(`/v1/automations/${encodeURIComponent(id)}`);
export const createAutomation = (payload) => request("/v1/automations", json("POST", payload));
export const updateAutomation = (id, payload) => request(`/v1/automations/${encodeURIComponent(id)}`, json("PATCH", payload));
export const deleteAutomation = (id) => request(`/v1/automations/${encodeURIComponent(id)}`, { method: "DELETE" });
export const runAutomation = (id) => request(`/v1/automations/${encodeURIComponent(id)}/run`, { method: "POST" });
export const finalizeAutomationRun = (taskId, runId) => request(`/v1/automations/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}/finalize`, { method: "POST" });
export const markAutomationSeen = (id) => request(`/v1/automations/${encodeURIComponent(id)}/seen`, { method: "POST" });

export const getConnectors = async () => (await request("/v1/connectors")).connectors || [];
export const connectConnector = (name, fields) => request(`/v1/connectors/${encodeURIComponent(name)}/connect`, json("POST", { fields }));
export const disconnectConnector = (name) => request(`/v1/connectors/${encodeURIComponent(name)}/disconnect`, { method: "POST" });
export const updateConnectorTools = (name, enabled) => request(`/v1/connectors/${encodeURIComponent(name)}/tools`, json("PATCH", { enabled }));
export const getMcpServers = async () => (await request("/v1/mcp")).servers || [];
export const addMcpServer = (name, config) => request("/v1/mcp", json("POST", { name, config }));
export const updateMcpServer = (name, changes) => request(`/v1/mcp/${encodeURIComponent(name)}`, json("PATCH", changes));
export const deleteMcpServer = (name) => request(`/v1/mcp/${encodeURIComponent(name)}`, { method: "DELETE" });

export async function getAudit(filters = {}) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null && value !== ""));
  return (await request(`/v1/audit${query.size ? `?${query}` : ""}`)).events || [];
}

export const setDefaultModel = (value) => request("/v1/settings/default-model", json("POST", { model: value }));
export const addModel = (value) => request("/v1/settings/models/add", json("POST", { model: value }));
export const removeModel = (value) => request("/v1/settings/models/remove", json("POST", { model: value }));
export const setContextBar = (value) => request("/v1/settings/context-bar", json("POST", { context_bar: value }));
export const setSessionsPeek = (value) => request("/v1/settings/sessions-peek", json("POST", { sessions_peek: value }));
export const setScratchBase = (value) => request("/v1/settings/scratch-base", json("POST", { path: value }));
export const setAutoApprove = (value) => request("/v1/settings/auto-approve", json("POST", { auto_approve: value }));
export const setPdfSettings = (value) => request("/v1/settings/pdf", json("POST", value));
export const setCompactionSettings = (value) => request("/v1/settings/compaction", json("POST", value));
export const getProviders = () => request("/v1/providers");
export const setProvider = (name, fields) => request("/v1/providers", json("POST", { name, fields }));
export const removeProvider = (name) => request(`/v1/providers/${encodeURIComponent(name)}`, { method: "DELETE" });

export const listSkills = async (workspace) => (await request(`/v1/skills${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`)).skills || [];
export const createSkill = (payload) => request("/v1/skills", json("POST", payload));
export const updateSkill = (name, payload) => request(`/v1/skills/${encodeURIComponent(name)}`, json("PATCH", payload));
export const deleteSkill = (name, workspace) => request(`/v1/skills/${encodeURIComponent(name)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`, { method: "DELETE" });

export const getMemory = async () => (await request("/v1/memory")).memory || [];
export const updateMemory = (id, content) => request(`/v1/memory/${id}`, json("PATCH", { content }));
export const deleteMemory = (id) => request(`/v1/memory/${id}`, { method: "DELETE" });
export const deleteAllMemory = () => request("/v1/memory", { method: "DELETE" });
export const getMemorySettings = () => request("/v1/memory/settings");
export const setMemorySettings = (payload) => request("/v1/memory/settings", json("PUT", payload));
export const updatePersona = (id, payload) => request(`/v1/personas/${encodeURIComponent(id)}`, json("POST", payload));

export class Session {
  constructor(id, workspace, agent, handlers) {
    this.handlers = handlers;
    this.queue = [];
    const query = `?workspace=${encodeURIComponent(workspace || "")}&agent=${encodeURIComponent(agent)}`;
    this.ws = openSocket(`${wsBase()}/ws/session/${encodeURIComponent(id)}${query}`);
    this.ws.onopen = () => {
      this.queue.splice(0).forEach((payload) => this.ws.send(JSON.stringify(payload)));
      handlers.onOpen?.();
    };
    this.ws.onmessage = (event) => {
      try { handlers.onEvent(JSON.parse(event.data)); } catch {}
    };
    this.ws.onclose = () => handlers.onClose?.();
  }

  send(payload) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
    else if (this.ws.readyState === WebSocket.CONNECTING) this.queue.push(payload);
  }

  userMessage(text, model, attachments = [], skill) { this.send({ type: "user_message", text, ...(model ? { model } : {}), ...(attachments.length ? { attachments } : {}), ...(skill ? { skill } : {}) }); }
  allowAnyway(name, args) { this.send({ type: 'allow_anyway', name, arguments: args || {} }); }
  interrupt() { this.send({ type: "interrupt" }); }
  approve(decision) { this.send({ type: "approval", decision }); }
  respondDirectory(granted, path, writable = false) { this.send({ type: "directory_response", granted, ...(path ? { path } : {}), writable }); }
  respondTool(approved) { this.send({ type: "tool_response", approved }); }
  respondPlan(approved, mode, feedback) { this.send({ type: "plan_response", approved, ...(mode ? { mode } : {}), ...(feedback ? { feedback } : {}) }); }
  respondTeam(approved, feedback, enableChat) { this.send({ type: "team_response", approved, ...(feedback ? { feedback } : {}), ...(enableChat !== undefined ? { enable_chat: enableChat } : {}) }); }
  respondItems(approved, feedback) { this.send({ type: "items_response", approved, ...(feedback ? { feedback } : {}) }); }
  answer(answer) { this.send({ type: "question_response", answer }); }
  setMode(mode) { this.send({ type: "set_mode", mode }); }
  setModel(model) { this.send({ type: "set_model", model }); }
  retry() { this.send({ type: "retry" }); }
  close() {
    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onclose = null;
    this.ws.close();
  }
}
