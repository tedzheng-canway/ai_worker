<script setup>
import { onMounted, ref } from "vue";
import { addModel, createSkill, deleteAllMemory, deleteMemory, deleteSkill, getMemory, getMemorySettings, getPersonas, getProviders, getSettings, listSkills, removeModel, removeProvider, setAutoApprove, setCompactionSettings, setContextBar, setDefaultModel, setMemorySettings, setPdfSettings, setProvider, setScratchBase, setSessionsPeek, updateMemory, updatePersona, updateSkill } from "../api";
const props = defineProps({ dark: Boolean });
const emit = defineEmits(["theme-change", "settings-change"]);
const tabs = [{ id: "general", label: "通用" }, { id: "models", label: "模型" }, { id: "context", label: "上下文" }, { id: "skills", label: "技能" }, { id: "voice", label: "语音" }, { id: "memory", label: "记忆" }, { id: "personas", label: "Coworkers" }];
const tab = ref("general");
const settings = ref({});
const providers = ref([]);
const providerFields = ref({});
const modelDraft = ref("");
const skills = ref([]);
const skillForm = ref({ name: "", description: "", instructions: "" });
const memories = ref([]);
const memorySettings = ref({ enabled: true, user_rules: "" });
const personas = ref([]);
const saved = ref("");

async function load() {
  const results = await Promise.allSettled([getSettings(), getProviders(), listSkills(), getMemory(), getMemorySettings(), getPersonas()]);
  if (results[0].status === "fulfilled") settings.value = results[0].value;
  if (results[1].status === "fulfilled") providers.value = results[1].value;
  if (results[2].status === "fulfilled") skills.value = results[2].value;
  if (results[3].status === "fulfilled") memories.value = results[3].value;
  if (results[4].status === "fulfilled") memorySettings.value = results[4].value;
  if (results[5].status === "fulfilled") personas.value = results[5].value;
  providerFields.value = Object.fromEntries(providers.value.map((provider) => [provider.name, { ...(provider.values || {}) }]));
}
function flash(text = "已保存") { saved.value = text; window.setTimeout(() => saved.value = "", 1800); }
async function defaultModel(value) { await setDefaultModel(value); settings.value.model = value; emit("settings-change"); flash(); }
async function addModelRow() { if (!modelDraft.value.trim()) return; const result = await addModel(modelDraft.value.trim()); settings.value.models = result.models || [...(settings.value.models || []), modelDraft.value.trim()]; modelDraft.value = ""; emit("settings-change"); }
async function removeModelRow(value) { if (!confirm(`从模型列表移除 ${value}？`)) return; const result = await removeModel(value); settings.value.models = result.models || settings.value.models.filter((item) => item !== value); }
async function saveProvider(provider) { const result = await setProvider(provider.name, providerFields.value[provider.name] || {}); if (!result.ok) return flash(result.error || "保存失败"); provider.configured = true; flash(); }
async function forgetProvider(provider) { if (!confirm(`删除 ${provider.title} 的已保存配置？`)) return; await removeProvider(provider.name); provider.configured = false; }
async function createSkillRow() { if (!skillForm.value.name || !skillForm.value.instructions) return; await createSkill({ ...skillForm.value, scope: "global" }); skillForm.value = { name: "", description: "", instructions: "" }; skills.value = await listSkills(); }
async function toggleSkill(skill) { await updateSkill(skill.name, { enabled: !skill.enabled }); skill.enabled = !skill.enabled; }
async function removeSkillRow(skill) { if (!confirm(`删除技能 ${skill.name}？`)) return; await deleteSkill(skill.name); skills.value = await listSkills(); }
async function saveMemory(entry) { await updateMemory(entry.id, entry.content); flash(); }
async function removeMemory(entry) { await deleteMemory(entry.id); memories.value = memories.value.filter((item) => item.id !== entry.id); }
async function clearMemory() { if (!confirm("确定清空全部记忆？此操作无法撤销。")) return; await deleteAllMemory(); memories.value = []; }
async function saveMemoryPrefs() { memorySettings.value = await setMemorySettings(memorySettings.value); flash(); }
async function togglePersona(persona) { const result = await updatePersona(persona.id, { enabled: !persona.enabled }); if (result.personas) personas.value = result.personas; else persona.enabled = !persona.enabled; emit("settings-change"); }
async function saveGeneral(key, action, value) { await action(value); settings.value[key] = value; flash(); }
onMounted(load);
</script>

<template>
  <div class="settings-layout">
    <nav class="subnav"><h2>设置</h2><button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ item.label }}</button></nav>
    <section class="page-view settings-page">
      <div v-if="saved" class="save-toast">{{ saved }}</div>
      <template v-if="tab === 'general'">
        <div class="page-head"><div><h1>通用</h1><p>外观、侧边栏和本地文件设置。</p></div></div>
        <div class="card settings-card"><h2>主题</h2><div class="segmented"><button :class="{ active: !dark }" @click="emit('theme-change', false)">浅色</button><button :class="{ active: dark }" @click="emit('theme-change', true)">深色</button></div></div>
        <div class="card settings-card"><h2>侧边栏</h2><label>每组显示会话数<input type="number" min="1" max="50" :value="settings.sessions_peek || 5" @change="saveGeneral('sessions_peek', setSessionsPeek, Number($event.target.value))" /></label><label class="toggle-row"><span><strong>显示上下文使用进度</strong><small>在输入框中展示模型上下文占用</small></span><input type="checkbox" :checked="settings.context_bar" @change="saveGeneral('context_bar', setContextBar, $event.target.checked)" /></label></div>
        <div class="card settings-card"><h2>本地文件</h2><label>临时工作区根目录<input v-model="settings.scratch_base" placeholder="使用系统默认目录" /></label><button class="btn" @click="saveGeneral('scratch_base', setScratchBase, settings.scratch_base)">保存目录</button></div>
        <div class="card settings-card"><h2>自动审批</h2><label class="toggle-row"><span><strong>启用 Auto-Approve 模式</strong><small>允许审查器自动批准低风险操作</small></span><input type="checkbox" :checked="settings.auto_approve" @change="saveGeneral('auto_approve', setAutoApprove, $event.target.checked)" /></label></div>
      </template>

      <template v-else-if="tab === 'models'">
        <div class="page-head"><div><h1>模型与提供商</h1><p>配置凭据，并管理会话可选择的模型。</p></div></div>
        <div v-for="provider in providers" :key="provider.name" class="card settings-card"><div class="setting-title"><div><h2>{{ provider.title }}</h2><small>{{ provider.blurb }} · {{ provider.configured ? '已配置' : '未配置' }}</small></div><button v-if="provider.configured" class="btn danger" @click="forgetProvider(provider)">移除配置</button></div><label v-for="field in provider.fields || []" :key="field.key">{{ field.label }}<select v-if="field.choices" v-model="providerFields[provider.name][field.key]"><option v-for="choice in field.choices" :key="choice.value" :value="choice.value">{{ choice.label }}</option></select><input v-else v-model="providerFields[provider.name][field.key]" :type="field.secret ? 'password' : 'text'" :placeholder="field.placeholder" /><small>{{ field.help }}</small></label><button class="btn primary" @click="saveProvider(provider)">保存提供商</button></div>
        <div class="card settings-card"><h2>可用模型</h2><label v-for="item in settings.models || []" :key="item" class="model-row"><input type="radio" name="default-model" :checked="item === (settings.model || settings.default_model)" @change="defaultModel(item)" /><span>{{ item }}</span><button class="text-danger" @click="removeModelRow(item)">移除</button></label><form class="inline-form" @submit.prevent="addModelRow"><input v-model="modelDraft" placeholder="provider:model-id" /><button class="btn primary">添加模型</button></form></div>
      </template>

      <template v-else-if="tab === 'context'">
        <div class="page-head"><div><h1>上下文与文件</h1><p>控制 PDF 处理与自动压缩策略。</p></div></div>
        <div class="card settings-card"><h2>PDF Token 节省</h2><label>回退模式<select :value="settings.pdf_fallback || 'text'" @change="setPdfSettings({ pdf_fallback: $event.target.value }); settings.pdf_fallback = $event.target.value"><option value="text">提取文本</option><option value="attach">原文件</option></select></label><label>最大页数<input v-model.number="settings.pdf_max_pages" type="number" min="1" @change="setPdfSettings({ pdf_max_pages: settings.pdf_max_pages })" /></label><label>最大文件大小（MB）<input v-model.number="settings.pdf_max_mb" type="number" min="1" @change="setPdfSettings({ pdf_max_mb: settings.pdf_max_mb })" /></label></div>
        <div class="card settings-card"><h2>自动上下文压缩</h2><label>触发阈值（%）<input v-model.number="settings.compaction_threshold_pct" type="number" min="10" max="100" /></label><label>压缩后 Token 上限<input v-model.number="settings.compaction_cap_tokens" type="number" min="1000" /></label><label>压缩模型<input v-model="settings.compaction_model" placeholder="留空使用当前模型" /></label><button class="btn primary" @click="setCompactionSettings({ compaction_threshold_pct: settings.compaction_threshold_pct, compaction_cap_tokens: settings.compaction_cap_tokens, compaction_model: settings.compaction_model }); flash()">保存压缩设置</button></div>
      </template>

      <template v-else-if="tab === 'skills'">
        <div class="page-head"><div><h1>技能</h1><p>管理可由输入框斜杠菜单调用的技能。</p></div></div>
        <form class="card form-card" @submit.prevent="createSkillRow"><label>技能名称<input v-model="skillForm.name" required placeholder="review-code" /></label><label>说明<input v-model="skillForm.description" /></label><label>指令<textarea v-model="skillForm.instructions" required rows="5"></textarea></label><button class="btn primary">创建技能</button></form>
        <div class="card-list"><article v-for="skill in skills" :key="skill.name" class="card list-card"><div><strong>/{{ skill.name }}</strong><small>{{ skill.description }} · {{ skill.scope }}</small></div><div class="actions"><label class="switch"><input type="checkbox" :checked="skill.enabled" @change="toggleSkill(skill)" /><span></span></label><button class="btn danger" @click="removeSkillRow(skill)">删除</button></div></article></div>
      </template>

      <template v-else-if="tab === 'voice'">
        <div class="page-head"><div><h1>语音输入</h1><p>使用本地 Whisper 模型进行私密转录。</p></div></div><div class="empty-card"><strong>需要桌面运行时</strong><p>浏览器版不会请求麦克风权限。语音模型下载、设备检查和转录测试仅在 Tauri 桌面壳中可用。</p></div>
      </template>

      <template v-else-if="tab === 'memory'">
        <div class="page-head"><div><h1>记忆</h1><p>管理代理保存的长期信息和用户规则。</p></div><button class="btn danger" @click="clearMemory">清空全部</button></div>
        <div class="card settings-card"><label class="toggle-row"><span><strong>启用记忆</strong><small>允许代理使用和保存长期记忆</small></span><input v-model="memorySettings.enabled" type="checkbox" @change="saveMemoryPrefs" /></label><label>用户规则<textarea v-model="memorySettings.user_rules" rows="5" @blur="saveMemoryPrefs"></textarea></label></div>
        <div class="card-list"><article v-for="entry in memories" :key="entry.id" class="card memory-row"><small>{{ entry.scope }} · {{ entry.created_at }}</small><textarea v-model="entry.content" rows="3"></textarea><div class="actions"><button class="btn" @click="saveMemory(entry)">保存</button><button class="btn danger" @click="removeMemory(entry)">删除</button></div></article></div><div v-if="!memories.length" class="empty-card">还没有保存的记忆。</div>
      </template>

      <template v-else>
        <div class="page-head"><div><h1>Coworkers</h1><p>启用或停用不同角色的 Coworker。</p></div></div><div class="card-list"><article v-for="persona in personas" :key="persona.id" class="card list-card"><div><strong>{{ persona.name || persona.id }}</strong><small>{{ persona.description || persona.family || 'Coworker' }}</small></div><label class="switch"><input type="checkbox" :checked="persona.enabled" @change="togglePersona(persona)" /><span></span></label></article></div>
      </template>
    </section>
  </div>
</template>
