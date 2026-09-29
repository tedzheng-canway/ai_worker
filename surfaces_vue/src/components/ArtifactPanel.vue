<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue';
import { getArtifacts, readArtifact, revealArtifact } from '../api';
import { requireSuccess } from '../settings';
import { sandboxHtml, parseCsv } from '../markdown';
import MarkdownView from './MarkdownView.vue';
const PdfPreview = defineAsyncComponent(() => import('./PdfPreview.vue'));
const props = defineProps({ sessionId: String, workspace: String, refreshKey: Number, initialPath: String });
const emit = defineEmits(['close']);
const artifacts = ref([]), content = ref(null), path = ref(''), error = ref(''), loading = ref(false), sheets = ref({}), sheet = ref('');
let requestId = 0, listId = 0;
async function refresh() {
  const id = ++listId, session = props.sessionId;
  try { const rows = await getArtifacts(session); if (id === listId) artifacts.value = rows; }
  catch (err) { if (id === listId) error.value = err.message; }
}
async function open(nextPath) {
  const id = ++requestId, session = props.sessionId;
  path.value = nextPath; content.value = null; sheets.value = {}; error.value = ''; loading.value = true;
  try {
    const result = requireSuccess(await readArtifact(session, nextPath));
    if (id !== requestId) return;
    content.value = result;
    if (result.kind === 'sheet' && result.data_url) {
      const XLSX = await import('xlsx');
      const book = XLSX.read(result.data_url.split(',')[1], { type: 'base64' });
      if (id !== requestId) return;
      sheets.value = Object.fromEntries(book.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: '', raw: false })]));
      sheet.value = book.SheetNames[0];
    }
  } catch (err) { if (id === requestId) error.value = err.message; }
  finally { if (id === requestId) loading.value = false; }
}
const table = computed(() => content.value?.kind === 'csv' ? parseCsv(content.value.content || '') : sheets.value[sheet.value] || []);
async function reveal(mode) { try { requireSuccess(await revealArtifact(props.sessionId, path.value, mode)); } catch (err) { error.value = err.message; } }
function back() { requestId++; content.value = null; path.value = ''; loading.value = false; error.value = ''; }
function child(name) { open(`${path.value.replace(/[\\/]+$/, '')}/${name}`); }
watch(() => props.sessionId, () => { back(); artifacts.value = []; refresh(); if (props.initialPath) open(props.initialPath); }, { immediate: true });
watch(() => props.initialPath, (value) => { if (value) open(value); });
watch(() => props.refreshKey, () => { refresh(); if (path.value) open(path.value); });
</script>
<template><aside class="detail-panel artifact-panel"><header><strong>文件与产物</strong><button class="btn" @click="refresh(); path && open(path)">刷新</button><button class="icon-button" title="关闭文件面板" aria-label="关闭文件面板" @click="emit('close')">×</button></header><p v-if="error" class="error-text" role="alert">{{ error }}</p>
  <template v-if="!path"><button v-if="workspace" class="btn" @click="open(workspace)">浏览工作目录</button><p v-if="!artifacts.length" class="muted">暂无产物</p><button v-for="file in artifacts" :key="file.path" class="file-row" @click="open(file.path)"><strong>{{ file.name || file.path }}</strong><small>{{ file.kind }} · {{ file.size }} bytes</small></button></template>
  <template v-else><div class="actions"><button class="btn" @click="back">返回列表</button><button class="btn" @click="reveal('open')">系统打开</button><button class="btn" @click="reveal('reveal')">定位文件</button></div><p class="file-path">{{ path }}</p><p v-if="loading">正在加载…</p><template v-if="content"><p v-if="content.truncated" class="status-note">内容已截断；完整内容请用系统打开。</p>
    <div v-if="content.kind === 'folder'"><button v-for="entry in content.entries" :key="entry.name" class="file-row" @click="child(entry.name)">{{ entry.dir ? '▣' : '▤' }} {{ entry.name }}</button><p v-if="!content.entries?.length">空目录</p></div>
    <MarkdownView v-else-if="content.kind === 'markdown'" :text="content.content" />
    <img v-else-if="content.kind === 'image'" class="artifact-image" :src="content.data_url" :alt="path" />
    <iframe v-else-if="content.kind === 'html'" title="HTML 隔离预览" sandbox="allow-scripts" :srcdoc="sandboxHtml(content.content)"></iframe>
    <PdfPreview v-else-if="content.kind === 'pdf'" :data-url="content.data_url" />
    <template v-else-if="content.kind === 'csv' || content.kind === 'sheet'"><select v-if="content.kind === 'sheet'" v-model="sheet" aria-label="工作表"><option v-for="name in Object.keys(sheets)" :key="name">{{ name }}</option></select><p v-if="table.length > 500">预览前 500 行，共 {{ table.length }} 行。</p><div class="table-scroll"><table><tbody><tr v-for="(row, i) in table.slice(0,500)" :key="i"><td v-for="(cell, j) in row" :key="j">{{ cell }}</td></tr></tbody></table></div></template>
    <pre v-else-if="content.content != null" class="file-text">{{ content.content }}</pre><p v-else>此格式请通过“系统打开”查看。</p>
  </template></template>
</aside></template>
