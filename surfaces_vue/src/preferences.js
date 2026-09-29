import { computed, ref } from 'vue';
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key,value) => { try { localStorage.setItem(key,value); } catch {} };
export const themePreference = ref(['light','dark'].includes(read('openworker-theme')) ? read('openworker-theme') : 'auto');
export const languagePreference = ref(['en','zh'].includes(read('openworker.lang')) ? read('openworker.lang') : 'auto');
const systemDark = ref(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches || false);
const systemLanguage = ref(globalThis.navigator?.language || 'en');
export const dark = computed(() => themePreference.value === 'dark' || (themePreference.value === 'auto' && systemDark.value));
export const language = computed(() => languagePreference.value === 'auto' ? (systemLanguage.value.toLowerCase().startsWith('zh') ? 'zh' : 'en') : languagePreference.value);
function apply() { document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'; document.documentElement.lang = language.value === 'zh' ? 'zh-CN' : 'en'; }
export function setTheme(value) { themePreference.value = typeof value === 'boolean' ? (value ? 'dark' : 'light') : value; write('openworker-theme',themePreference.value); apply(); }
export function setLanguage(value) { languagePreference.value = value; write('openworker.lang',value); apply(); }
export function initPreferences() {
  apply();
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', event => { systemDark.value=event.matches; apply(); });
  window.addEventListener('languagechange', () => { systemLanguage.value=navigator.language; apply(); });
  window.addEventListener('storage', event => { if(event.key==='openworker-theme') { themePreference.value=read(event.key)||'auto'; apply(); } if(event.key==='openworker.lang') { languagePreference.value=read(event.key)||'auto'; apply(); } });
}
