<script setup>
import { ref, watch } from 'vue';
import { getRoots, addRoot, removeRoot, saveSessionAsProject, pickFolderViaServer, getTrustedWorkspaces, setWorkspaceTrusted, getProjectMenu, setProjectBinding, nameCurrentProject, setSessionSkill } from '../api';
import { requireSuccess } from '../settings';
import SessionIntegrations from './SessionIntegrations.vue';
const props = defineProps({ sessionId: String, workspace: String, skills: Array, running: Boolean, temporary: Boolean, persona:String });
const emit = defineEmits(['close', 'saved', 'skills-change', 'binding-change', 'open-board', 'open-memory', 'integrations-change', 'open-connectors']);
const roots = ref([]), trusted = ref([]), menus = ref({}), names = ref({ memory: '', board: '' }), path = ref(''), writable = ref(false), destination = ref(''), error = ref(''), busy = ref(false);
let generation = 0;
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
<template><aside class="detail-panel access-panel"><header><strong>会话权限与项目</strong><button class="btn" @click="load">刷新</button><button class="icon-button" title="关闭权限面板" aria-label="关闭权限面板" @click="emit('close')">×</button></header><p v-if="error" class="error-text" role="alert">{{ error }}</p><fieldset :disabled="busy">
<h3>目录权限</h3><article v-for="root in roots" :key="root.path" class="access-row"><strong>{{ root.label || root.path }}</strong><small>{{ root.path }}{{ root.exists === false ? ' · 目录不存在' : '' }}</small><label><input type="checkbox" :checked="root.writable" :disabled="root.primary" @change="act(() => addRoot(sessionId, root.path, !root.writable))" />允许写入{{ root.primary ? '（主目录）' : '' }}</label><button v-if="!root.primary" class="btn" @click="act(() => removeRoot(sessionId, root.path))">移除目录</button></article>
<form class="form-card" @submit.prevent="add"><label>额外目录<input v-model="path" placeholder="绝对路径" required /></label><div class="actions"><button type="button" class="btn" @click="choose">选择目录</button><label><input v-model="writable" type="checkbox" />允许写入</label><button class="btn primary">添加目录</button></div></form>
<form v-if="temporary" class="form-card" @submit.prevent="save"><h3>另存为项目</h3><input v-model="destination" aria-label="项目保存路径" placeholder="目标项目绝对路径" required /><button class="btn" :disabled="running">保存为项目</button><small v-if="running">等待当前任务结束后保存。</small></form>
<h3>工作区命令信任</h3><p class="muted">信任工作区声明的命令；可在此撤销。</p><button v-if="workspace && !trusted.some(row => row.workspace === workspace)" class="btn" @click="act(() => setWorkspaceTrusted(workspace, true))">信任当前工作区</button><article v-for="row in trusted" :key="row.workspace" class="access-row"><strong>{{ row.workspace }}</strong><pre>{{ (row.requested_commands || []).join('\n') }}</pre><button class="btn" @click="act(() => setWorkspaceTrusted(row.workspace, false))">撤销信任</button></article>
<h3>本会话技能</h3><p v-if="!skills?.length">暂无可用技能，请先在设置中启用。</p><label v-for="skill in skills" :key="skill.name" class="access-row"><span>/{{ skill.name }} · {{ skill.description }}</span><input type="checkbox" :checked="skill.enabled" @change="act(async () => { const r = requireSuccess(await setSessionSkill(sessionId, skill.name, !skill.enabled, workspace)); emit('skills-change'); return r; })" /></label>
<section v-for="kind in ['memory','board']" :key="kind" class="project-binding"><h3>{{ kind === 'memory' ? '项目记忆' : '项目看板' }}</h3><label>绑定<select :value="menus[kind]?.bound || ''" :disabled="running" @change="bind(kind, $event.target.value)"><option value="">{{ menus[kind]?.derived?.label || '无目录项目' }}</option><option v-for="entry in menus[kind]?.named" :key="entry.key" :value="entry.name">{{ entry.name }}</option></select></label><form class="actions" @submit.prevent="name(kind)"><input v-model="names[kind]" :aria-label="`命名${kind === 'memory' ? '记忆' : '看板'}`" placeholder="为当前项目命名" required /><button class="btn">命名</button></form><template v-if="kind === 'memory'"><p class="muted">绑定决定此会话使用的项目记忆；记忆管理展示全部已保存内容。</p><button class="btn" @click="emit('open-memory')">打开记忆管理</button></template><button v-else class="btn" @click="emit('open-board')">查看当前项目看板</button></section>
</fieldset><SessionIntegrations :session-id="sessionId" :persona="persona" @change="emit('integrations-change')" @open-connectors="emit('open-connectors',$event)" /></aside></template>
