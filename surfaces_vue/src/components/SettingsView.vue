<script setup>
import { t } from '../i18n';
import { onMounted, onBeforeUnmount, ref } from "vue";
import ProviderManager from './ProviderManager.vue';
import PersonasManager from './PersonasManager.vue';
import { themePreference, languagePreference, setTheme, setLanguage } from '../preferences';
import { setAutoApproveShadow } from '../p3api';
import SkillsManager from './SkillsManager.vue';
import { compactionPayload, pdfPayload, requireSuccess, sessionLimit, settingsWithDefaults } from "../settings";
import { deleteAllMemory, deleteMemory, getMemory, getMemorySettings, getSettings, setAutoApprove, setCompactionSettings, setContextBar, setMemorySettings, setPdfSettings, setScratchBase, setSessionsPeek, updateMemory } from '../api';
const props = defineProps({ dark: Boolean, initialTab: { type: String, default: 'general' } });
const emit = defineEmits(["theme-change", "settings-change", "connectors", "use-persona", "setup"]);
const tabs = [{ id: "general", label: "通用" }, { id: "models", label: "模型" }, { id: "context", label: "上下文" }, { id: "skills", label: "技能" }, { id: "memory", label: "记忆" }, { id: "personas", label: "智能体" }];
const tab = ref(props.initialTab);
const settings = ref({});

const memories = ref([]);
const memorySettings = ref({ enabled: true, user_rules: "" });

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
  const results = await Promise.allSettled([getSettings(), getMemory(), getMemorySettings()]);
  if (results[0].status === "fulfilled") applySettings(results[0].value);
  else error.value = "无法加载设置，请重新打开设置页面";
  if (results[1].status === 'fulfilled') memories.value = results[1].value;
  if (results[2].status === 'fulfilled') memorySettings.value = results[2].value;
  const failed=results.find(r=>r.status==='rejected'); if(failed)error.value=failed.reason.message;
}
function flash(text = "已保存") { clearTimeout(flashTimer); saved.value = text; flashTimer = window.setTimeout(() => saved.value = "", 1800); }
function saveMemory(entry) { return perform(async()=>{ requireSuccess(await updateMemory(entry.id, entry.content)); await reloadMemory(); flash(); }); }
function removeMemory(entry) { return perform(async()=>{ requireSuccess(await deleteMemory(entry.id)); await reloadMemory(); }); }
async function clearMemory() { if (!confirm(t("确定清空全部记忆？此操作无法撤销。"))) return; await perform(async()=>{ requireSuccess(await deleteAllMemory()); await reloadMemory(); }); }
function saveMemoryPrefs() { return perform(async()=>{ requireSuccess(await setMemorySettings(memorySettings.value)); memorySettings.value=await getMemorySettings(); flash(); }); }
async function reloadMemory() { try { memories.value=await getMemory(); } catch(e){ error.value=e.message; } }
function saveGeneral(key, action, value) { return perform(async () => { if (key === "sessions_peek") value = sessionLimit(value); requireSuccess(await action(value)); await refreshSettings(); flash(); }); }
onMounted(()=>{ load(); window.addEventListener('ocw-memory-changed',reloadMemory); });
onBeforeUnmount(() => { clearTimeout(flashTimer); window.removeEventListener('ocw-memory-changed',reloadMemory); });
</script>

<template>
  <div class="settings-layout">
    <nav class="subnav"><h2>{{ t("设置") }}</h2><button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ t(item.label) }}</button></nav>
    <section class="page-view settings-page">
      <div v-if="saved" class="save-toast">{{ t(saved) }}</div>
      <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
      <fieldset :key="renderVersion" class="settings-fields" :disabled="saving">
      <template v-if="tab === 'general'">
        <div class="page-head"><div><h1>{{ t("通用") }}</h1><p>{{ t("外观、侧边栏和本地文件设置。") }}</p></div></div>
        <div class="card settings-card"><h2>{{ t("主题") }}</h2><label>{{ t("外观") }}<select :aria-label="t('外观')" :value="themePreference" @change="setTheme($event.target.value)"><option value="auto">{{ t("跟随系统") }}</option><option value="light">{{ t("深黑") }}</option><option value="dark">{{ t("石墨") }}</option></select></label><label>{{ t("语言") }}<select :aria-label="t('语言')" :value="languagePreference" @change="setLanguage($event.target.value)"><option value="auto">{{ t("跟随系统") }}</option><option value="zh">{{ t("简体中文") }}</option><option value="en">English</option></select></label><button class="btn" @click="emit('setup')">{{ t("重新运行首次引导") }}</button></div>
        <div class="card settings-card"><h2>{{ t("侧边栏") }}</h2><label>{{ t("每组显示会话数") }}<input type="number" min="1" max="50" :value="settings.sessions_peek || 5" @change="saveGeneral('sessions_peek', setSessionsPeek, Number($event.target.value))" /></label><label class="toggle-row"><span><strong>{{ t("显示上下文使用进度") }}</strong><small>{{ t("在输入框中展示模型上下文占用") }}</small></span><input type="checkbox" :checked="settings.context_bar" @change="saveGeneral('context_bar', setContextBar, $event.target.checked)" /></label></div>
        <div class="card settings-card"><h2>{{ t("本地文件") }}</h2><label>{{ t("临时工作区根目录") }}<input v-model="settings.scratch_base" :placeholder="t(&quot;使用系统默认目录&quot;)" /></label><button class="btn" @click="saveGeneral('scratch_base', setScratchBase, settings.scratch_base)">{{ t("保存目录") }}</button></div>
        <div class="card settings-card"><h2>{{ t("自动审批") }}</h2><label class="toggle-row"><span><strong>{{ t("启用自动审批模式") }}</strong><small>{{ t("允许审查器自动批准低风险操作") }}</small></span><input type="checkbox" :checked="settings.auto_approve" @change="saveGeneral('auto_approve', setAutoApprove, $event.target.checked)" /></label></div>
        <div class="card settings-card"><label class="toggle-row"><span><strong>{{ t("自动审批影子评估") }}</strong><small>{{ t("审查器仅记录评估，不替你作出审批决定") }}</small></span><input type="checkbox" :checked="settings.auto_approve_shadow" @change="saveGeneral('auto_approve_shadow',setAutoApproveShadow,$event.target.checked)" /></label></div>
      </template>

      <template v-else-if="tab === 'models'">
        <div class="page-head"><div><h1>{{ t("模型") }}</h1><p>{{ t("连接你的 AI 提供商，配置凭据和模型。") }}</p></div></div>
        <ProviderManager @change="emit('settings-change')" />
      </template>

      <template v-else-if="tab === 'context'">
        <div class="page-head"><div><h1>{{ t("上下文与文件") }}</h1><p>{{ t("控制 PDF 处理与自动压缩策略。") }}</p></div></div>
        <form class="card settings-card" @submit.prevent="savePdf"><h2>{{ t("PDF 文本用量优化") }}</h2><label>{{ t("回退模式") }}<select v-model="settings.pdf_fallback"><option value="text">{{ t("提取文本") }}</option><option value="images">{{ t("转换为图片") }}</option></select></label><label>{{ t("最大页数") }}<input v-model.number="settings.pdf_max_pages" required type="number" min="1" max="100" step="1" /></label><label>{{ t("最大文件大小（MB）") }}<input v-model.number="settings.pdf_max_mb" required type="number" min="1" max="10" step="1" /></label><button class="btn primary">{{ t("保存 PDF 设置") }}</button></form>
        <form class="card settings-card" @submit.prevent="saveCompaction"><h2>{{ t("自动上下文压缩") }}</h2><label>{{ t("触发阈值（%）") }}<input v-model.number="compactionPercent" required type="number" min="10" max="95" step="1" /></label><label>{{ t("触发压缩的令牌数量上限") }}<input v-model.number="settings.compaction_cap_tokens" required type="number" min="10000" max="2000000" step="1" /></label><label>{{ t("压缩模型") }}<input v-model="settings.compaction_model" :placeholder="t(&quot;留空使用当前模型&quot;)" /></label><button class="btn primary">{{ t("保存压缩设置") }}</button></form>
      </template>

      <template v-else-if="tab === 'skills'">
        <div class="page-head"><div><h1>{{ t("技能") }}</h1><p>{{ t("管理可由输入框斜杠菜单调用的技能。") }}</p></div></div>
        <SkillsManager @change="emit('settings-change')" />
      </template>

      <template v-else-if="tab === 'memory'">
        <div class="page-head"><div><h1>{{ t("记忆") }}</h1><p>{{ t("管理代理保存的长期信息和用户规则。") }}</p></div><button class="btn danger" @click="clearMemory">{{ t("清空全部") }}</button></div>
        <div class="card settings-card"><label class="toggle-row"><span><strong>{{ t("启用记忆") }}</strong><small>{{ t("允许代理使用和保存长期记忆") }}</small></span><input v-model="memorySettings.enabled" type="checkbox" @change="saveMemoryPrefs" /></label><label>{{ t("用户规则") }}<textarea v-model="memorySettings.user_rules" rows="5" @blur="saveMemoryPrefs"></textarea></label></div>
        <div class="card-list"><article v-for="entry in memories" :key="entry.id" class="card memory-row"><small>{{ entry.scope }} · {{ entry.created_at }}</small><textarea v-model="entry.content" rows="3"></textarea><div class="actions"><button class="btn" @click="saveMemory(entry)">{{ t("保存") }}</button><button class="btn danger" @click="removeMemory(entry)">{{ t("删除") }}</button></div></article></div><div v-if="!memories.length" class="empty-card">{{ t("还没有保存的记忆。") }}</div>
      </template>

      <template v-else>
        <div class="page-head"><h1>{{ t("智能体") }}</h1></div><PersonasManager @change="emit('settings-change')" @connectors="emit('connectors',$event)" @use="emit('use-persona',$event)" />
      </template>
      </fieldset>
    </section>
  </div>
</template>
