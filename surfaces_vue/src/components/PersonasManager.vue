<script setup>
import { t } from '../i18n';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchBlob, getPersonas, getSessions, pickFolderViaServer, updatePersona } from '../api';
import { deletePersona, exportPersona, getGallery, getGalleryDetail, getPersonaDetail, installPersona, setPersonaConnection } from '../p3api';
import { checked, cloudLogin, getCloudStatus } from '../p2api';
import { personaConnections } from '../p3';
import MarkdownView from './MarkdownView.vue';
const emit = defineEmits(['change', 'connectors', 'use']);
const personas = ref([]), detail = ref(null), consent = ref([]), busy = ref(false), error = ref(''), message = ref('');
const git = ref(''), gallery = ref(false), cards = ref([]), galleryDetail = ref(null), cloud = ref(null), query = ref(''), source = ref('all'), media = ref([]);
let generation = 0, disposed = false;
const visibleCards = computed(() => cards.value.filter(p => (source.value === 'all' || (p.publisher === 'OpenWorker' ? 'openworker' : 'team') === source.value) && `${p.name} ${p.tagline} ${p.description}`.toLowerCase().includes(query.value.toLowerCase())));
const connections = computed(() => detail.value ? personaConnections(detail.value) : []);
async function act(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn(); } catch(e) { error.value = e.message; } finally { busy.value = false; } }
async function reload() { personas.value = await getPersonas(); }
function clearMedia() { media.value.forEach(url => URL.revokeObjectURL(url)); media.value = []; }
async function open(id) {
  const version = ++generation;
  clearMedia(); detail.value = null;
  const next = checked(await getPersonaDetail(id));
  if (disposed || generation !== version) return;
  detail.value = next;
  for (const name of next.media || []) {
    try { const blob = await fetchBlob(`/v1/personas/${encodeURIComponent(id)}/media/${encodeURIComponent(name)}`); if (disposed || generation !== version) return; media.value.push(URL.createObjectURL(blob)); }
    catch { message.value = '部分截图加载失败'; }
  }
}
async function changed() { await reload(); emit('change'); if (detail.value) await open(detail.value.id); }
async function patch(p, body) {
  if (body.enabled === false) { const count = (await getSessions()).filter(s => s.agent === p.id && !s.archived).length; if (count && !confirm(t("停用后将归档")+" "+count+" "+t("个会话，继续？"))) return; }
  checked(await updatePersona(p.id, body)); consent.value = consent.value.filter(c => c.id !== p.id); await changed();
}
async function install(body) { const result = checked(await installPersona(body)); consent.value = result.consent || []; gallery.value = false; galleryDetail.value = null; git.value = ''; await changed(); message.value = '安装完成，请确认能力后启用。'; }
async function folder() { const dir = await pickFolderViaServer(); if (dir) await install({ dir }); }
async function zip(event) { const file = event.target.files?.[0]; if (!file) return; await act(async () => { const bytes = new Uint8Array(await file.arrayBuffer()); let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768)); await install({ zip_b64: btoa(bin), filename: file.name }); }); event.target.value = ''; }
async function loadGallery() { cloud.value = checked(await getCloudStatus()); if (cloud.value.signed_in) cards.value = checked(await getGallery()).personas || []; }
async function exportBundle() { const dir = await pickFolderViaServer(); if (dir) message.value = checked(await exportPersona(detail.value.id, dir)).path || '已导出'; }
async function remove() { if (!confirm(t("删除智能体")+" "+detail.value.name+"?")) return; checked(await deletePersona(detail.value.id)); detail.value = null; clearMedia(); await changed(); }
onMounted(() => act(reload));
onBeforeUnmount(() => { disposed = true; generation++; clearMedia(); });
</script>
<template>
  <div class="persona-manager">
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><p v-if="message" role="status">{{ t(message) }}</p>
    <fieldset :disabled="busy" class="settings-fields">
      <template v-if="gallery">
        <div class="actions"><button class="btn" @click="gallery = false">{{ t("返回智能体") }}</button><button class="btn" @click="act(loadGallery)">{{ t("刷新图库") }}</button></div>
        <template v-if="!cloud?.signed_in"><p>{{ t("登录云账号后浏览智能体图库。") }}</p><button class="btn primary" @click="act(async()=>{ checked(await cloudLogin()); message=t(&quot;请在浏览器完成登录后刷新图库&quot;); })">{{ t("登录云账号") }}</button></template>
        <template v-else-if="galleryDetail"><button class="btn" @click="galleryDetail=null">{{ t("返回图库") }}</button><h2>{{ galleryDetail.card?.name }}</h2><MarkdownView :text="galleryDetail.card?.pitch_markdown || galleryDetail.card?.description || ''"/><section v-if="galleryDetail.capabilities" class="card settings-card capabilities"><h3>{{ t('工具与默认能力') }}</h3><p>{{ t('工具') }}: {{ (galleryDetail.capabilities.tools || []).join(' · ') }}</p><p>{{ t('风险：') }}{{ (galleryDetail.capabilities.risk || []).join(' · ') }}</p><p>{{ t('连接器：') }}{{ galleryDetail.capabilities.connectors ? t('启用') : t('停用') }}</p><p>MCP: {{ (galleryDetail.capabilities.mcp || []).join(' · ') }}</p><p>{{ galleryDetail.capabilities.messaging ? t('允许消息收发') : t('不使用消息收发') }}</p><p>{{ t('推荐模式：') }}{{ galleryDetail.capabilities.recommended_mode }}</p><p>{{ t('推荐模型：') }}{{ (galleryDetail.capabilities.recommended_models || []).join(' · ') }}</p></section><p v-for="r in galleryDetail.recommends || []" :key="r.ref">{{ r.ref }} · {{ r.reason }}</p><button class="btn primary" @click="act(()=>install({gallery_slug:galleryDetail.card.slug}))">{{ t("安装此智能体") }}</button></template>
        <template v-else><label>{{ t("搜索图库") }}<input v-model="query" /></label><label>{{ t("发布者") }}<select v-model="source"><option value="all">{{ t("全部") }}</option><option value="openworker">OpenWorker</option><option value="team">{{ t("团队") }}</option></select></label><div class="card-list"><article v-for="p in visibleCards" :key="p.slug" class="card list-card"><div><strong>{{ p.name }}</strong><small>{{ p.publisher }} · {{ p.tagline }}</small></div><button class="btn" @click="act(async()=>galleryDetail=checked(await getGalleryDetail(p.slug)))">{{ t("查看详情") }}</button></article></div><p v-if="!visibleCards.length">{{ t("没有匹配的智能体。") }}</p></template>
      </template>
      <template v-else-if="detail">
        <button class="btn" @click="detail=null; clearMedia()">{{ t("返回智能体") }}</button><h1>{{ detail.name }}</h1><p>{{ detail.tagline }}</p><MarkdownView :text="detail.description || ''"/><div class="persona-media"><img v-for="(url,index) in media" :key="url" :src="url" :alt="`${detail.name} ${index+1}`" /></div>
        <div class="card settings-card"><label><input type="checkbox" :checked="detail.enabled" :disabled="detail.default" @change="act(()=>patch(detail,{enabled:$event.target.checked}))" />{{ t("启用智能体") }}</label><label><input type="checkbox" :checked="detail.surfaced" :disabled="!detail.enabled || detail.default" @change="act(()=>patch(detail,{surfaced:$event.target.checked}))" />{{ t("在选择器中显示") }}</label><div class="actions"><button class="btn" :disabled="detail.default || !detail.enabled" @click="act(()=>patch(detail,{default:true}))">{{ detail.default ? t("默认智能体") : t("设为默认智能体") }}</button><button class="btn primary" :disabled="!detail.enabled" @click="emit('use',detail.id)">{{ t("使用此智能体") }}</button></div></div>
        <div class="card settings-card"><h2>{{ t("默认连接器") }}</h2><article v-for="r in connections" :key="`${r.kind}:${r.ref}`" class="list-card"><div><strong>{{ r.ref }} · {{ r.kind }}</strong><small>{{ r.reason }} · {{ r.connected ? t("已连接") : t("未连接") }}</small></div><label v-if="r.default"><input type="checkbox" :checked="r.default.enabled" :disabled="!r.connected" @change="act(async()=>{ checked(await setPersonaConnection(detail.id,r.ref,$event.target.checked)); await open(detail.id); })" />{{ t("新会话默认启用") }}</label><button v-if="!r.connected" class="btn" @click="emit('connectors',r.kind==='connector'?r.ref:'')">{{ t("配置连接") }}</button></article><p>{{ t("默认设置仅影响新会话。") }}</p></div>
        <details class="card settings-card"><summary>{{ t("工具与默认能力") }}</summary><p>{{ (detail.tools || []).join(' · ') }}</p><p>{{ t("推荐模型：") }}{{ (detail.recommended_models || []).join(' · ') }}</p><p>{{ t("默认模式：") }}{{ detail.default_permission_mode }}</p><p>{{ detail.requires_folder ? t("需要项目目录") : t("使用临时工作区") }}</p></details><div v-if="!detail.builtin" class="actions"><button class="btn" @click="act(exportBundle)">{{ t("导出 ZIP") }}</button><button class="btn danger" @click="act(remove)">{{ t("删除智能体") }}</button></div>
      </template>
      <template v-else>
        <div v-for="c in consent" :key="c.id" class="card settings-card persona-consent"><h2>{{ t("授权确认 · ") }}{{ c.name }}</h2><p>{{ c.description }}</p><p>{{ t("来源：") }}{{ c.source }} · {{ c.version }}</p><p v-if="c.replaces">{{ t("替换版本：") }}{{ c.replaces.version }} · {{ c.replaces.capabilities_grew ? t("能力范围有所增加") : t("能力范围未增加") }}</p><p>{{ t("工具：") }}{{ (c.tools || []).join(' · ') }}</p><p>{{ t("风险：") }}{{ (c.risk || []).join(' · ') }}</p><p>{{ t("连接器：") }}{{ c.connectors === 'all' ? t("全部") : (c.connectors || []).join(' · ') }}</p><p>MCP：{{ (c.mcp || []).join(' · ') }} · {{ c.messaging ? t("允许消息收发") : t("不使用消息收发") }}</p><p>{{ t("推荐模式：") }}{{ c.recommended_mode }}</p><button class="btn primary" @click="act(()=>patch(c,{enabled:true}))">{{ t("确认能力并启用") }}</button><button class="btn" @click="consent=consent.filter(row=>row.id!==c.id)">{{ t("暂不启用") }}</button></div>
        <div class="card-list"><article v-for="p in personas" :key="p.id" class="card list-card"><div><strong>{{ p.name }}</strong><small>{{ p.tagline || p.id }}{{ p.ships===false ? t(" · 未随发行版发布") : '' }}</small></div><span v-if="p.default">{{ t("默认智能体") }}</span><label v-else class="switch"><input type="checkbox" :checked="p.enabled" :aria-label="p.name" @change="act(()=>patch(p,{enabled:$event.target.checked}))" /><span></span></label><button class="btn" @click="act(()=>open(p.id))">{{ t("查看详情") }}</button></article></div>
        <div class="card settings-card"><h2>{{ t("安装智能体") }}</h2><div class="actions"><button class="btn" @click="act(folder)">{{ t("从目录安装") }}</button><label class="btn">{{ t("从 ZIP 安装") }}<input type="file" accept=".zip" :aria-label="t(&quot;智能体 ZIP&quot;)" @change="zip" /></label><button class="btn" @click="gallery=true; act(loadGallery)">{{ t("浏览图库") }}</button></div><form class="inline-form" @submit.prevent="act(()=>install({git_url:git.trim()}))"><input v-model="git" :aria-label="t(&quot;Git 地址&quot;)" :placeholder="t(&quot;Git 仓库地址&quot;)" required /><button class="btn primary">{{ t("从 Git 安装") }}</button></form></div>
      </template>
    </fieldset>
  </div>
</template>
