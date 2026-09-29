<script setup>
import { onMounted, ref } from 'vue';
import { listSkills, createSkill, updateSkill, deleteSkill, revealSkill, stageSkillUpload, confirmSkillUpload } from '../api';
import { requireSuccess } from '../settings';
import { readFile } from '../attachments';
import MarkdownView from './MarkdownView.vue';
const emit = defineEmits(['change']);
const rows = ref([]), editor = ref(null), upload = ref(null), error = ref(''), busy = ref(false), fileInput = ref(null), armed = ref('');
async function refresh() { rows.value = await listSkills(); }
async function perform(fn) {
  busy.value = true; error.value = '';
  try { await fn(); await refresh(); emit('change'); }
  catch (err) { error.value = err.message; }
  finally { busy.value = false; }
}
function edit(skill) { editor.value = skill ? { ...skill, editing: true } : { name: '', description: '', instructions: '' }; }
function save() { perform(async () => {
  const { name, description, instructions, editing } = editor.value;
  requireSuccess(await (editing ? updateSkill(name, { description, instructions, ...(editor.value.scope === 'workspace' ? { workspace: editor.value.workspace } : {}) }) : createSkill({ name: name.trim(), description, instructions, scope: 'global' })));
  editor.value = null;
}); }
function remove(skill) { if (armed.value !== skill.name) { armed.value = skill.name; return; } perform(async () => { requireSuccess(await deleteSkill(skill.name, skill.workspace)); armed.value = ''; }); }
async function stage(event) {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  await perform(async () => { const data = await readFile(file); upload.value = requireSuccess(await stageSkillUpload(data.split(',')[1], file.name)); });
}
function confirmUpload() { perform(async () => { requireSuccess(await confirmSkillUpload(upload.value.token)); upload.value = null; }); }
onMounted(() => perform(async () => {}));
</script>
<template><section class="skills-manager"><div class="actions"><button class="btn primary" :disabled="busy" @click="edit()">创建技能</button><button class="btn" :disabled="busy" @click="fileInput.click()">导入技能文件 / ZIP</button><input ref="fileInput" type="file" accept=".md,.zip" hidden @change="stage" /></div><p v-if="error" class="error-text" role="alert">{{ error }}</p>
  <fieldset :disabled="busy"><form v-if="editor" class="card form-card" @submit.prevent="save"><label>技能名称<input v-model="editor.name" :disabled="editor.editing" required /></label><label>说明<input v-model="editor.description" /></label><label>指令<textarea v-model="editor.instructions" required rows="9"></textarea></label><div class="actions"><button class="btn primary">保存技能</button><button type="button" class="btn" @click="editor = null">取消</button></div></form>
  <article v-if="upload" class="card upload-preview"><h3>安装预览：{{ upload.name }}</h3><p>{{ upload.description }}</p><MarkdownView :text="upload.instructions" /><pre>{{ (upload.files || []).join('\n') }}</pre><div class="actions"><button class="btn primary" @click="confirmUpload">确认安装</button><button class="btn" @click="upload = null">取消安装</button></div></article>
  <div class="card-list"><article v-for="skill in rows" :key="skill.name" class="card list-card"><div><strong>/{{ skill.name }}</strong><small>{{ skill.description }} · {{ skill.scope }}</small></div><div class="actions"><label><input type="checkbox" :checked="skill.enabled" @change="perform(async () => requireSuccess(await updateSkill(skill.name, { enabled: !skill.enabled })))" />启用</label><button class="btn" @click="edit(skill)">编辑</button><button class="btn" @click="perform(async () => requireSuccess(await revealSkill(skill.name)))">打开目录</button><button class="btn danger" @click="remove(skill)">{{ armed === skill.name ? '确认删除' : '删除' }}</button></div></article></div></fieldset>
</section></template>
