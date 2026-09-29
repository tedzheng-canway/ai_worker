import { fetchBlob } from './api.js';
import { enc } from './api-request.js';
export const boardAttachment = (id,name) => fetchBlob(`/v1/sessions/${enc(id)}/board/attachment?${new URLSearchParams({name})}`);
