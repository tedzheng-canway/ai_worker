<script setup>
import { t } from '../i18n';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { addModel, getProviders, getSettings, removeModel, removeProvider, setDefaultModel, setProvider } from '../api';
import { providerAuthStatus, providerSignin, providerSignout, verifyProvider } from '../p3api';
import { checked } from '../p2api';
import { providerDefaults, providerPayload, visibleProviderFields } from '../p3';
const emit = defineEmits(['change', 'ready']);
const providers = ref([]), fields = ref({}), settings = ref({}), modelDraft = ref(''), busy = ref(false), error = ref(''), message = ref(''), waiting = ref(false), auth = ref(null);
const tested = new Set();
function modelProvider(id) { return providers.value.find(p=>id?.startsWith(p.name+':')) || providers.value.find(p=>p.name==='openai'); }
function ready() { const p=modelProvider(settings.value.model); return settings.value.model_ready !== false && (p ? (p.auth==='oauth' ? p.signed_in : p.needs_key ? p.configured : tested.has(p.name)) : settings.value.model_ready===true); }
let timer, disposed = false, deadline = 0;
async function load() { const [rows, config] = await Promise.all([getProviders(), getSettings()]); if (disposed) return; providers.value = rows; settings.value = config; for (const p of rows) fields.value[p.name] ??= providerDefaults(p); emit('ready', ready()); }
async function act(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn(); } catch(e) { error.value = e.message; } finally { busy.value = false; } }
async function refresh() { await load(); emit('change'); }
async function save(p, test) { const payload = providerPayload(p, fields.value[p.name]); if (test) { checked(await verifyProvider(p.name, payload)); tested.add(p.name); } const result = checked(await setProvider(p.name, payload)); await refresh(); fields.value[p.name] = providerDefaults(providers.value.find(row=>row.name===p.name) || p);  message.value = test ? t('连接测试通过，已保存') : t('提供商已保存'); if (result.recommended_model) message.value += ` · ${result.recommended_model}`; }
async function forget(p) { if (!confirm(t("移除配置")+" · "+p.title+"?")) return; checked(await removeProvider(p.name)); tested.delete(p.name); await refresh(); fields.value[p.name]=providerDefaults(providers.value.find(row=>row.name===p.name) || p); }
async function poll() { clearTimeout(timer); if (!waiting.value || disposed) return; try { auth.value = checked(await providerAuthStatus()); if (disposed) return; if (auth.value.signed_in) { waiting.value = false; await refresh(); message.value = '账号登录成功'; return; } if (auth.value.last_error || Date.now() > deadline) { waiting.value = false; error.value = auth.value.last_error || '登录等待超时，请重试'; return; } } catch(e) { error.value = e.message; waiting.value = false; } if (!disposed && waiting.value) timer = setTimeout(poll, 1500); }
async function signin() { checked(await providerSignin()); waiting.value = true; deadline = Date.now() + 120000; clearTimeout(timer); await poll(); }
async function signout() { checked(await providerSignout()); waiting.value = false; clearTimeout(timer); auth.value = null; await refresh(); }
async function remove(m) { if(!confirm(t('从模型列表移除')+' '+m+'?'))return; checked(await removeModel(m)); await refresh(); }
async function add(value) { if (!value.trim()) return; checked(await addModel(value.trim())); modelDraft.value = ''; await refresh(); }
onMounted(() => act(load)); onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>
<template>
  <div class="provider-manager">
    <p v-if="error" class="error-text" role="alert">{{ t(error) }}</p><p v-if="message" role="status">{{ t(message) }}</p><p v-if="waiting" role="status">{{ t("请在浏览器完成账号登录… ") }}<button class="btn" @click="act(poll)">{{ t("刷新登录状态") }}</button></p>
    <fieldset :disabled="busy" class="settings-fields">
      <article v-for="p in providers" :key="p.name" class="card settings-card provider-card">
        <div class="setting-title"><div><h2>{{ p.title }}</h2><small>{{ p.auth==='oauth' ? (p.signed_in ? t("已登录") : t("未登录")) : p.configured ? t("已配置") : t("未配置") }} · {{ p.account || p.blurb }}</small></div><button v-if="p.configured && p.auth!=='oauth'" class="btn danger" @click="act(()=>forget(p))">{{ t("移除配置") }}</button></div><p v-if="p.last_error" class="error-text">{{ p.last_error }}</p>
        <div v-if="p.auth==='oauth'" class="actions"><button v-if="!p.signed_in" class="btn primary" :disabled="waiting || p.name!=='openai-codex'" @click="act(signin)">{{ t("登录账号") }}</button><button v-else class="btn" @click="act(signout)">{{ t("退出账号") }}</button><button class="btn" @click="act(refresh)">{{ t("刷新状态") }}</button></div>
        <form v-else @submit.prevent="act(()=>save(p,true))">
          <label v-for="f in visibleProviderFields(p,fields[p.name] || {})" :key="f.key">{{ f.label || f.key }}
            <select v-if="f.choices?.length" v-model="fields[p.name][f.key]"><option v-for="c in f.choices" :key="c.value" :value="c.value">{{ c.label || c.value }}</option></select>
            <input v-else v-model="fields[p.name][f.key]" :type="f.secret?'password':'text'" :required="f.required && !(p.configured && f.secret)" :placeholder="f.secret && p.configured ? t(&quot;已保存；留空保留&quot;) : f.placeholder" autocomplete="off" />
            <small>{{ f.help }}</small><template v-for="c in f.choices || []" :key="c.value"><small v-if="c.value===fields[p.name][f.key]">{{ c.desc }}<code v-if="c.command">{{ c.command }}</code></small></template>
          </label><div class="actions"><button class="btn primary">{{ t("测试并保存") }}</button><button class="btn" type="button" @click="act(()=>save(p,false))">{{ t("保存提供商") }}</button></div>
        </form>
        <div v-if="p.recommended_model || p.suggested_models?.length" class="actions"><span>{{ t("推荐模型") }}</span><button v-for="m in [...new Set([p.recommended_model,...(p.suggested_models || [])].filter(Boolean))]" :key="m" class="btn" @click="act(()=>add(p.name==='openai' || providers.some(row=>m.startsWith(row.name+':'))?m:`${p.name}:${m}`))">{{ m }}</button></div>
      </article>
      <div class="card settings-card"><h2>{{ t("可用模型") }}</h2><label v-for="m in settings.models || []" :key="m" class="model-row"><input type="radio" name="default-model" :checked="m===(settings.model || settings.default_model)" :disabled="modelProvider(m) && !(modelProvider(m).auth==='oauth' ? modelProvider(m).signed_in : modelProvider(m).configured)" @change="act(async()=>{ checked(await setDefaultModel(m)); await refresh(); })" /><span>{{ settings.model_labels?.[m] || m }}<small>{{ m }}{{ m===(settings.model || settings.default_model) && settings.model_ready===false ? t(" · 未连接提供商") : '' }}</small></span><button class="text-danger" @click="act(()=>remove(m))">{{ t("移除") }}</button></label><form class="inline-form" @submit.prevent="act(()=>add(modelDraft))"><input v-model="modelDraft" :placeholder="t(&quot;提供商:模型ID&quot;)" required /><button class="btn primary">{{ t("添加模型") }}</button></form></div>
    </fieldset>
  </div>
</template>
