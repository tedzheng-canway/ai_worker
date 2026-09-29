import { request } from './api.js';
import { enc, write } from './api-request.js';
export const getTeamChat = id => request(`/v1/teams/${enc(id)}/chat`);
export const postTeamChat = (id,text) => write(`/v1/teams/${enc(id)}/chat`,{text});
