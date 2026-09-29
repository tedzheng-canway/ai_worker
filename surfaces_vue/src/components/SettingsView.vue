<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
import SkillsManager from './SkillsManager.vue';
import { compactionPayload, pdfPayload, requireSuccess, sessionLimit, settingsWithDefaults } from "../settings";
import { addModel, deleteAllMemory, deleteMemory, getMemory, getMemorySettings, getPersonas, getProviders, getSettings, removeModel, removeProvider, setAutoApprove, setCompactionSettings, setContextBar, setDefaultModel, setMemorySettings, setPdfSettings, setProvider, setScratchBase, setSessionsPeek, updateMemory, updatePersona } from "../api";
const props = defineProps({ dark: Boolean, initialTab: { type: String, default: 'general' } });
const emit = defineEmits(["theme-change", "settings-change"]);
const tabs = [{ id: "general", label: "通用" }, { id: "models", label: "模型" }, { id: "context", label: "上下文" }, { id: "skills", label: "技能" }, { id: "memory", label: "记忆" }, { id: "personas", label: "智能体" }];
const tab = ref(props.initialTab);
const settings = ref({});
const providers = ref([]);
const providerFields = ref({});
const modelDraft = ref("");
const memories = ref([]);
const memorySettings = ref({ enabled: true, user_rules: "" });
const personas = ref([]);
const saved = ref("");
const error = ref("");
const saving = ref(false);
const renderVersion = ref(0);
const compactionPercent = ref(80);
let flashTimer;

function applySettings(value) {
  settings.value = settingsWithDefaults(value);
  compactionPercent.value = Math.round(settings.value.compaction_threshold_pct * 100);
}

async function perform(action) {
  if (saving.value) return;
  saving.value = true;
  error.value = "";
  saved.value = "";
  try { await action(); }
  catch (reason) { error.value = reason?.message || "保存失败，请重试"; }
  finally { saving.value = false; renderVersion.value += 1; }
}

async function refreshSettings() {
  applySettings(await getSettings());
  emit("settings-change");
}

function saveCompaction() {
  return perform(async () => {
    const result = requireSuccess(await setCompactionSettings(compactionPayload(compactionPercent.value, settings.value)));
    applySettings({ ...settings.value, ...result });
    emit("settings-change");
    flash();
  });
}

function savePdf() {
  return perform(async () => {
    const result = requireSuccess(await setPdfSettings(pdfPayload(settings.value)));
    settings.value = { ...settings.value, ...result };
    emit("settings-change");
    flash();
  });
}

async function load() {
  const results = await Promise.allSettled([getSettings(), getProviders(), getMemory(), getMemorySettings(), getPersonas()]);
  if (results[0].status === "fulfilled") applySettings(results[0].value);
  else error.value = "无法加载设置，请重新打开设置页面";
  if (results[1].status === "fulfilled") providers.value = results[1].value;
  if (results[2].status === "fulfilled") memories.value = results[2].value;
  if (results[3].status === "fulfilled") memorySettings.value = results[3].value;
  if (results[4].status === "fulfilled") personas.value = results[4].value;
  providerFields.value = Object.fromEntries(providers.value.map((provider) => [provider.name, { ...(provider.values || {}) }]));
}
function flash(text = "已保存") { clearTimeout(flashTimer); saved.value = text; flashTimer = window.setTimeout(() => saved.value = "", 1800); }
function defaultModel(value) { return perform(async () => { requireSuccess(await setDefaultModel(value)); await refreshSettings(); flash(); }); }
function addModelRow() { if (!modelDraft.value.trim()) return; return perform(async () => { requireSuccess(await addModel(modelDraft.value.trim())); modelDraft.value = ""; await refreshSettings(); flash(); }); }
function removeModelRow(value) { if (!confirm(`从模型列表移除 ${value}？`)) return; return perform(async () => { requireSuccess(await removeModel(value)); await refreshSettings(); flash(); }); }
function saveProvider(provider) { return perform(async () => { requireSuccess(await setProvider(provider.name, providerFields.value[provider.name] || {})); providers.value = await getProviders(); await refreshSettings(); flash(); }); }
function forgetProvider(provider) { if (!confirm(`删除 ${provider.title} 的已保存配置？`)) return; return perform(async () => { requireSuccess(await removeProvider(provider.name)); providers.value = await getProviders(); await refreshSettings(); flash(); }); }
async function saveMemory(entry) { await updateMemory(entry.id, entry.content); flash(); }
async function removeMemory(entry) { await deleteMemory(entry.id); memories.value = memories.value.filter((item) => item.id !== entry.id); }
async function clearMemory() { if (!confirm("确定清空全部记忆？此操作无法撤销。")) return; await deleteAllMemory(); memories.value = []; }
async function saveMemoryPrefs() { memorySettings.value = await setMemorySettings(memorySettings.value); flash(); }
function togglePersona(persona) { return perform(async () => { requireSuccess(await updatePersona(persona.id, { enabled: !persona.enabled })); personas.value = await getPersonas(); emit("settings-change"); flash(); }); }
function saveGeneral(key, action, value) { return perform(async () => { if (key === "sessions_peek") value = sessionLimit(value); requireSuccess(await action(value)); await refreshSettings(); flash(); }); }
const fieldLabels = { api_key: "API 密钥", base_url: "API 地址", endpoint: "服务地址", organization: "组织 ID", project: "项目 ID", method: "连接方式", model: "模型名称", region: "区域" };
const fieldHelps = { api_key: "用于访问该模型服务，密钥只保存在本机。", base_url: "模型服务的接口地址。", endpoint: "模型服务的访问地址。", organization: "可选的组织标识。", project: "可选的项目标识。", method: "填写需要使用的连接或认证方式。", model: "填写此提供商支持的模型名称。", region: "填写服务所在区域。" };
function fieldLabel(field) { return fieldLabels[field.key] || field.label || "配置项"; }
function fieldHelp(field) { return fieldHelps[field.key] || `填写 ${fieldLabel(field)}，保存后用于连接模型服务。`; }
function personaSummary(persona) {
  const id = String(persona.id || "").toLowerCase();
  const known = [
    [["cowork", "general"], "适合综合办公：联网调研、处理文件和表格、分析数据，以及撰写报告、邮件和方案。"],
    [["chat"], "适合快速问答、概念解释、翻译、总结和头脑风暴，侧重直接交流。"],
    [["code", "develop", "engineer"], "适合软件开发：阅读和修改代码、运行命令、排查错误、重构项目并修复构建问题。"],
    [["security", "secure", "secops"], "适合安全工作：检查代码与配置风险、分析漏洞、审阅权限并给出加固建议。"],
    [["devops", "sre", "infra"], "适合运维与基础设施：处理部署、持续集成、容器、云资源和故障排查。"],
    [["research"], "适合联网调研：搜集和核实资料、比较来源，并整理成带依据的研究报告。"],
    [["data", "analyst"], "适合数据分析：清洗表格、统计汇总、发现趋势，并输出结果表和分析结论。"],
    [["writer", "content"], "适合内容创作：撰写、改写和润色文档、汇报稿、邮件及其他文字材料。"],
    [["sales", "crm"], "适合销售工作：整理客户与线索、分析跟进情况，并生成销售摘要和沟通材料。"],
    [["support", "service"], "适合客户支持：归纳问题、查询资料、起草回复并整理常见问题。"],
  ].find(([keys]) => keys.some((key) => id.includes(key)));
  if (known) return known[1];
  const tools = (persona.tools || []).join(" ").toLowerCase();
  const capabilities = [];
  if (/browser|web|search/.test(tools)) capabilities.push("联网检索和资料调研");
  if (/file|pdf|document/.test(tools)) capabilities.push("读取、整理和生成文件");
  if (/shell|code|patch|command/.test(tools)) capabilities.push("执行命令和处理代码");
  if (/sheet|excel|csv|data/.test(tools)) capabilities.push("表格与数据分析");
  if (/mail|calendar|slack|connector|mcp/.test(tools)) capabilities.push("通过连接器处理外部服务");
  if (capabilities.length) return `可用于${capabilities.join("、")}。`;
  return persona.requires_folder ? "适合围绕指定工作目录执行项目任务，包括读取资料、生成内容和完成项目交付。" : "适合问答、内容整理、分析和文档生成等日常任务。";
}
onMounted(load);
onBeforeUnmount(() => clearTimeout(flashTimer));
</script>

<template>
  <div class="settings-layout">
    <nav class="subnav"><h2>设置</h2><button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ item.label }}</button></nav>
    <section class="page-view settings-page">
      <div v-if="saved" class="save-toast">{{ saved }}</div>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <fieldset :key="renderVersion" class="settings-fields" :disabled="saving">
      <template v-if="tab === 'general'">
        <div class="page-head"><div><h1>通用</h1><p>外观、侧边栏和本地文件设置。</p></div></div>
        <div class="card settings-card"><h2>主题</h2><div class="segmented"><button :class="{ active: !dark }" @click="emit('theme-change', false)">浅色</button><button :class="{ active: dark }" @click="emit('theme-change', true)">深色</button></div></div>
        <div class="card settings-card"><h2>侧边栏</h2><label>每组显示会话数<input type="number" min="1" max="50" :value="settings.sessions_peek || 5" @change="saveGeneral('sessions_peek', setSessionsPeek, Number($event.target.value))" /></label><label class="toggle-row"><span><strong>显示上下文使用进度</strong><small>在输入框中展示模型上下文占用</small></span><input type="checkbox" :checked="settings.context_bar" @change="saveGeneral('context_bar', setContextBar, $event.target.checked)" /></label></div>
        <div class="card settings-card"><h2>本地文件</h2><label>临时工作区根目录<input v-model="settings.scratch_base" placeholder="使用系统默认目录" /></label><button class="btn" @click="saveGeneral('scratch_base', setScratchBase, settings.scratch_base)">保存目录</button></div>
        <div class="card settings-card"><h2>自动审批</h2><label class="toggle-row"><span><strong>启用自动审批模式</strong><small>允许审查器自动批准低风险操作</small></span><input type="checkbox" :checked="settings.auto_approve" @change="saveGeneral('auto_approve', setAutoApprove, $event.target.checked)" /></label></div>
      </template>

      <template v-else-if="tab === 'models'">
        <div class="page-head"><div><h1>模型与提供商</h1><p>配置凭据，并管理会话可选择的模型。</p></div></div>
        <div v-for="provider in providers" :key="provider.name" class="card settings-card"><div class="setting-title"><div><h2>{{ provider.title }}</h2><small>模型服务配置 · {{ provider.configured ? '已配置' : '未配置' }}</small></div><button v-if="provider.configured" class="btn danger" @click="forgetProvider(provider)">移除配置</button></div><label v-for="field in provider.fields || []" :key="field.key">{{ fieldLabel(field) }}<input v-model="providerFields[provider.name][field.key]" :type="field.secret ? 'password' : 'text'" :list="field.choices?.length ? `${provider.name}-${field.key}-choices` : undefined" :placeholder="field.choices?.length ? field.choices.map((choice) => choice.value).join(' / ') : `请输入${fieldLabel(field)}`" /><datalist v-if="field.choices?.length" :id="`${provider.name}-${field.key}-choices`"><option v-for="choice in field.choices" :key="choice.value" :value="choice.value"></option></datalist><small>{{ fieldHelp(field) }}</small></label><button class="btn primary" @click="saveProvider(provider)">保存提供商</button></div>
        <div class="card settings-card"><h2>可用模型</h2><label v-for="item in settings.models || []" :key="item" class="model-row"><input type="radio" name="default-model" :checked="item === (settings.model || settings.default_model)" @change="defaultModel(item)" /><span>{{ item }}</span><button class="text-danger" @click="removeModelRow(item)">移除</button></label><form class="inline-form" @submit.prevent="addModelRow"><input v-model="modelDraft" placeholder="提供商:模型ID" /><button class="btn primary">添加模型</button></form></div>
      </template>

      <template v-else-if="tab === 'context'">
        <div class="page-head"><div><h1>上下文与文件</h1><p>控制 PDF 处理与自动压缩策略。</p></div></div>
        <form class="card settings-card" @submit.prevent="savePdf"><h2>PDF 文本用量优化</h2><label>回退模式<select v-model="settings.pdf_fallback"><option value="text">提取文本</option><option value="images">转换为图片</option></select></label><label>最大页数<input v-model.number="settings.pdf_max_pages" required type="number" min="1" max="100" step="1" /></label><label>最大文件大小（MB）<input v-model.number="settings.pdf_max_mb" required type="number" min="1" max="10" step="1" /></label><button class="btn primary">保存 PDF 设置</button></form>
        <form class="card settings-card" @submit.prevent="saveCompaction"><h2>自动上下文压缩</h2><label>触发阈值（%）<input v-model.number="compactionPercent" required type="number" min="10" max="95" step="1" /></label><label>触发压缩的令牌数量上限<input v-model.number="settings.compaction_cap_tokens" required type="number" min="10000" max="2000000" step="1" /></label><label>压缩模型<input v-model="settings.compaction_model" placeholder="留空使用当前模型" /></label><button class="btn primary">保存压缩设置</button></form>
      </template>

      <template v-else-if="tab === 'skills'">
        <div class="page-head"><div><h1>技能</h1><p>管理可由输入框斜杠菜单调用的技能。</p></div></div>
        <SkillsManager @change="emit('settings-change')" />
      </template>

      <template v-else-if="tab === 'memory'">
        <div class="page-head"><div><h1>记忆</h1><p>管理代理保存的长期信息和用户规则。</p></div><button class="btn danger" @click="clearMemory">清空全部</button></div>
        <div class="card settings-card"><label class="toggle-row"><span><strong>启用记忆</strong><small>允许代理使用和保存长期记忆</small></span><input v-model="memorySettings.enabled" type="checkbox" @change="saveMemoryPrefs" /></label><label>用户规则<textarea v-model="memorySettings.user_rules" rows="5" @blur="saveMemoryPrefs"></textarea></label></div>
        <div class="card-list"><article v-for="entry in memories" :key="entry.id" class="card memory-row"><small>{{ entry.scope }} · {{ entry.created_at }}</small><textarea v-model="entry.content" rows="3"></textarea><div class="actions"><button class="btn" @click="saveMemory(entry)">保存</button><button class="btn danger" @click="removeMemory(entry)">删除</button></div></article></div><div v-if="!memories.length" class="empty-card">还没有保存的记忆。</div>
      </template>

      <template v-else>
        <div class="page-head"><div><h1>智能体</h1><p>启用或停用不同角色的智能体。</p></div></div><div class="card-list"><article v-for="persona in personas" :key="persona.id" class="card list-card"><div><strong>{{ persona.name || persona.id }}</strong><small>{{ personaSummary(persona) }}</small></div><label class="switch"><input type="checkbox" :checked="persona.enabled" @change="togglePersona(persona)" /><span></span></label></article></div>
      </template>
      </fieldset>
    </section>
  </div>
</template>
