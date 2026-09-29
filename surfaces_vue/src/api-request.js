import { request } from './api.js';

export const enc = encodeURIComponent;
export const write = (path, body = {}, method = 'POST') => request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const post = (path, body) => write(path, body);
