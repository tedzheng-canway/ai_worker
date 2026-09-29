<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { addMcpServer, connectConnector, deleteMcpServer, disconnectConnector, getConnectors, getMcpServers, updateConnectorTools, updateMcpServer } from "../api";
import { mcpConfig, requireSuccess } from "../settings";
const connectors = ref([]);
const servers = ref([]);
const detail = ref(null);
const fieldValues = ref({});
const showMcp = ref(false);
const emptyMcp = () => ({ name: "", transport: "stdio", command: "", args: "", url: "" });
const mcp = ref(emptyMcp());
const mcpError = ref("");
const mcpBusy = ref(false);
const message = ref("");
let timer;
async function refresh() { try { [connectors.value, servers.value] = await Promise.all([getConnectors(), getMcpServers()]); } catch {} }
function openConnector(item) { detail.value = item; fieldValues.value = Object.fromEntries((item.fields || []).map((field) => [field.key, field.default || ""])); message.value = ""; }
async function connect() { const result = await connectConnector(detail.value.name, fieldValues.value); message.value = result.ok ? "连接成功" : result.error || "连接失败"; await refresh(); detail.value = connectors.value.find((item) => item.name === detail.value.name); }
async function disconnect() { if (!confirm("确定断开此连接器？")) return; await disconnectConnector(detail.value.name); detail.value = null; await refresh(); }
async function toggleTool(tool) { await updateConnectorTools(detail.value.name, { [tool.name]: !tool.enabled }); tool.enabled = !tool.enabled; }
async function saveMcp() {
  if (mcpBusy.value) return;
  mcpBusy.value = true;
  mcpError.value = "";
  try {
    requireSuccess(await addMcpServer(mcp.value.name.trim(), mcpConfig(mcp.value)));
    mcp.value = emptyMcp();
    showMcp.value = false;
    await refresh();
  } catch (error) { mcpError.value = error?.message || "添加失败，请重试"; }
  finally { mcpBusy.value = false; }
}
async function toggleMcp(server) { await updateMcpServer(server.name, { enabled: !server.enabled }); await refresh(); }
async function removeMcp(server) { if (!confirm(`确定删除 MCP 服务器“${server.name}”？`)) return; await deleteMcpServer(server.name); await refresh(); }
onMounted(() => { refresh(); timer = window.setInterval(refresh, 5000); });
onUnmounted(() => window.clearInterval(timer));
</script>

<template>
  <section class="page-view wide-page">
    <template v-if="!detail">
      <div class="page-head"><div><h1>连接器</h1><p>连接外部服务，控制代理可以使用的工具。</p></div><button class="btn" @click="showMcp = !showMcp">＋ 自定义 MCP</button></div>
      <form v-if="showMcp" class="card form-card" @submit.prevent="saveMcp">
        <fieldset class="settings-fields form-card" :disabled="mcpBusy">
          <label>服务器名称<input v-model="mcp.name" required placeholder="my-server" /></label>
          <label>传输方式<select v-model="mcp.transport"><option value="stdio">本地命令（stdio）</option><option value="http">HTTP</option></select></label>
          <template v-if="mcp.transport === 'stdio'">
            <label>可执行程序<input v-model="mcp.command" required placeholder="npx 或 C:\Program Files\工具\程序.exe" /><small>仅填写程序名称或完整路径，路径有空格也无需加引号。</small></label>
            <label>启动参数（每行一个）<textarea v-model="mcp.args" rows="4" placeholder="-y&#10;package-name&#10;D:\My Project"></textarea><small>每行作为一个完整参数；保留空格，不加引号。例如 npx -y package-name：程序填写 npx，参数分两行填写 -y 和 package-name。</small></label>
          </template>
          <label v-else>服务器 URL<input v-model="mcp.url" required placeholder="https://example.com/mcp" /></label>
          <p v-if="mcpError" class="error-text" role="alert">{{ mcpError }}</p>
          <div class="actions"><button class="btn primary">{{ mcpBusy ? '添加中…' : '添加服务器' }}</button><button type="button" class="btn" @click="showMcp = false">取消</button></div>
        </fieldset>
      </form>
      <h2 class="section-title">可用连接器</h2>
      <div class="connector-grid"><button v-for="item in connectors" :key="item.name" class="card connector-card" @click="openConnector(item)"><span class="connector-logo" :style="{ background: item.brand_color || '#6b7280' }">{{ item.title?.slice(0, 1) }}</span><div><strong>{{ item.title }}</strong><small>{{ item.connected ? item.account || '已连接' : item.blurb || '尚未连接' }}</small></div><span :class="['connection-state', { on: item.connected }]">{{ item.connected ? '已连接' : '设置' }}</span></button></div>
      <h2 class="section-title">自定义 MCP 服务器</h2>
      <div v-if="servers.length" class="card-list"><article v-for="server in servers" :key="server.name" class="card list-card"><div><strong>{{ server.name }}</strong><small>{{ server.transport }} · {{ server.status }} · {{ server.tool_count ?? 0 }} 个工具</small><small v-if="server.last_error" class="error-text">{{ server.last_error }}</small></div><div class="actions"><label class="switch"><input type="checkbox" :checked="server.enabled" @change="toggleMcp(server)" /><span></span></label><button class="btn danger" @click="removeMcp(server)">删除</button></div></article></div><div v-else class="empty-card">没有自定义 MCP 服务器。</div>
    </template>
    <template v-else>
      <button class="back-link" @click="detail = null">‹ 返回连接器</button>
      <div class="page-head"><div class="connector-title"><span class="connector-logo large" :style="{ background: detail.brand_color || '#6b7280' }">{{ detail.title?.slice(0, 1) }}</span><div><h1>{{ detail.title }}</h1><p>{{ detail.connected ? detail.account || '已连接' : detail.blurb }}</p></div></div><button v-if="detail.connected && detail.auth !== 'none'" class="btn danger" @click="disconnect">断开连接</button></div>
      <form v-if="!detail.connected" class="card form-card" @submit.prevent="connect"><p v-if="detail.about">{{ detail.about }}</p><label v-for="field in detail.fields || []" :key="field.key">{{ field.label }}<input v-model="fieldValues[field.key]" :type="field.secret ? 'password' : 'text'" :required="field.required" :placeholder="field.placeholder" /><small>{{ field.help }}</small></label><button class="btn primary">连接 {{ detail.title }}</button><span class="form-message">{{ message }}</span></form>
      <div v-else class="card settings-card"><h2>可用工具</h2><label v-for="tool in detail.tools || []" :key="tool.name" class="toggle-row"><span><strong>{{ tool.label || tool.name }}</strong><small>{{ tool.description }} · {{ tool.kind }}</small></span><input type="checkbox" :checked="tool.enabled" @change="toggleTool(tool)" /></label><div v-if="!(detail.tools || []).length" class="empty-inline">此连接器没有可配置工具。</div></div>
    </template>
  </section>
</template>
