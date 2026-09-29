export const checked = (result) => { if (result?.ok === false || result?.error) throw new Error(result.error || '操作失败'); return result; };
