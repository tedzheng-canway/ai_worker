import { language } from './preferences.js';
import en from './locales/en.json';
// Only application-owned UI strings are passed here. Conversation and file content stay intact.
export function t(text) {
  if (text == null) return '';
  const source = String(text);
  if (language.value !== 'en') return source;
  if (en[source] !== undefined) return en[source];
  const trimmed = source.trim();
  return en[trimmed] !== undefined ? source.replace(trimmed, en[trimmed]) : source;
}
