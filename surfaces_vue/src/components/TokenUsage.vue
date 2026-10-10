<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '../i18n';

const props = defineProps({
  usage: { type: Object, default: null },
  totals: { type: Object, default: () => ({}) },
  contextWindow: { type: Number, default: 0 },
  contextBar: Boolean,
  modelLabels: { type: Object, default: () => ({}) },
});
const root = ref(null), trigger = ref(null), open = ref(false);
const fields = computed(() => [
  { key: 'input', label: t('输入'), color: 'var(--usage-input)' },
  { key: 'output', label: t('输出'), color: 'var(--usage-output)' },
  { key: 'cache_read', label: t('缓存读取'), color: 'var(--usage-cache-read)' },
  { key: 'cache_write', label: t('缓存写入'), color: 'var(--usage-cache-write)' },
]);
const models = computed(() => Object.entries(props.totals).map(([id, row]) => ({
  id, row, total: fields.value.reduce((sum, field) => sum + row[field.key], 0),
  label: id === 'unknown' ? t('未知模型') : props.modelLabels[id] || id,
})));
const sums = computed(() => Object.fromEntries(fields.value.map(field => [
  field.key, models.value.reduce((sum, model) => sum + model.row[field.key], 0),
])));
const total = computed(() => models.value.reduce((sum, model) => sum + model.total, 0));
const capacity = computed(() => Number.isFinite(props.contextWindow) && props.contextWindow > 0 ? props.contextWindow : 0);
const percent = computed(() => capacity.value ? Math.min(100, Math.round((props.usage?.tokens || 0) / capacity.value * 100)) : 0);
const showMeter = computed(() => props.contextBar && capacity.value > 0 && !!props.usage);
const tone = computed(() => !capacity.value ? 'unknown' : percent.value >= 90 ? 'critical' : percent.value >= 70 ? 'warning' : 'normal');
const status = computed(() => tone.value === 'critical' ? t('接近容量上限') : tone.value === 'warning' ? t('上下文占用较高') : t('容量充足'));
const exact = value => value.toLocaleString();
const compact = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const title = computed(() => props.usage
  ? `${t('当前上下文')} ${exact(props.usage.tokens)}${capacity.value ? ` / ${exact(capacity.value)}` : ''} tokens`
  : `${t('会话累计')} ${exact(total.value)} tokens`);

function close(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) trigger.value?.focus();
}
function outside(event) { if (!root.value?.contains(event.target)) close(); }
function escape(event) { if (open.value && event.key === 'Escape') { event.preventDefault(); close(true); } }
onMounted(() => {
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', escape);
});
</script>

<template>
  <div v-if="total > 0 || usage?.tokens > 0" ref="root" class="token-usage" :data-tone="tone">
    <button ref="trigger" type="button" class="usage-trigger" :class="{ 'has-meter': showMeter }"
      :aria-label="t('Token 用量详情')" :aria-expanded="open" :title="title" @click="open = !open" data-testid="usage-chip">
      <svg v-if="showMeter" class="usage-ring" viewBox="0 0 24 24" aria-hidden="true">
        <circle class="usage-ring-track" cx="12" cy="12" r="9" />
        <circle class="usage-ring-fill" cx="12" cy="12" r="9" pathLength="100" :stroke-dasharray="`${percent} 100`" />
      </svg>
      <svg v-else class="usage-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
        <path d="M4 15V9m6 6V4m6 11v-7" />
      </svg>
      <span class="usage-trigger-label">{{ usage ? t('上下文') : t('会话累计') }}</span>
      <strong>{{ showMeter ? `${percent}%` : compact(usage?.tokens ?? total) }}</strong>
      <svg class="usage-chevron" :class="{ open }" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3 7 3-3 3 3" /></svg>
    </button>

    <section v-if="open" class="usage-popover" role="region" :aria-label="t('Token 用量详情')" data-testid="usage-popover">
      <header class="usage-header">
        <strong>{{ t('Token 用量') }}</strong>
        <button type="button" class="usage-close" :aria-label="t('关闭用量详情')" @click="close(true)">×</button>
      </header>

      <div v-if="usage" class="usage-context">
        <div class="usage-section-heading">
          <span>{{ t('当前上下文') }}</span>
          <span v-if="showMeter" class="usage-status">{{ status }}</span>
        </div>
        <div class="usage-context-value" :title="title">
          <strong>{{ compact(usage.tokens) }}</strong>
          <span>{{ capacity ? `/ ${compact(capacity)}` : '' }} tokens</span>
          <b v-if="showMeter">{{ percent }}%</b>
        </div>
        <template v-if="showMeter">
          <div class="usage-context-track" role="progressbar" :aria-label="t('上下文使用进度')" :aria-valuenow="percent" :aria-valuemin="0" :aria-valuemax="100" :aria-valuetext="`${percent}% · ${title}`">
            <span :style="{ width: `${percent}%` }"></span>
          </div>
          <div class="usage-context-caption"><span>{{ t('已使用') }} {{ exact(usage.tokens) }}</span><span>{{ t('剩余') }} {{ compact(Math.max(0, capacity - usage.tokens)) }}</span></div>
        </template>
        <p v-else-if="!capacity" class="usage-note">{{ t('模型容量未知') }}</p>
        <p class="usage-note">{{ t('按最近一次请求的输入与缓存计算。') }}</p>
      </div>

      <div v-if="total > 0" class="usage-session">
        <div class="usage-section-heading"><span>{{ t('会话累计') }}</span><strong :title="`${exact(total)} tokens`">{{ compact(total) }} <small>tokens</small></strong></div>
        <div class="usage-composition" aria-hidden="true"><span v-for="field in fields" :key="field.key" :style="{ width: `${sums[field.key] / total * 100}%`, background: field.color }"></span></div>
        <dl class="usage-metrics">
          <div v-for="field in fields" :key="field.key"><dt><i :style="{ background: field.color }"></i>{{ field.label }}</dt><dd>{{ exact(sums[field.key]) }}</dd></div>
        </dl>
        <details class="usage-models">
          <summary>{{ t('按模型查看') }}<span>{{ models.length }}</span></summary>
          <div v-for="entry in models" :key="entry.id" class="usage-model">
            <div class="usage-model-heading"><strong :title="entry.id">{{ entry.label }}</strong><span :title="`${exact(entry.total)} tokens`">{{ compact(entry.total) }}</span></div>
            <dl><div v-for="field in fields" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ exact(entry.row[field.key]) }}</dd></div></dl>
          </div>
        </details>
        <p class="usage-note">{{ t('累计包含每轮重复发送的输入与缓存。') }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.token-usage {
  position: relative;
  flex: none;
  --usage-input: #a5a9ed;
  --usage-output: #70c9b0;
  --usage-cache-read: #e2bd7c;
  --usage-cache-write: #cc9bdb;
  --usage-tone: var(--accent);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.token-usage[data-tone="warning"] { --usage-tone: #e2bd7c; }
.token-usage[data-tone="critical"] { --usage-tone: var(--danger); }
.usage-trigger {
  display: flex; align-items: center; gap: 6px; padding: 0 9px;
  height: 36px; white-space: nowrap; color: var(--muted);
}
.usage-trigger strong { font-size: 12px; font-weight: 600; color: var(--ink); }
.usage-trigger.has-meter strong { color: var(--usage-tone); }
.usage-ring { width: 22px; height: 22px; flex: none; transform: rotate(-90deg); }
.usage-ring circle { fill: none; stroke-width: 2.5; }
.usage-ring-track { stroke: var(--strong); }
.usage-ring-fill { stroke: var(--usage-tone); transition: stroke-dasharray .25s ease, stroke .25s; }
.usage-icon { width: 18px; height: 18px; color: var(--accent); }
.usage-chevron { color: var(--faint); transition: transform .15s; }
.usage-chevron.open { transform: rotate(180deg); }
.usage-popover {
  position: absolute; bottom: calc(100% + 10px); right: 0; z-index: 85;
  width: min(340px, calc(100vw - 24px)); max-height: min(520px, calc(100dvh - 180px)); overflow-y: auto;
  border: 1px solid var(--strong); border-radius: 10px; background: var(--panel); color: var(--ink);
  padding: 14px; text-align: left;
}
.usage-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.usage-header > strong { font-size: 13px; font-weight: 600; }
.token-usage .usage-close { min-height: 24px; width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: var(--muted); font-size: 18px; }
.usage-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--muted); }
.usage-status { color: var(--usage-tone); font-size: 11px; }
.usage-context-value { display: flex; align-items: baseline; gap: 6px; margin: 10px 0 12px; }
.usage-context-value > strong { font-size: 28px; font-weight: 600; letter-spacing: -.04em; }
.usage-context-value > span { color: var(--muted); }
.usage-context-value > b { margin-left: auto; font-size: 15px; font-weight: 500; color: var(--usage-tone); }
.usage-context-track { height: 7px; overflow: hidden; border-radius: 10px; background: var(--strong); }
.usage-context-track > span { display: block; height: 100%; border-radius: inherit; background: var(--usage-tone); transition: width .25s ease, background .25s; }
.usage-context-caption { display: flex; justify-content: space-between; gap: 10px; margin-top: 7px; color: var(--muted); font-size: 11px; }
.usage-note { margin: 10px 0 0; color: var(--faint); font-size: 11px; line-height: 1.6; }
.usage-session { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--line); }
.usage-section-heading > strong { color: var(--ink); font-weight: 500; }
.usage-section-heading small { color: var(--faint); font-size: 11px; font-weight: 400; }
.usage-composition { display: flex; height: 5px; gap: 2px; overflow: hidden; border-radius: 4px; margin: 12px 0; }
.usage-composition > span { min-width: 0; }
.usage-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.usage-metrics > div { padding: 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
.usage-metrics dt { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
.usage-metrics i { width: 6px; height: 6px; border-radius: 2px; flex: none; }
.usage-metrics dd { margin: 5px 0 0; font-size: 15px; font-weight: 500; overflow-wrap: anywhere; }
.usage-models { margin-top: 12px; }
.usage-models summary { display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--muted); list-style: none; }
.usage-models summary::before { content: '›'; font-size: 15px; transition: transform .15s; }
.usage-models[open] summary::before { transform: rotate(90deg); }
.usage-models summary::-webkit-details-marker { display: none; }
.usage-models summary > span { margin-left: auto; color: var(--faint); }
.usage-model { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.usage-model-heading { display: flex; align-items: baseline; gap: 12px; }
.usage-model-heading strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.usage-model-heading > span { color: var(--muted); }
.usage-model dl { margin: 8px 0 0; }
.usage-model dl > div { display: flex; justify-content: space-between; gap: 12px; margin-top: 5px; font-size: 11px; }
.usage-model dt { color: var(--muted); }
.usage-model dd { margin: 0; }
@media (max-width: 760px) {
  .usage-trigger-label { display: none; }
  .usage-popover { position: fixed; left: 12px; right: 12px; bottom: 84px; width: auto; max-height: min(520px, calc(100dvh - 160px)); }
}
@media (prefers-reduced-motion: reduce) {
  .token-usage *, .token-usage *::before { transition: none; }
}
</style>
