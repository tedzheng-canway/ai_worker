<script setup>
import { computed, ref } from 'vue';
import { t } from '../i18n';
import { isDeclined, isToolRunning } from '../sessionState';
import { approvalBadge, shortArgs, toolLine } from '../toolPresentation';

const props = defineProps({ step: { type: Object, required: true }, approval: Object, intent: Boolean, busy: Boolean, connected: Boolean });
const emit = defineEmits(['allow-anyway']);
const raw = ref(false);
const status = computed(() => props.intent ? (isDeclined(props.step.resolved) ? 'denied' : props.step.resolved === 'inbox' ? 'unknown' : 'ok') : props.step.status || 'unknown');
const running = computed(() => isToolRunning(status.value));
const failed = computed(() => !running.value && status.value !== 'ok');
const line = computed(() => toolLine(props.step.name, props.step.args, t, props.intent, props.step.preview || ''));
const badge = computed(() => approvalBadge(props.step, props.intent ? props.step : props.approval, t));
const statusLabel = computed(() => ({ denied: t('已拒绝'), unknown: t('结果未知'), error: t('执行失败'), failed: t('执行失败') })[status.value] || status.value);
const reviewerReason = computed(() => status.value === 'denied' && (props.step.reviewerReason || (props.step.approvalOrigin === 'reviewer_denied' ? props.step.approvalNote : '')));
const rawText = computed(() => `${props.step.name}  ${shortArgs(props.step.args)}${props.step.preview ? `\n→ ${props.step.preview.length > 1500 ? props.step.preview.slice(0, 1500) + '\n…' : props.step.preview}` : ''}`);
</script>

<template>
  <div class="tool-step" :data-status="status" :data-testid="intent ? 'turn-ask' : 'turn-step'">
    <div class="tool-step-line">
      <span class="tool-step-marker" :class="{ running, failed }" :title="running ? t('运行中') : failed ? statusLabel : t('已完成')">
        <span v-if="running" class="tool-step-spinner" aria-hidden="true" data-testid="step-running"></span><span v-else aria-hidden="true">●</span>
        <span class="tool-sr-only">{{ running ? t('运行中') : failed ? statusLabel : t('已完成') }}</span>
      </span>
      <span class="tool-step-title"><span>{{ line.pre }}</span><strong v-if="line.obj">{{ line.obj }}</strong><span v-if="line.post">{{ line.post }}</span></span>
      <span v-if="badge" class="tool-approval-chip" :class="badge.tone" :title="badge.title" data-testid="tool-approval-origin">{{ badge.label }}</span>
      <span v-if="step.standingRule" class="tool-approval-chip standing" :title="step.standingRule">{{ t('已自动允许') }}</span>
      <span v-if="step.hidden" class="tool-hidden" :title="t('结果已由你的隐私过滤器移除。')">{{ step.hidden }} {{ t('项已隐藏') }}</span>
      <span v-if="failed && badge?.label !== statusLabel" class="tool-failure">{{ statusLabel }}</span>
      <button v-if="!running && !intent" type="button" class="tool-raw-toggle" :aria-label="`${t('查看工具详情')} ${step.name}`" :aria-expanded="raw" @click="raw = !raw">{{ t('原始') }}</button>
    </div>
    <pre v-if="raw" class="tool-raw">{{ rawText }}</pre>
    <div v-if="reviewerReason" class="tool-reviewer-card" data-testid="reviewer-deny-card">
      <strong>{{ t('已被审查者拦截') }}</strong><p>{{ reviewerReason }}</p>
      <button v-if="step.allowAnyway !== false && !step.overridden" type="button" class="btn" :disabled="busy || !connected" @click="emit('allow-anyway', step)">{{ t('仍然允许一次') }}</button>
      <small v-else-if="step.overridden">{{ t('已批准，将原样重试此操作。') }}</small>
    </div>
  </div>
</template>

<style scoped>
.tool-step { min-width: 0; font-size: 13px; line-height: 1.5; }
.tool-step-line { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; padding: 2px 8px; border-radius: 8px; }
.tool-step-line:hover { background: var(--paper); }
.tool-step-marker { width: 14px; flex: none; color: #70c9b0; font-size: 11px; text-align: center; }
.tool-step-marker.running { color: var(--accent); }
.tool-step-marker.failed, .tool-failure { color: var(--danger); }
.tool-step[data-status="unknown"] .tool-step-marker { color: var(--faint); }
.tool-step-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--accent); border-right-color: transparent; border-radius: 50%; vertical-align: middle; animation: tool-spin .8s linear infinite; }
.tool-step-title { flex: 1; min-width: 100px; color: var(--muted); overflow-wrap: anywhere; }
.tool-step-title strong { color: var(--ink); font-weight: 400; }
.tool-approval-chip, .tool-hidden, .tool-failure { font-size: 11px; }
.tool-approval-chip { color: var(--faint); }
.tool-approval-chip.ok, .tool-approval-chip.danger, .tool-approval-chip.standing { padding: 0 6px; border-radius: 99px; }
.tool-approval-chip.ok, .tool-approval-chip.standing { color: #70c9b0; background: #70c9b015; }
.tool-approval-chip.danger { color: var(--danger); background: var(--danger-soft, #d798a515); }
.tool-hidden { color: #e2bd7c; }
.tool-step .tool-raw-toggle { min-height: 22px; padding: 0 3px; margin-left: auto; border: 0; background: transparent; color: var(--faint); font-size: 11px; font-weight: 400; opacity: 0; }
.tool-step-line:hover .tool-raw-toggle, .tool-step-line:focus-within .tool-raw-toggle, .tool-raw-toggle[aria-expanded="true"] { opacity: 1; }
.tool-raw { max-height: 224px; margin: 4px 8px 4px 32px; padding: 6px 10px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); color: var(--muted); font: 12px/1.5 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.tool-reviewer-card { margin: 4px 8px 4px 32px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: color-mix(in srgb, var(--danger-soft, #d798a515) 40%, var(--panel)); }
.tool-reviewer-card > strong { color: var(--danger); font-size: 11px; font-weight: 500; }
.tool-reviewer-card p { margin: 3px 0 6px; color: var(--ink); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.tool-reviewer-card small { color: #70c9b0; }
.tool-reviewer-card .btn { min-height: 28px; margin-top: 4px; padding: 4px 10px; font-size: 12px; }
.tool-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@keyframes tool-spin { to { transform: rotate(360deg); } }
@media (hover: none) { .tool-step .tool-raw-toggle { min-height: 32px; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .tool-step-spinner { animation: none; } }
</style>
