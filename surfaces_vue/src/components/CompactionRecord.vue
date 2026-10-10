<script setup>
import { t } from '../i18n';
import MarkdownView from './MarkdownView.vue';
defineProps({ record: { type: Object, default: () => ({}) } });
const emit = defineEmits(['open']);
</script>

<template>
  <details class="compaction-record" data-testid="compaction-record">
    <summary>{{ record.trimmed ? t('上下文已裁剪') : t('上下文已压缩') }} · {{ t('查看保留内容') }}</summary>
    <div class="compaction-body">
      <p>{{ t('原始历史保留至消息：') }}{{ record.boundary_index ?? '—' }}<template v-if="record.model_used"> · {{ t('摘要模型：') }}{{ record.model_used }}</template></p>
      <p v-if="record.trimmed">{{ t('摘要不可用，已保留近期历史和用户目标。') }}</p>
      <h4 v-if="record.summary_text">{{ t('摘要') }}</h4><MarkdownView v-if="record.summary_text" :text="record.summary_text" />
      <h4 v-if="record.working_state">{{ t('工作状态') }}</h4><MarkdownView v-if="record.working_state" :text="record.working_state" />
      <details v-if="record.user_messages?.length"><summary>{{ t('保留的用户目标') }}</summary><p v-if="record.user_messages_dropped">{{ t('中间省略消息数：') }}{{ record.user_messages_dropped }}</p><ol><li v-for="(text, i) in record.user_messages" :key="i">{{ text }}</li></ol></details>
      <button v-if="record.transcript_path" class="btn" @click="emit('open', record.transcript_path)">{{ t('查看原始历史') }}</button>
    </div>
  </details>
</template>

<style scoped>
.compaction-record { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); font-size: 13px; }
summary { cursor: pointer; }
.compaction-body { margin-top: 10px; overflow-wrap: anywhere; }
.compaction-body :deep(.markdown-body) { font-size: 13px; }
.compaction-body li { white-space: pre-wrap; margin: 6px 0; }
h4 { margin: 12px 0 6px; }
</style>
