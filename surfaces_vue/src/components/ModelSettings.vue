<script setup>
import { ref, watch } from 'vue';
import { t } from '../i18n';
import { checked } from '../api-result.js';
import { getModelConfig, saveModelConfig, resetModelConfig } from '../providers-api.js';
const props = defineProps({ model: String });
const emit = defineEmits(['close', 'saved']);
const data = ref(null), draft = ref({}), changed = ref(new Set()), busy = ref(false), error = ref('');
const fields = [
  ['context_size', '上下文大小', 1, null, 1], ['max_output_tokens', '输出上限', 1, null, 1],
  ['temperature', '温度', 0, 2, 0.01], ['top_p', 'Top P', 0.01, 1, 0.01], ['compaction_threshold_pct', '压缩阈值（0.10–0.95）', 0.10, 0.95, 0.01],
];
const sourceLabel = source => t(({user:'用户设置',recommended:'推荐值',provider:'提供商默认',machine:'本机建议',server:'服务设置'})[source] || '提供商默认');
let version = 0;
watch(() => props.model, async model => {
  const request = ++version; data.value = null; changed.value = new Set(); error.value = '';
  try {
    const result = checked(await getModelConfig(model)); if (request !== version) return;
    data.value = result; draft.value = Object.fromEntries(Object.entries(result).filter(([,v]) => v && typeof v === 'object' && 'value' in v).map(([key,v]) => [key, v.from === 'user' ? v.value : '']));
  } catch (e) { if (request === version) error.value = e.message; }
}, {immediate:true});
function edit(key, value) { draft.value[key] = value; changed.value.add(key); }
async function save(reset = false) {
  if (busy.value) return; busy.value = true; error.value = '';
  try {
    const values = Object.fromEntries([...changed.value].map(key => [key, draft.value[key] === '' ? null : draft.value[key]]));
    checked(await (reset ? resetModelConfig(props.model) : saveModelConfig(props.model, values)));
    emit('saved'); emit('close');
  } catch (e) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="dialog-overlay" @click.self="emit('close')"><form class="search-dialog form-card model-settings-dialog" role="dialog" :aria-label="t('模型设置')" @submit.prevent="save()">
    <h3>{{ t('模型设置') }}</h3><p class="muted">{{ model }}</p>
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
    <fieldset v-if="data" :disabled="busy" class="model-settings-fields">
      <label v-for="[key,label,min,max,step] in fields" :key="key">{{ t(label) }}
        <input type="number" :min="min" :max="max" :step="step" :value="draft[key]" :placeholder="data[key]?.value == null ? t('提供商默认') : String(data[key].value)" :aria-label="t(label)" @input="edit(key,$event.target.value === '' ? '' : Number($event.target.value))" />
        <small>{{ sourceLabel(data[key]?.from) }}{{ data[key]?.value == null ? '' : ': ' + data[key].value }}</small>
      </label>
      <label v-if="data.controls?.thinking?.support === 'supported'">{{ t('思考') }}<select :value="draft.thinking === '' ? '' : String(draft.thinking)" :aria-label="t('思考')" @change="edit('thinking',$event.target.value === '' ? '' : $event.target.value === 'true')"><option value="">{{ t('模型默认') }}</option><option value="true">{{ t('开启') }}</option><option value="false">{{ t('关闭') }}</option></select><small>{{ sourceLabel(data.thinking?.from) }}</small></label>
      <label v-if="data.controls?.reasoning?.support === 'supported'">{{ t('推理强度') }}<select :value="draft.reasoning_effort" :aria-label="t('推理强度')" @change="edit('reasoning_effort',$event.target.value)"><option value="">{{ t('模型默认') }} ({{ data.controls.reasoning.default }})</option><option v-for="level in data.controls.reasoning.levels" :key="level" :value="level">{{ level }}</option></select><small>{{ sourceLabel(data.reasoning_effort?.from) }}</small></label>
      <p v-if="data.runtime_context_size && data.context_size?.value !== data.runtime_context_size" class="muted">{{ t('实际上下文窗口：') }}{{ data.runtime_context_size }}</p>
      <label class="model-default-setting"><input type="checkbox" :checked="!!draft.default" :disabled="data.default?.value === true" @change="edit('default',$event.target.checked)" />{{ t('设为默认') }}</label>
      <p v-if="data.recommendation" class="muted">{{ data.recommendation.notes }} <a :href="data.recommendation.source" target="_blank" rel="noopener noreferrer">{{ t('推荐值来源') }} ↗</a></p>
      <p v-if="data.price" class="muted">{{ t('参考价格（USD / 百万 tokens）：') }}{{ data.price.input }} / {{ data.price.output }}<br />{{ data.price.source }}<br />{{ t('转售价格随实际路由变化，此处为快照参考值。') }}</p>
      <p v-else class="muted">{{ t('价格未知') }}</p>
      <p class="muted">{{ t('留空恢复推荐值或提供商默认。新设置从下一轮生效。') }}</p>
      <div class="actions"><button type="submit" class="btn primary">{{ t('保存') }}</button><button type="button" class="btn" @click="save(true)">{{ t('重置模型设置') }}</button></div>
    </fieldset>
    <p v-else-if="!error">{{ t('加载中…') }}</p><button type="button" class="btn" @click="emit('close')">{{ t('关闭') }}</button>
  </form></div>
</template>
