<script setup>
import { t } from '../i18n';
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { getConnectors } from '../api';
import { getRecentChannels } from '../inbox-api.js';
import { slackChannels } from '../connectors-api.js';
import { checked } from '../api-result.js';
const props=defineProps({modelValue:String,label:{type:String,default:'频道地址'}});const emit=defineEmits(['update:modelValue']);
const recent=ref([]),teams=ref([]),hits=ref([]),error=ref(''),open=ref(false);let timer,version=0;
const options=computed(()=>[...recent.value.map(c=>({address:c.channel,name:c.name || c.channel})),...hits.value].filter((c,i,all)=>all.findIndex(x=>x.address===c.address)===i).filter(c=>!props.modelValue || `${c.name} ${c.address}`.toLowerCase().includes(props.modelValue.replace(/^#/,'').toLowerCase())).slice(0,15));
watch(()=>props.modelValue,value=>{clearTimeout(timer);const id=++version;hits.value=[];if(!value||/[:/]/.test(value))return;timer=setTimeout(async()=>{try{const rows=await Promise.all(teams.value.map(async t=>checked(await slackChannels(t,value.replace(/^#/,''))).channels?.map(c=>({address:t==='default'?`slack:${c.id}`:`slack:${t}/${c.id}`,name:`${c.name}${c.is_member?'':'（需邀请机器人）'}`})) || []));if(id===version)hits.value=rows.flat();}catch(e){if(id===version)error.value=e.message;}},300);});
onMounted(async()=>{try{recent.value=await getRecentChannels();const slack=(await getConnectors()).find(c=>c.name==='slack'&&c.connected);teams.value=slack?(slack.mode==='relay'?(slack.workspaces || []).map(w=>w.team_id):['default']):[];}catch(e){error.value=e.message;}});
onBeforeUnmount(()=>{version++;clearTimeout(timer);});
</script>
<template><div class="channel-picker"><label>{{ label }}<input :value="modelValue" :placeholder="t(&quot;搜索频道或输入 slack:T123/C123&quot;)" @input="emit('update:modelValue',$event.target.value);open=true" @focus="open=true" @keydown.esc="open=false" /></label><div v-if="open && options.length" class="channel-options"><button v-for="row in options" :key="row.address" type="button" @click="emit('update:modelValue',row.address);open=false">{{ row.name }} <small>{{ row.address }}</small></button></div><small v-if="error" class="error-text">{{ t(error) }}</small></div></template>
