import { post } from './api-request.js';
export const setOnboarded = value => post('/v1/settings/onboarded', { value });
export const setAutoApproveShadow = auto_approve_shadow => post('/v1/settings/auto-approve-shadow', { auto_approve_shadow });
