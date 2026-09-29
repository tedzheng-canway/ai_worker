<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { connectConnector } from '../api';
import { checked, cloudLogin, getCloudStatus, connectManaged, connectMcpBacked } from '../p2api';
const props=defineProps({connector:Object}); const emit=defineEmits(['change']);
const fields=ref({}), cloud=ref(null), busy=ref(false), waiting=ref(''), error=ref(''), access=ref('read');
let timer, until=0, disposed=false;
watch(()=>props.connector.name,()=>{fields.value=Object.fromEntries((props.connector.fields || []).map(f=>[f.key,f.default || '']));error.value='';waiting.value='';},{immediate:true});
watch(()=>JSON.stringify([props.connector.connected,props.connector.account,props.connector.accounts,props.connector.workspaces,props.connector.portals,props.connector.installations]),()=>{if(props.connector.connected&&waiting.value==='connection')waiting.value='';});
async function act(fn, phase='') {busy.value=true;error.value='';try{checked(await fn());waiting.value=phase;until=Date.now()+120000;emit('change');}catch(e){error.value=e.message;}finally{busy.value=false;}}
async function poll(){try{cloud.value=await getCloudStatus();if(waiting.value==='cloud'&&cloud.value.signed_in)waiting.value='';if(waiting.value){emit('change');if(Date.now()>until){waiting.value='';error.value='尚未完成授权，请刷新状态或重试。';}}}catch(e){if(waiting.value)error.value=e.message;}if(!disposed)timer=setTimeout(poll,waiting.value?1500:5000);}
onMounted(poll);onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);});
</script>
<template><div class="connector-auth"><p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="waiting" role="status">正在等待浏览器完成{{ waiting === 'cloud' ? '云账号登录' : '服务授权' }}… <button type="button" class="btn" @click="emit('change')">刷新状态</button></p><fieldset :disabled="busy || connector.available===false">
<div v-if="connector.mcp" class="actions"><button type="button" class="btn primary" @click="act(()=>connectMcpBacked(connector.name),'connection')">浏览器授权 {{ connector.title }}</button></div>
<template v-else-if="connector.managed && !connector.managed_paused"><label v-if="connector.name==='hubspot'">授权范围<select v-model="access"><option value="read">只读</option><option value="write">读写</option></select></label><button type="button" v-if="cloud?.signed_in" class="btn primary" @click="act(()=>connectManaged(connector.name,connector.name==='hubspot'?access:undefined),'connection')">授权 / 添加 {{ connector.title }} 账号</button><button type="button" v-else class="btn primary" @click="act(cloudLogin,'cloud')">登录云账号以连接 {{ connector.title }}</button></template>
<p v-if="connector.managed_paused" class="muted">此服务的托管授权暂未开放，可使用下方手动配置。</p>
<form v-if="connector.fields?.length || (!connector.managed && !connector.mcp)" class="form-card" @submit.prevent="act(()=>connectConnector(connector.name,fields))"><p v-for="(instruction,i) in connector.instructions || []" :key="i">{{ instruction }}</p><label v-for="field in connector.fields || []" :key="field.key">{{ field.label }}<input v-model="fields[field.key]" :type="field.secret?'password':'text'" :required="field.required" :placeholder="field.placeholder" autocomplete="off" /><small>{{ field.help }}</small></label><button class="btn primary">连接 {{ connector.title }}</button></form>
</fieldset></div></template>
