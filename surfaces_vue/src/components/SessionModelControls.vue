<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../i18n';
import { checked } from '../api-result.js';
import { getSessionModelSettings, saveSessionModelSettings } from '../providers-api.js';
const props = defineProps({ sessionId: String, model: String, running: Boolean, ready: Boolean, snapshot: Object });
const data = ref(null), error = ref(''), busy = ref(false);
let version = 0;
const controls = computed(() => data.value?.controls || {});
watch(() => [props.sessionId, props.model, props.ready, props.running, props.snapshot], async () => {
  const request = ++version; data.value = null; error.value = '';
  if (!props.ready || !props.model) return;
  if (props.snapshot?.model === props.model) { data.value = props.snapshot; return; }
  try { const result = checked(await getSessionModelSettings(props.sessionId, props.model)); if (request === version && (!result.model || result.model === props.model)) data.value = result; }
  catch (e) { if (request === version) error.value = e.message; }
}, { immediate: true });
async function save(key, event) {
  const value = event.target.value;
  const id = props.sessionId, model = props.model;
  busy.value = true; error.value = '';
  try {
    const result = checked(await saveSessionModelSettings(id, { [key]: value === '' ? null : key === 'thinking' ? value === 'true' : value }));
    if (id === props.sessionId && model === props.model) data.value = result;
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="session-model-controls" data-testid="session-model-controls">
    <label v-if="controls.thinking?.support === 'supported'">{{ t('思考') }}
      <select :value="data.thinking == null ? '' : String(data.thinking)" :disabled="running || busy" :aria-label="t('会话思考开关')" @change="save('thinking',$event)">
        <option value="">{{ t('模型默认') }} ({{ controls.thinking.default ? t('开启') : t('关闭') }})</option><option value="true">{{ t('开启') }}</option><option value="false">{{ t('关闭') }}</option>
      </select>
    </label>
    <label v-if="controls.reasoning?.support === 'supported'">{{ t('推理强度') }}
      <select :value="data.reasoning_effort || ''" :disabled="running || busy" :aria-label="t('会话推理强度')" @change="save('reasoning_effort',$event)">
        <option value="">{{ t('模型默认') }} ({{ controls.reasoning.default }})</option><option v-for="level in controls.reasoning.levels" :key="level" :value="level">{{ level }}</option>
      </select>
    </label>
    <small v-if="error" class="error-text" role="alert">{{ t(error) }}</small>
  </div>
</template>
