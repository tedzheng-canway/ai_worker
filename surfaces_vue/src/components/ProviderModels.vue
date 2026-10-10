<script setup>
import { computed, ref, watch } from 'vue';
import { t } from '../i18n';
import { addModel, removeModel, setDefaultModel } from '../api';
import { checked } from '../api-result.js';
import ModelSettings from './ModelSettings.vue';
const props = defineProps({ settings: Object, providers: Array, provider: Object, busy: Boolean });
const emit = defineEmits(['change', 'error']);
const draft=ref(''), family=ref(''), saving=ref(false);
const editing=ref('');
const families=computed(()=>props.provider?.name==='bedrock'?['claude','other']:props.provider?.name==='vertex'?['gemini','claude','openweight']:[]);
watch(()=>props.provider?.name,()=>{draft.value='';family.value=families.value[0] || '';},{immediate:true});
const owner=id=>props.providers.find(p=>id.startsWith(p.name+':'))?.name || 'openai';
const full=id=>props.provider.name==='openai' || props.providers.some(p=>id.startsWith(p.name+':')) ? id : `${props.provider.name}:${id}`;
const rows=computed(()=>props.provider ? [...new Set([...(props.provider.suggested_models || []).map(full),...(props.settings.models || []).filter(id=>owner(id)===props.provider.name)])] : props.settings.models || []);
const group=id=>props.providers.find(p=>p.name===owner(id))?.kind==='local' || /^(ollama|llamacpp|vllm):/.test(id) ? t('本地模型') : t('云端模型');
const groupedRows=computed(()=>[...rows.value].sort((a,b)=>group(a).localeCompare(group(b))));
function summary(id) {
  const saved=props.settings.model_config?.[id] || {}, parts=[];
  const context=props.settings.model_context_windows?.[id] || saved.context_size;
  if(context)parts.push(t('上下文')+' '+context);
  if(saved.max_output_tokens)parts.push(t('输出上限')+' '+saved.max_output_tokens);
  if(typeof saved.thinking==='boolean')parts.push(t('思考')+' '+t(saved.thinking?'开启':'关闭'));
  if(saved.reasoning_effort)parts.push(t('推理强度')+' '+saved.reasoning_effort);
  if(saved.compaction_threshold_pct)parts.push(t('压缩阈值')+' '+Math.round(saved.compaction_threshold_pct*100)+'%');
  return parts.join(' · ') || t('推荐值或提供商默认');
}
const connected=computed(()=>!props.provider || (props.provider.auth==='oauth' ? props.provider.signed_in : props.provider.configured));
const isDefault=id=>id===(props.settings.model || props.settings.default_model);
const included=id=>(props.settings.models || []).includes(id);
const tag=id=>props.providers.find(p=>p.name===owner(id))?.title || owner(id);
async function act(fn){if(saving.value)return false;saving.value=true;emit('error','');try{await fn();emit('change');return true;}catch(e){emit('error',e.message);return false;}finally{saving.value=false;}}
async function tick(id,event){const on=event.target.checked;const ok=await act(async()=>{checked(await (on?addModel(id):removeModel(id)));});if(!ok)event.target.checked=included(id);}
function makeDefault(id){return act(async()=>{if(!included(id))checked(await addModel(id));checked(await setDefaultModel(id));});}
function add(){let id=draft.value.trim();if(!id)return;if(families.value.length&&!props.providers.some(p=>id.startsWith(p.name+':'))&&!families.value.some(f=>id.startsWith(f+'/')))id=family.value+'/'+id;return act(async()=>{checked(await addModel(full(id)));draft.value='';});}
</script>
<template>
  <section class="provider-models" :data-testid="provider ? 'provider-models' : 'composer-picker'">
    <h3>{{ provider ? (connected ? t('模型') : t('内置模型')) : t('输入框的模型选择器') }}</h3>
    <p class="provider-help">{{ provider ? (connected ? t('已勾选的模型会显示在输入框的选择器中；黑色徽标表示新会话的默认模型。') : t('此提供方精选的 agent 模型 —— 在上方添加密钥即可启用。')) : t('新建会话时可选的模型；黑色徽标表示默认模型。可从上方提供方卡片添加更多模型。') }}</p>
    <fieldset class="settings-fields" :disabled="busy || saving"><div class="provider-model-list">
      <template v-for="(id,index) in groupedRows" :key="id">
      <h4 v-if="!provider && (index===0 || group(groupedRows[index-1])!==group(id))" class="model-group-label">{{ group(id) }}</h4>
      <div class="provider-model-row" :class="{ off: !included(id), preview: !connected }">
        <label v-if="connected" class="provider-model-main"><input type="checkbox" :checked="included(id)" :disabled="isDefault(id)" :title="isDefault(id)?t('默认模型始终显示 —— 请先将其他模型设为默认'):t('从选择器中移除')" @change="tick(id,$event)" /><span :title="id">{{ settings.model_labels?.[id] || (provider ? id.replace(provider.name+':','') : id) }}</span></label>
        <span v-else :title="id">{{ settings.model_labels?.[id] || id.replace(provider.name+':','') }}</span>
        <small v-if="!provider">{{ tag(id) }}</small><template v-if="connected"><span v-if="isDefault(id)" class="provider-default">{{ t('默认') }}</span><button v-else type="button" class="provider-make-default" @click="makeDefault(id)">{{ t('设为默认') }}</button></template>
        <small class="provider-model-summary">{{ summary(id) }}</small><button type="button" class="btn" :aria-label="t('模型设置')+' '+id" @click="editing=id">{{ t('设置') }}</button>
      </div>
      </template>
      <p v-if="!rows.length" class="provider-help">{{ t('尚无可选模型，请先连接提供商。') }}</p>
      <form v-if="provider && connected" class="provider-model-add" @submit.prevent="add"><select v-if="families.length" v-model="family" :aria-label="t('模型系列')"><option v-for="value in families" :key="value" :value="value">{{ value }}</option></select><input v-model="draft" :placeholder="t('添加其他模型…')" :aria-label="t('添加模型')" autocomplete="off" spellcheck="false" /><button class="btn primary" :disabled="!draft.trim()">{{ t('添加') }}</button></form>
    </div></fieldset>
    <ModelSettings v-if="editing" :model="editing" @close="editing=''" @saved="emit('change')" />
  </section>
</template>
