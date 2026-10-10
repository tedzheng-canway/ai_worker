<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '../i18n';
import { checked } from '../api-result.js';
import { openrouterStatus, openrouterSignin, openrouterComplete, openrouterCancel, openrouterDisconnect } from '../providers-api.js';
const emit = defineEmits(['change']);
const status = ref({}), busy = ref(false), code = ref(''), error = ref('');
let timer, disposed = false;
async function refresh() {
  clearTimeout(timer);
  try {
    const next = checked(await openrouterStatus()); if (disposed) return;
    const changed = !!status.value.connected !== !!next.connected;
    status.value = next; error.value = next.error || error.value;
    if (changed) emit('change');
    if (next.authorizing) timer = setTimeout(refresh,1500);
  } catch (e) { if (!disposed) error.value = e.message; }
}
async function act(fn) {
  if (busy.value) return; busy.value = true; error.value = '';
  try { status.value = checked(await fn()); error.value = status.value.error || ''; emit('change'); if (!error.value) await refresh(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
function start(manual) {
  code.value = '';
  // Open from the click gesture so browsers do not block the authorization window.
  const popup = window.open('about:blank','_blank');
  if (popup) popup.opener = null;
  act(async () => {
    try {
      const result = checked(await openrouterSignin(manual));
      if (result.authorize_url && new URL(result.authorize_url).origin === 'https://openrouter.ai') {
        if (popup) popup.location.href = result.authorize_url;
      } else popup?.close();
      return result;
    } catch (e) { popup?.close(); throw e; }
  });
}
onMounted(refresh);
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>
<template>
  <div class="provider-oauth" data-testid="openrouter-account">
    <p class="provider-help">{{ t('使用 OpenRouter 账号余额。账号登录与 API Key 接入分别保存，可独立退出或移除。') }}</p>
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
    <button v-if="status.connected" type="button" class="btn" :disabled="busy" @click="act(openrouterDisconnect)">{{ t('退出 OpenRouter 账号') }}</button>
    <template v-else-if="!status.authorizing"><button type="button" class="btn primary" :disabled="busy" @click="start(false)">{{ t('使用 OpenRouter 登录') }}</button><button type="button" class="btn" :disabled="busy" @click="start(true)">{{ t('使用手动授权码') }}</button></template>
    <template v-else>
      <p>{{ t('在浏览器窗口中完成登录。') }} <a v-if="status.authorize_url" :href="status.authorize_url" target="_blank" rel="noopener noreferrer">{{ t('重新打开登录页') }}</a></p>
      <form class="question-text" @submit.prevent="act(() => openrouterComplete(code,status.attempt_id))"><input v-model="code" :aria-label="t('OpenRouter 授权码')" :placeholder="t('手动授权码')" /><button class="btn primary" :disabled="busy || !code.trim()">{{ t('完成登录') }}</button></form>
      <button type="button" class="btn" :disabled="busy" @click="act(openrouterCancel)">{{ t('取消登录') }}</button>
    </template>
    <button type="button" class="provider-back" @click="refresh">{{ t('刷新状态') }}</button>
  </div>
</template>
