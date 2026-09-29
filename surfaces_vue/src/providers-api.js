import { request } from './api.js';
import { post } from './api-request.js';
export const verifyProvider = (name, fields) => post('/v1/providers/verify', { name, fields });
export const providerSignin = () => post('/v1/providers/openai-codex/signin', {});
export const providerSignout = () => post('/v1/providers/openai-codex/signout', {});
export const providerAuthStatus = () => request('/v1/providers/openai-codex/status');
