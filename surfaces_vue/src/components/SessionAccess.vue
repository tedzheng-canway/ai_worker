<script setup>
import { t } from '../i18n';
import { ref, watch } from 'vue';
import { getRoots, addRoot, removeRoot, saveSessionAsProject, pickFolderViaServer, getTrustedWorkspaces, setWorkspaceTrusted, getProjectMenu, setProjectBinding, nameCurrentProject, setSessionSkill } from '../api';
import { requireSuccess } from '../settings';
import SessionIntegrations from './SessionIntegrations.vue';
const props = defineProps({ sessionId: String, workspace: String, skills: Array, running: Boolean, temporary: Boolean, persona:String });
const emit = defineEmits(['close', 'saved', 'skills-change', 'binding-change', 'open-board', 'open-memory', 'integrations-change', 'open-connectors']);
const roots = ref([]), trusted = ref([]), menus = ref({}), names = ref({ memory: '', board: '' }), path = ref(''), writable = ref(false), destination = ref(''), error = ref(''), busy = ref(false);
let generation = 0;
const folderLabel = root => root.label || root.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || root.path;
async function load() {
  const current = ++generation;
  const results = await Promise.allSettled([getRoots(props.sessionId), getTrustedWorkspaces(), getProjectMenu(props.sessionId, 'memory'), getProjectMenu(props.sessionId, 'board')]);
  if (current !== generation) return;
  const targets = [value => roots.value = value, value => trusted.value = value, value => menus.value.memory = value, value => menus.value.board = value];
  results.forEach((r, i) => { if (r.status === 'fulfilled') targets[i](r.value); });
  const failed = results.find(r => r.status === 'rejected');
  if (failed) error.value = failed.reason.message;
}
async function act(fn) { const session = props.sessionId; busy.value = true; error.value = ''; try { requireSuccess(await fn()); if (session === props.sessionId) await load(); } catch (err) { error.value = err.message; } finally { busy.value = false; } }
async function choose() { try { const selected = await pickFolderViaServer(); if (selected) path.value = selected; } catch (err) { error.value = err.message; } }
function add() { if (!path.value.trim()) return; act(async () => { const r = requireSuccess(await addRoot(props.sessionId, path.value.trim(), writable.value)); path.value = ''; return r; }); }
function save() { if (!destination.value.trim()) return; act(async () => { const r = requireSuccess(await saveSessionAsProject(props.sessionId, destination.value.trim())); emit('saved', r.path); return r; }); }
function bind(kind, name) { act(async () => { const r = requireSuccess(await setProjectBinding(props.sessionId, kind, name || null)); emit('binding-change', kind); return r; }); }
function name(kind) { if (!names.value[kind].trim()) return; act(async () => { const r = requireSuccess(await nameCurrentProject(props.sessionId, kind, names.value[kind].trim())); names.value[kind] = ''; emit('binding-change', kind); return r; }); }
watch(() => props.sessionId, () => { roots.value = []; menus.value = {}; error.value = ''; path.value = ''; destination.value = ''; load(); }, { immediate: true });
</script>
<template><aside class="detail-panel access-panel"><header><strong>{{ t("会话权限与项目") }}</strong><button class="btn" @click="load">{{ t("刷新") }}</button><button class="icon-button" :title="t(&quot;关闭权限面板&quot;)" :aria-label="t(&quot;关闭权限面板&quot;)" @click="emit('close')">×</button></header><p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><fieldset :disabled="busy">
<h3>{{ t("目录权限") }}<span class="section-count">{{ roots.length }}</span></h3>
<article v-for="root in roots" :key="root.path" class="access-row folder-row">
  <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /></svg>
  <span class="folder-copy" :title="root.path"><strong>{{ folderLabel(root) }}<small v-if="root.primary">{{ t("（主目录）") }}</small></strong><small>{{ root.path }}</small><small v-if="root.exists === false" class="error-text">{{ t(" · 目录不存在") }}</small></span>
  <label class="folder-permission" :class="{ writable: root.writable }"><input type="checkbox" :checked="root.writable" :disabled="root.primary" @change="act(() => addRoot(sessionId, root.path, !root.writable))" />{{ t("允许写入") }}</label>
  <button v-if="!root.primary" class="icon-button folder-remove" :title="t('移除目录')" :aria-label="t('移除目录')" @click="act(() => removeRoot(sessionId, root.path))">×</button>
</article>
<form class="form-card" @submit.prevent="add"><label>{{ t("额外目录") }}<input v-model="path" :placeholder="t(&quot;绝对路径&quot;)" required /></label><div class="actions"><button type="button" class="btn" @click="choose">{{ t("选择目录") }}</button><label><input v-model="writable" type="checkbox" />{{ t("允许写入") }}</label><button class="btn primary">{{ t("添加目录") }}</button></div></form>
<form v-if="temporary" class="form-card" @submit.prevent="save"><h3>{{ t("另存为项目") }}</h3><input v-model="destination" :aria-label="t(&quot;项目保存路径&quot;)" :placeholder="t(&quot;目标项目绝对路径&quot;)" required /><button class="btn" :disabled="running">{{ t("保存为项目") }}</button><small v-if="running">{{ t("等待当前任务结束后保存。") }}</small></form>
<h3>{{ t("工作区命令信任") }}</h3><p class="muted">{{ t("信任工作区声明的命令；可在此撤销。") }}</p><button v-if="workspace && !trusted.some(row => row.workspace === workspace)" class="btn" @click="act(() => setWorkspaceTrusted(workspace, true))">{{ t("信任当前工作区") }}</button><article v-for="row in trusted" :key="row.workspace" class="access-row"><strong>{{ row.workspace }}</strong><pre>{{ (row.requested_commands || []).join('\n') }}</pre><button class="btn" @click="act(() => setWorkspaceTrusted(row.workspace, false))">{{ t("撤销信任") }}</button></article>
<h3>{{ t("本会话技能") }}</h3><p v-if="!skills?.length" class="muted">{{ t("暂无可用技能，请先在设置中启用。") }}</p><label v-for="skill in skills" :key="skill.name" class="access-row skill-row"><span><strong>/{{ skill.name }}</strong><small>{{ skill.description }}</small></span><input type="checkbox" :checked="skill.enabled" @change="act(async () => { const r = requireSuccess(await setSessionSkill(sessionId, skill.name, !skill.enabled, workspace)); emit('skills-change'); return r; })" /></label>
<section v-for="kind in ['memory','board']" :key="kind" class="project-binding"><h3>{{ kind === 'memory' ? t("项目记忆") : t("项目看板") }}</h3><label>{{ t("绑定") }}<select :value="menus[kind]?.bound || ''" :disabled="running" @change="bind(kind, $event.target.value)"><option value="">{{ menus[kind]?.derived?.label || t("无目录项目") }}</option><option v-for="entry in menus[kind]?.named" :key="entry.key" :value="entry.name">{{ entry.name }}</option></select></label><form class="actions" @submit.prevent="name(kind)"><input v-model="names[kind]" :aria-label="(t(&quot;命名&quot;) + (kind === 'memory' ? t(&quot;记忆&quot;) : t(&quot;看板&quot;)))" :placeholder="t(&quot;为当前项目命名&quot;)" required /><button class="btn">{{ t("命名") }}</button></form><template v-if="kind === 'memory'"><p class="muted">{{ t("绑定决定此会话使用的项目记忆；记忆管理展示全部已保存内容。") }}</p><button class="btn" @click="emit('open-memory')">{{ t("打开记忆管理") }}</button></template><button v-else class="btn" @click="emit('open-board')">{{ t("查看当前项目看板") }}</button></section>
</fieldset><SessionIntegrations :session-id="sessionId" :persona="persona" @change="emit('integrations-change')" @open-connectors="emit('open-connectors',$event)" /></aside></template>

<style scoped>
/* Match the reference rail's flat rows, quiet headings and compact controls. */
.access-panel { padding: 0 16px 20px; font-size: 13px; }
.access-panel > header { position: sticky; top: 0; z-index: 2; margin: 0 -16px 0; padding: 12px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
.access-panel > header strong { font-size: 13px; }
.access-panel .btn { padding: 5px 9px; font-size: 12px; border-radius: 8px; }
.access-panel h3 { display: flex; align-items: center; gap: 8px; margin: 18px 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .05em; color: var(--faint); }
.section-count { margin-left: auto; font-weight: 400; letter-spacing: 0; }
.access-panel p { font-size: 12px; line-height: 1.5; margin: 6px 0 10px; }
.access-panel .access-row { padding: 6px; gap: 8px; border: 0; border-radius: 8px; }
.access-panel .access-row:hover { background: var(--paper); }
.access-panel .folder-row { flex-wrap: nowrap; }
.folder-icon { width: 16px; height: 16px; flex-shrink: 0; color: var(--faint); }
.folder-copy { flex: 1; min-width: 0; }
.folder-copy > strong, .folder-copy > small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-copy strong { font-size: 12px; font-weight: 500; }
.folder-copy small { color: var(--faint); font-size: 11px; font-weight: 400; }
.folder-permission { display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 10px; padding: 3px 5px; border: 1px solid var(--line); border-radius: 5px; color: var(--muted); }
.folder-permission.writable { color: var(--accent); background: var(--accent-soft); }
.folder-permission input { margin: 0; width: 12px; height: 12px; }
.folder-remove { width: 22px; height: 24px; padding: 0; color: var(--faint); }
.access-panel .form-card { display: grid; gap: 8px; margin: 10px 0 16px; padding: 10px; border: 1px solid var(--line); border-radius: 8px; box-shadow: none; background: var(--paper); }
.access-panel .form-card h3 { margin: 0; }
.access-panel .form-card label { font-size: 12px; }
.access-panel input:not([type=checkbox]), .access-panel select { min-width: 0; padding: 6px 8px; font-size: 12px; }
.access-panel .actions { gap: 6px; }
.access-panel .actions label { display: inline-flex; flex-direction: row; align-items: center; gap: 4px; margin: 0; white-space: nowrap; }
.access-panel .actions input[type=checkbox] { width: 13px; height: 13px; padding: 0; margin: 0; flex: none; }
.access-panel .skill-row { flex-wrap: nowrap; justify-content: space-between; }
.skill-row > span { min-width: 0; }
.skill-row strong { font-size: 13px; font-weight: 500; }
.skill-row small { display: block; font-size: 11px; color: var(--faint); line-height: 1.5; }
.skill-row > input { flex-shrink: 0; }
.access-panel .project-binding { margin-top: 14px; padding-top: 12px; }
.project-binding h3 { margin-top: 0; }
.project-binding > label { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 12px; color: var(--muted); font-size: 12px; }
.project-binding .actions { flex-wrap: nowrap; }
.project-binding .actions input { min-width: 0; }
.project-binding > .btn { margin-top: 6px; }
.access-panel :deep(.session-integrations) { padding: 0; margin-top: 16px; border-top: 1px solid var(--line); }
.access-panel :deep(.session-integrations h3) { margin: 16px 0 6px; font-size: 11px; font-weight: 600; color: var(--faint); letter-spacing: .05em; }
.access-panel :deep(.session-integrations fieldset) { gap: 8px; }
.access-panel :deep(.toggle-row) { padding: 6px 0; gap: 8px; font-size: 13px; }
.access-panel :deep(.toggle-row small) { font-size: 11px; line-height: 1.5; }
.access-panel :deep(.session-integrations .btn) { padding: 5px 9px; font-size: 12px; }
@media (min-width: 1101px) {
  :global(.app:has(> .detail-panel.access-panel)) { grid-template-columns: 260px minmax(360px,1fr) 340px; }
  :global(.app.sidebar-hidden:has(> .detail-panel.access-panel)) { grid-template-columns: minmax(360px,1fr) 340px; }
}
@media (max-width: 1100px) { .access-panel { width: min(380px,100vw); } }
</style>
