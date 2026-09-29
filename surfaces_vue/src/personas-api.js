import { request } from './api.js';
import { enc, post } from './api-request.js';
export const getPersonaDetail = id => request(`/v1/personas/${enc(id)}`);
export const installPersona = body => post('/v1/personas/install', body);
export const deletePersona = id => request(`/v1/personas/${enc(id)}`, { method: 'DELETE' });
export const exportPersona = (id, dir) => post(`/v1/personas/${enc(id)}/export`, { dir });
export const setPersonaConnection = (id, connector, enabled) => post(`/v1/personas/${enc(id)}/connections`, { connector, enabled });
export const getGallery = () => request('/v1/cloud/gallery');
export const getGalleryDetail = slug => request(`/v1/cloud/gallery/${enc(slug)}`);
