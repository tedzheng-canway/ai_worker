<script setup>
import { t } from '../i18n';
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { getConnectors, disconnectConnector, updateConnectorTools } from '../api';
import { checked } from '../api-result.js';
import { getCloudStatus, cloudLogin, cloudLogout } from '../cloud-api.js';
import ConnectorAuth from './ConnectorAuth.vue';
import ConnectorAccounts from './ConnectorAccounts.vue';
import McpManager from './McpManager.vue';
const props=defineProps({ initialConnector:String });
const connectors=ref([]),selected=ref(props.initialConnector || ''),cloud=ref(null),error=ref(''),busy=ref(false),showAuth=ref(false),cloudWaiting=ref(false);
const detail=computed(()=>connectors.value.find(c=>c.name===selected.value));
let timer,disposed=false,loginUntil=0;
async function refresh(){const results=await Promise.allSettled([getConnectors(),getCloudStatus()]);if(results[0].status==='fulfilled')connectors.value=results[0].value;else error.value=results[0].reason.message;if(results[1].status==='fulfilled'){cloud.value=results[1].value;if(cloud.value.signed_in)cloudWaiting.value=false;}else error.value=results[1].reason.message;if(cloudWaiting.value&&Date.now()>loginUntil){cloudWaiting.value=false;error.value='登录尚未完成，请重试。';}}
async function poll(){await refresh();if(!disposed)timer=setTimeout(poll,cloudWaiting.value?1500:5000);}
async function act(fn){busy.value=true;error.value='';try{checked(await fn());await refresh();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function open(item){selected.value=item.name;showAuth.value=false;error.value='';}
watch(()=>props.initialConnector,value=>{if(value)selected.value=value;});
onMounted(poll);onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);});
</script>
<template><section class="page-view wide-page"><p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><div class="card cloud-account"><strong>{{ t("云账号") }}</strong><span>{{ cloud?.signed_in ? cloud.account || t("已登录") : cloudWaiting ? t("等待浏览器完成登录…") : t("未登录") }}</span><button v-if="!cloud?.signed_in" class="btn" :disabled="busy || cloudWaiting" @click="act(async()=>{const r=checked(await cloudLogin());cloudWaiting=true;loginUntil=Date.now()+120000;return r;})">{{ t("登录云账号") }}</button><button v-else class="btn" :disabled="busy" @click="act(cloudLogout)">{{ t("退出云账号") }}</button><button class="btn" @click="refresh">{{ t("刷新状态") }}</button></div>
<template v-if="!detail"><div class="page-head"><div><h1>{{ t("连接器") }}</h1><p>{{ t("管理外部服务账号及工具；会话内可单独启停。") }}</p></div></div><div class="connector-grid"><button v-for="item in connectors" :key="item.name" class="card connector-card" @click="open(item)"><span class="connector-logo" :style="{background:item.brand_color || '#6b7280'}">{{ item.title?.slice(0,1) }}</span><div><strong>{{ item.title }}</strong><small>{{ item.connected ? item.account || t("已连接") : item.blurb || t("尚未连接") }}</small></div><span :class="['connection-state',{on:item.connected}]">{{ item.connected?t("已连接"):t("设置") }}</span></button></div><McpManager /></template>
<template v-else><button class="back-link" @click="selected=''">{{ t("‹ 返回连接器") }}</button><div class="page-head"><div><h1>{{ detail.title }}</h1><p>{{ detail.account || detail.blurb }}</p></div><button v-if="detail.connected && detail.auth!=='none'" class="btn danger" :disabled="busy" @click="act(()=>disconnectConnector(detail.name))">{{ t("断开连接") }}</button></div><p>{{ detail.about }}</p><ul v-if="detail.access?.length"><li v-for="line in detail.access" :key="line">{{ line }}</li></ul><button v-if="detail.connected" class="btn" @click="showAuth=!showAuth">{{ t("添加账号 / 重新授权") }}</button><ConnectorAuth v-if="!detail.connected || showAuth" :key="detail.name" :connector="detail" @change="refresh" /><ConnectorAccounts v-if="detail.connected" :key="detail.name" :connector="detail" @change="refresh" /><section class="card settings-card"><h2>{{ t("可用工具") }}</h2><label v-for="tool in detail.tools || []" :key="tool.name" class="toggle-row"><span><strong>{{ tool.label || tool.name }}</strong><small>{{ tool.description }} · {{ tool.requires_approval ? t("需要审批") : t("按会话权限执行") }}</small></span><input type="checkbox" :checked="tool.enabled" :disabled="busy || !detail.connected" @change="act(()=>updateConnectorTools(detail.name,{[tool.name]:!tool.enabled}))" /></label></section></template>
</section></template>
