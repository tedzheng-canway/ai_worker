<script setup>
import { t } from '../i18n';
defineProps({ item: { type: Object, required: true } });
</script>

<template>
  <div v-if="item.finishReason === 'length' || item.maxOutputTokens || item.reasoningEffort" class="response-meta">
    <span v-if="item.finishReason === 'length'" class="response-limit">{{ t('已达到输出上限') }}</span>
    <span v-if="item.maxOutputTokens">{{ t('实际输出上限：') }}{{ item.maxOutputTokens }} tokens</span>
    <span v-if="item.reasoningEffort" :title="item.reasoningEffort.note">{{ t('推理强度：') }}{{ item.reasoningEffort.effective || t('未发送') }}<template v-if="item.reasoningEffort.requested && item.reasoningEffort.requested !== item.reasoningEffort.effective"> ({{ t('请求：') }}{{ item.reasoningEffort.requested }})</template></span>
  </div>
</template>

<style scoped>
.response-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--faint); font-size: 12px; margin: 6px 0; }
.response-limit { color: var(--danger); }
</style>
