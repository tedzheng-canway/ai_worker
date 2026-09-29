<script setup>
import { t } from '../i18n';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
const props = defineProps({ sessions: Array, personas: Array });
const emit = defineEmits(['close', 'select']);
const query = ref(''), active = ref(0), input = ref(null), list = ref(null);
const rows = computed(() => (props.sessions || []).filter(s => !s.archived && !s.session_id.startsWith('__') && `${s.title || s.session_id} ${s.agent} ${s.workspace || ''} ${props.personas?.find(p => p.id === s.agent)?.name || ''}`.toLowerCase().includes(query.value.trim().toLowerCase())).sort((a,b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.updated_at || '').localeCompare(a.updated_at || '')));
function choose(row = rows.value[active.value]) { if (row) { emit('select', row); emit('close'); } }
function key(event) {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowDown') active.value = Math.min(rows.value.length - 1, active.value + 1);
  else if (event.key === 'ArrowUp') active.value = Math.max(0, active.value - 1);
  else if (event.key === 'Enter') choose();
  else if ((event.ctrlKey || event.metaKey) && /^[1-9]$/.test(event.key)) choose(rows.value[Number(event.key) - 1]);
  else return;
  event.preventDefault(); event.stopPropagation();
}
watch(query, () => active.value = 0);
watch(active, () => nextTick(() => list.value?.querySelector('.active')?.scrollIntoView({ block: 'nearest' })));
onMounted(() => input.value?.focus());
</script>
<template><div class="dialog-overlay" @click.self="emit('close')" @keydown="key"><section class="search-dialog" role="dialog" aria-modal="true" :aria-label="t(&quot;搜索对话&quot;)"><header><input ref="input" v-model="query" :placeholder="t(&quot;搜索标题、智能体或项目&quot;)" /><button class="btn" @click="emit('close')">{{ t("关闭") }}</button></header><div ref="list" class="search-results"><button v-for="(row,i) in rows" :key="row.session_id" class="search-result" :class="{active: active === i}" @mouseenter="active = i" @click="choose(row)"><strong>{{ row.pinned ? '★ ' : '' }}{{ row.title || row.session_id }}</strong><small>{{ row.agent }} · {{ row.workspace }} <kbd v-if="i < 9">Ctrl+{{ i+1 }}</kbd></small></button><p v-if="!rows.length">{{ t("没有匹配的对话") }}</p></div></section></div></template>
