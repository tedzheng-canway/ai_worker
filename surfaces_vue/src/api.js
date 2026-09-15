const httpBase = () => globalThis.__COWORKER_HTTP__ || import.meta.env.VITE_COWORKER_HTTP || "http://127.0.0.1:8765";
const wsBase = () => globalThis.__COWORKER_WS__ || import.meta.env.VITE_COWORKER_WS || "ws://127.0.0.1:8765";
const apiToken = () => globalThis.__COWORKER_API_TOKEN__ || import.meta.env.VITE_COWORKER_API_TOKEN || (typeof __COWORKER_DEV_TOKEN__ === "string" ? __COWORKER_DEV_TOKEN__ : "");

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  const token = apiToken();
  if (token) headers.set("X-OpenWorker-Token", token);
  const response = await globalThis.fetch(`${httpBase()}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function openSocket(url) {
  const token = apiToken();
  return token ? new WebSocket(url, ["openworker", token]) : new WebSocket(url);
}

export const getHealth = () => request("/v1/health");
export const getSettings = () => request("/v1/settings");
export const getPersonas = async () => (await request("/v1/personas")).personas || [];
export const getSessions = async () => (await request("/v1/sessions")).sessions || [];
export const getMessages = async (id) => (await request(`/v1/sessions/${encodeURIComponent(id)}/messages`)).messages || [];

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

  userMessage(text, model) { this.send({ type: "user_message", text, ...(model ? { model } : {}) }); }
  interrupt() { this.send({ type: "interrupt" }); }
  approve(decision) { this.send({ type: "approval", decision }); }
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
