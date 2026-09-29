import { request } from './api.js';
import { enc, write } from './api-request.js';
export const getSessionConnections = (id,persona) => request(`/v1/sessions/${enc(id)}/connections?${new URLSearchParams({persona:persona || ''})}`);
export const setSessionConnection = (id,connector,enabled,clear=false) => write(`/v1/sessions/${enc(id)}/connections`,{connector,enabled,...(clear?{clear:true}:{})});
export const getUnattended = async id => !!(await request(`/v1/sessions/${enc(id)}/unattended`)).unattended;
export const setUnattended = (id,unattended) => write(`/v1/sessions/${enc(id)}/unattended`,{unattended});
