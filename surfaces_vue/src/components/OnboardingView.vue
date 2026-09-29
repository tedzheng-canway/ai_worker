<script setup>
import { t } from '../i18n';
import { ref } from 'vue';
import ProviderManager from './ProviderManager.vue';
import ConnectorsView from './ConnectorsView.vue';
import { setOnboarded } from '../settings-api.js';
import { checked } from '../api-result.js';
const emit = defineEmits(['done', 'change']);
const step = ref(0), ready = ref(false), busy = ref(false), error = ref('');
// Completing or deferring setup both dismiss future automatic prompts.
// Save first so a rejected write leaves the dialog open for retry.
async function finish() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    checked(await setOnboarded(true));
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<template><div class="modal-backdrop"><section class="onboarding-dialog" role="dialog" aria-modal="true" :aria-label="t(&quot;首次使用引导&quot;)"><header class="page-head"><div><h1>{{ t("开始使用 AIWorker") }}</h1><p>{{ step===0 ? t("1 / 2 · 连接模型") : t("2 / 2 · 配置连接器（可跳过）") }}</p></div><button class="btn" :disabled="busy" @click="finish">{{ t("稍后设置") }}</button></header><p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><div class="onboarding-body"><ProviderManager onboarding v-show="step===0" @ready="ready=$event" @change="emit('change')"/><ConnectorsView v-if="step===1" /></div><footer class="actions"><template v-if="step===0"><button class="btn primary" :disabled="!ready" @click="step=1">{{ t("下一步") }}</button><p v-if="!ready">{{ t("请先连接账号或测试模型服务。") }}</p></template><template v-else><button class="btn" :disabled="busy" @click="step=0">{{ t("上一步") }}</button><button class="btn" :disabled="busy" @click="finish">{{ t("跳过连接器并开始") }}</button><button class="btn primary" :disabled="busy" @click="finish">{{ t("完成设置") }}</button></template></footer></section></div></template>
