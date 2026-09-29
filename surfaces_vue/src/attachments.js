const MAX_BYTES = 10 * 1024 * 1024;
const TEXT_RE = /\.(txt|md|markdown|csv|tsv|json|ya?ml|log|ini|toml|py|js|ts|tsx|jsx|rs|go|java|c|h|cpp|sh|html?|css|sql|xml)$/i;
export const readFile = (file, asText = false) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
  if (asText) reader.readAsText(file); else reader.readAsDataURL(file);
});
export function attachmentKind(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('text/') || TEXT_RE.test(file.name)) return 'text';
  return null;
}
export async function prepareAttachment(file, pdf = {}, inspect) {
  const kind = attachmentKind(file);
  if (!kind) throw new Error(`${file.name}：不支持此文件类型，请使用图片、PDF 或文本文件`);
  const limit = kind === 'pdf' ? Math.min(MAX_BYTES, (Number(pdf.max_mb) || 10) * 1024 * 1024) : MAX_BYTES;
  if (file.size > limit) throw new Error(`${file.name}：超过 ${limit / 1024 / 1024} MB 大小限制`);
  const payload = await readFile(file, kind === 'text');
  if (kind === 'pdf') {
    const info = await inspect(payload);
    if (!info.ok) throw new Error(info.error || `${file.name}：无法检查 PDF`);
    if (info.pages > (Number(pdf.max_pages) || 20)) throw new Error(`${file.name}：${info.pages} 页，超过 ${pdf.max_pages || 20} 页限制`);
  }
  return { kind, name: file.name, mime: file.type || (kind === 'pdf' ? 'application/pdf' : 'text/plain'), ...(kind === 'text' ? { text: payload } : { data_url: payload }) };
}
export const historyAttachments = (content) => Array.isArray(content) ? content.filter((part) => part.type === 'image_url' && /^data:image\//i.test(part.image_url?.url || '')).map((part) => ({ kind: 'image', name: '历史图片', data_url: part.image_url.url })) : [];
