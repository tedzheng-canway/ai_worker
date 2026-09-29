<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { t } from '../i18n';
import { getProviders, getSettings, removeProvider, setProvider } from '../api';
import { providerAuthStatus, providerSignin, providerSignout, verifyProvider } from '../p3api';
import { checked } from '../p2api';
import { providerDefaults, providerPayload, visibleProviderFields } from '../p3';
import { KEY_HELP, providerRank } from '../providers/catalog';
import ProviderMark from './ProviderMark.vue';
import ProviderField from './ProviderField.vue';
import ProviderModels from './ProviderModels.vue';
defineProps({ onboarding: Boolean });
const emit = defineEmits(['change', 'ready']);
const providers=ref([]), settings=ref(null), selected=ref(''), fields=ref({}), dirty=ref({});
const busy=ref(false), error=ref(''), message=ref(''), waiting=ref(false), auth=ref(null), endpointOpen=ref(false), verified=ref(''), savedField=ref('');
const tested=ref(new Set());
let timer, returnTimer, fieldTimer, disposed=false, deadline=0;
const info=computed(()=>providers.value.find(p=>p.name===selected.value));
const ordered=computed(()=>[...providers.value].sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'}) || providerRank(a.name)-providerRank(b.name)));
const values=computed(()=>fields.value[selected.value] || {});
const visibleFields=computed(()=>info.value ? visibleProviderFields(info.value,values.value) : []);
const choice=computed(()=>visibleFields.value.find(f=>f.choices?.length));
const method=computed(()=>choice.value?.choices.find(c=>c.value===values.value[choice.value.key]));
const endpoint=computed(()=>info.value?.fields?.some(f=>f.secret) ? visibleFields.value.find(f=>f.key==='base_url') : null);
const commonFields=computed(()=>visibleFields.value.filter(f=>!f.choices?.length&&!f.show_when&&f!==endpoint.value));
const methodFields=computed(()=>visibleFields.value.filter(f=>f.show_when&&!f.choices?.length&&f!==endpoint.value));
const testKey=computed(()=>commonFields.value.find(f=>f.secret&&f.required)?.key || commonFields.value[0]?.key);
const credentialed=computed(()=>!!info.value?.configured&&!!info.value?.needs_key);
const saved=computed(()=>(credentialed.value&&!dirty.value[selected.value]) || verified.value===selected.value);
const savedLabel=computed(()=>info.value?.needs_key?t('✓ 已验证并保存'):t('✓ 已检测'));
const canTest=computed(()=>visibleFields.value.every(f=>!f.required||!!values.value[f.key]?.trim()||(f.secret&&credentialed.value)));
const reopenUrl=computed(()=>{try{const url=new URL(auth.value?.authorize_url);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}});
function modelProvider(id){return providers.value.find(p=>id?.startsWith(p.name+':')) || providers.value.find(p=>p.name==='openai');}
function ready(){const p=modelProvider(settings.value?.model);return settings.value?.model_ready!==false && (p?(p.auth==='oauth'?p.signed_in:p.needs_key?p.configured:tested.value.has(p.name)):settings.value?.model_ready===true);}
function status(p){if(p.auth==='oauth')return p.signed_in?t('✓ 已登录'):t('使用套餐登录');if(p.needs_key)return p.configured?t('✓ 已连接'):t('未设置');return tested.value.has(p.name)?t('✓ 运行中'):t('无需密钥');}
function lastUsed(p){if(!p.last_used_at)return '';return t('最近使用：')+new Date(p.last_used_at*1000).toLocaleString();}
async function load(){const [rows,config]=await Promise.all([getProviders(),getSettings()]);if(disposed)return;checked(rows);checked(config);providers.value=rows;settings.value=config;for(const p of rows)fields.value[p.name]??=providerDefaults(p);emit('ready',ready());}
async function act(fn){if(busy.value)return;busy.value=true;error.value='';message.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function refresh(){await load();if(!disposed)emit('change');}
function back(){clearTimeout(returnTimer);selected.value='';error.value='';message.value='';}
function open(p){clearTimeout(returnTimer);selected.value=p.name;endpointOpen.value=false;verified.value='';savedField.value='';error.value='';message.value='';if(p.authorizing&&!waiting.value){waiting.value=true;deadline=Date.now()+300000;poll();}}
function edit(key,value){clearTimeout(returnTimer);values.value[key]=value;dirty.value[selected.value]=true;verified.value='';savedField.value='';message.value='';error.value='';}
async function testAndSave(){const p=info.value;if(!p||!canTest.value)return;clearTimeout(returnTimer);await act(async()=>{const payload=providerPayload(p,fields.value[p.name]);checked(await verifyProvider(p.name,payload));checked(await setProvider(p.name,payload));tested.value.add(p.name);await refresh();fields.value[p.name]=providerDefaults(providers.value.find(row=>row.name===p.name)||p);dirty.value[p.name]=false;verified.value=p.name;message.value='连接测试通过，已保存';if(!disposed&&selected.value===p.name)returnTimer=setTimeout(()=>{if(selected.value===p.name)back();},900);});}
async function saveField(f,event){
  const p=info.value;
  // Let Test save the complete form instead of racing it with a blur save.
  if(!p?.configured||f.secret||busy.value||event?.relatedTarget?.closest('[data-provider-test]'))return;
  if((p.fields||[]).some(field=>field.secret&&values.value[field.key]?.trim()))return;
  if(choice.value&&values.value[choice.value.key]!==providerDefaults(p)[choice.value.key])return;
  const value=String(values.value[f.key]||'').trim();if(value===String(p.values?.[f.key]||'').trim())return;
  clearTimeout(returnTimer);
  await act(async()=>{checked(await setProvider(p.name,{[f.key]:value}));await refresh();savedField.value=f.key;clearTimeout(fieldTimer);fieldTimer=setTimeout(()=>savedField.value='',1800);});
}
async function forget(){const p=info.value;if(!p||!confirm(t('移除密钥…')+' '+p.title+'?'))return;await act(async()=>{checked(await removeProvider(p.name));tested.value.delete(p.name);await refresh();fields.value[p.name]=providerDefaults(providers.value.find(row=>row.name===p.name)||p);dirty.value[p.name]=false;back();});}
async function poll(){clearTimeout(timer);if(!waiting.value||disposed)return;try{auth.value=checked(await providerAuthStatus());if(disposed)return;if(auth.value.signed_in){waiting.value=false;await refresh();message.value='账号登录成功';return;}if(auth.value.last_error||Date.now()>deadline){waiting.value=false;error.value=auth.value.last_error||'登录等待超时，请重试';return;}}catch(e){error.value=e.message;waiting.value=false;}if(!disposed&&waiting.value)timer=setTimeout(poll,1500);}
async function signin(){await act(async()=>{checked(await providerSignin());waiting.value=true;deadline=Date.now()+300000;await poll();});}
async function signout(){await act(async()=>{checked(await providerSignout());waiting.value=false;clearTimeout(timer);auth.value=null;await refresh();});}
async function copyCommand(){try{await navigator.clipboard.writeText(method.value.command);message.value='已复制命令';}catch{error.value='复制失败，请手动复制';}}
onMounted(()=>act(load));
onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);clearTimeout(returnTimer);clearTimeout(fieldTimer);});
</script>
<template>
  <div class="provider-manager" :class="{ onboarding }">
    <div v-if="!settings" class="provider-loading"><p>{{ error ? t(error) : t('加载中…') }}</p><button v-if="error" class="btn" @click="act(load)">{{ t('重试') }}</button></div>
    <template v-else-if="!info">
      <div class="provider-gallery">
        <button v-for="p in ordered" :key="p.name" type="button" class="provider-card" :data-testid="`provider-${p.name}`" @click="open(p)">
          <ProviderMark :name="p.name" :title="p.title" /><span class="provider-card-copy"><strong>{{ p.title }}</strong><small :class="{connected:p.signed_in || (p.configured&&p.needs_key) || tested.has(p.name)}">{{ status(p) }}</small><small v-if="!onboarding&&p.last_used_at" class="provider-last-used" :title="lastUsed(p)">{{ lastUsed(p) }}</small></span><span class="provider-chevron">›</span>
        </button>
      </div>
      <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p>
      <ProviderModels v-if="!onboarding" :settings="settings" :providers="providers" :busy="busy" @change="act(refresh)" @error="error=$event" />
    </template>
    <template v-else>
      <button type="button" class="provider-back" @click="back">{{ t('‹ 全部提供商') }}</button>
      <header class="provider-detail-head"><ProviderMark :name="info.name" :title="info.title" large /><div><h2>{{ info.title }}</h2><small class="provider-status" :class="{connected:info.signed_in || (info.configured&&info.needs_key) || tested.has(info.name)}">{{ status(info) }}</small></div></header>
      <p v-if="info.blurb" class="provider-help">{{ info.blurb }}</p>
      <fieldset :disabled="busy" class="settings-fields provider-detail">
        <div v-if="info.auth==='oauth'" class="provider-oauth">
          <div v-if="info.signed_in" class="provider-account"><span>{{ info.account || t('✓ 已登录') }}</span><button class="btn" @click="signout">{{ t('退出账号') }}</button></div>
          <button v-else class="btn primary" :disabled="waiting||info.name!=='openai-codex'" @click="signin">{{ waiting?t('等待浏览器…'):t('使用 ChatGPT 登录') }}</button>
          <p v-if="waiting" class="provider-help">{{ t('在浏览器窗口中完成登录。') }} <a v-if="reopenUrl" :href="reopenUrl" target="_blank" rel="noopener noreferrer">{{ t('重新打开登录页') }}</a></p>
          <p v-if="info.signed_in" class="provider-help">{{ t('用量计入套餐的滚动额度，而非按 token 计费。登录信息仅保存在本机。') }}</p>
          <button class="provider-back" @click="act(refresh)">{{ t('刷新状态') }}</button>
        </div>
        <form v-else @submit.prevent="testAndSave">
          <ProviderField v-for="f in commonFields" :key="f.key" :field="f" :model-value="values[f.key]" :credentialed="credentialed" :saved="savedField===f.key || (saved&&!choice&&f.key===testKey)" :saved-label="savedField===f.key?t('✓ 已保存'):savedLabel" :testable="!choice&&f.key===testKey" :testing="busy" :can-test="canTest" :test-label="info.needs_key?t('测试'):t('检测')" @update:model-value="edit(f.key,$event)" @blur="saveField(f,$event)" @test="testAndSave" />
          <div v-if="choice" class="provider-methods"><div class="provider-field-label">{{ choice.label }}</div><div class="provider-method-track" role="radiogroup" :aria-label="choice.label"><button v-for="c in choice.choices" :key="c.value" type="button" role="radio" :aria-checked="values[choice.key]===c.value" @click="edit(choice.key,c.value)">{{ c.label || c.value }} <span v-if="c.tag">{{ c.tag }}</span></button></div>
            <div class="provider-method-panel"><p v-if="method?.desc" class="provider-help">{{ method.desc }}</p><button v-if="method?.command" type="button" class="provider-command" :title="t('复制命令')" @click="copyCommand"><code>{{ method.command }}</code><span>⧉</span></button>
              <ProviderField v-for="f in methodFields" :key="f.key" :field="f" :model-value="values[f.key]" :credentialed="credentialed" :saved="savedField===f.key" @update:model-value="edit(f.key,$event)" @blur="saveField(f,$event)" />
              <div class="provider-method-footer"><small :class="{connected:saved}">{{ saved?savedLabel:t('运行一次只读检查，然后保存。') }}</small><button class="btn primary" data-provider-test :disabled="!canTest">{{ busy?'…':t('测试并保存') }}</button></div>
            </div>
          </div>
          <button v-if="!choice&&!commonFields.length" class="btn provider-test" data-provider-test :disabled="!canTest">{{ busy?'…':info.needs_key?t('测试'):t('检测') }}</button>
          <p v-if="info.needs_key&&KEY_HELP[info.name]" class="provider-help provider-key-help">{{ t('还没有密钥？') }} <a :href="KEY_HELP[info.name].url" target="_blank" rel="noopener noreferrer">{{ KEY_HELP[info.name].label }} ↗</a> {{ t('—— 大约一分钟。') }}</p>
          <p v-if="info.name==='ollama'" class="provider-help provider-key-help">{{ t('无需 API 密钥 —— Ollama 在本机运行模型。') }} <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">{{ t('安装 Ollama') }} ↗</a></p>
          <div v-if="endpoint" class="provider-endpoint"><button v-if="!endpointOpen" type="button" class="provider-back" @click="endpointOpen=true">{{ t('自定义端点') }} ⌄</button><ProviderField v-else :field="endpoint" :model-value="values[endpoint.key]" :saved="savedField===endpoint.key" @update:model-value="edit(endpoint.key,$event)" @blur="saveField(endpoint,$event)" /></div>
        </form>
      </fieldset>
      <div class="provider-feedback"><p v-if="error || info.last_error" class="error-text" role="alert">{{ t(error || info.last_error) }}</p><p v-else-if="message" role="status">{{ t(message) }}</p></div>
      <button v-if="credentialed&&info.auth!=='oauth'&&!onboarding" class="provider-remove" :disabled="busy" @click="forget">{{ t('移除密钥…') }}</button>
      <p v-if="info.name==='openai'&&settings.source==='env'" class="provider-help">{{ t('此服务器的环境中已通过 OPENAI_API_KEY 设置密钥。在此添加其他密钥可覆盖本机设置。') }}</p>
      <ProviderModels v-if="!onboarding" :settings="settings" :providers="providers" :provider="info" :busy="busy" @change="act(refresh)" @error="error=$event" />
    </template>
  </div>
</template>
