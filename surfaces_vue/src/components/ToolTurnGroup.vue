<script setup>
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { isDeclined, isToolRunning, turnRows } from '../sessionState';
import MarkdownView from './MarkdownView.vue';
import ToolStepRow from './ToolStepRow.vue';
import ResponseMeta from './ResponseMeta.vue';

const props = defineProps({ items: { type: Array, required: true }, live: Boolean, streamingText: String, streamingReasoning: String, busy: Boolean, connected: Boolean });
const emit = defineEmits(['allow-anyway']);
const open = ref(false);
const rows = computed(() => turnRows(props.items));
const steps = computed(() => rows.value.filter(row => row.kind !== 'narration'));
const running = computed(() => props.live || props.items.some(item => item.kind === 'tool' && isToolRunning(item.status)));
const declined = computed(() => steps.value.filter(row => row.kind === 'ask' ? isDeclined(row.item.resolved) : row.item.status === 'denied').length);
const hidden = computed(() => props.items.reduce((sum, item) => sum + (item.hidden || 0), 0));
const liveLine = computed(() => props.streamingText || [...props.items].reverse().find(item => item.kind === 'assistant' && item.text)?.text || '');
</script>

<template>
  <details class="tool-turn" :open="open" data-testid="turn-group">
    <summary class="turn-summary" :aria-expanded="open" @click.prevent="open = !open">
      <span class="turn-chevron" :class="{ open }" aria-hidden="true">›</span>
      <span class="turn-count">{{ running ? t('正在执行 ') : '' }}{{ steps.length }} {{ t('步') }}{{ running ? '…' : '' }}</span>
      <span v-if="declined" class="turn-declined">· {{ declined }} {{ t('已拒绝') }}</span>
      <span v-if="hidden" class="turn-hidden">· {{ hidden }} {{ t('项已隐藏') }}</span>
      <span v-if="running && !open && liveLine" class="turn-live-line" data-testid="turn-live-line">· {{ liveLine }}</span>
    </summary>
    <div v-if="open" class="turn-body">
      <template v-for="(row, index) in rows" :key="row.item.id || index">
        <div v-if="row.kind === 'narration'" class="turn-narration" data-testid="turn-narration">
          <details v-if="row.item.reasoning" class="reasoning"><summary>{{ t('思考过程') }}</summary><pre>{{ row.item.reasoning }}</pre></details>
          <MarkdownView v-if="row.item.text" :text="row.item.text" />
          <ResponseMeta :item="row.item" />
        </div>
        <ToolStepRow v-else :step="row.item" :approval="row.approval" :intent="row.kind === 'ask'" :busy="busy" :connected="connected" @allow-anyway="emit('allow-anyway', $event)" />
      </template>
      <div v-if="streamingText || streamingReasoning" class="turn-narration" data-testid="turn-live-stream">
        <details v-if="streamingReasoning" class="reasoning" open><summary>{{ t('思考过程') }}</summary><pre>{{ streamingReasoning }}</pre></details>
        <MarkdownView v-if="streamingText" :text="streamingText" /><span v-if="streamingText" class="cursor"></span>
      </div>
    </div>
  </details>
</template>

<style scoped>
.tool-turn { min-width: 0; }
.turn-summary { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 2px 0; list-style: none; cursor: pointer; user-select: none; color: var(--faint); font-size: 13px; line-height: 1.5; }
.turn-summary::-webkit-details-marker { display: none; }
.turn-summary:hover { color: var(--muted); }
.turn-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
.turn-chevron { flex: none; font-size: 16px; transition: transform .15s; }
.turn-chevron.open { transform: rotate(90deg); }
.turn-count { flex: none; }
.turn-declined { color: var(--danger); }
.turn-hidden { color: #e2bd7c; }
.turn-live-line { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.turn-body { display: flex; flex-direction: column; gap: 2px; margin: 4px 0 0 6px; padding-left: 8px; border-left: 2px solid var(--line); }
.turn-narration { max-width: 60ch; padding: 4px 8px; font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.turn-narration :deep(.markdown-body) { font-size: 13px; color: var(--muted); line-height: 1.5; }
.turn-narration :deep(.markdown-body p) { margin: 0 0 4px; }
.turn-narration :deep(.markdown-body p:last-child) { margin-bottom: 0; }
@media (max-width: 760px) { .turn-summary { flex-wrap: wrap; } .turn-live-line { flex-basis: 100%; margin-left: 14px; } }
@media (prefers-reduced-motion: reduce) { .turn-chevron { transition: none; } }
</style>
