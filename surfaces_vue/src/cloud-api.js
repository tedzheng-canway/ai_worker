import { request } from './api.js';
import { write } from './api-request.js';
export const getCloudStatus = () => request('/v1/cloud/status');
export const cloudLogin = () => write('/v1/cloud/login');
export const cloudLogout = () => write('/v1/cloud/logout');
