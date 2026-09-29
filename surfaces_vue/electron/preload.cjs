const { contextBridge, ipcRenderer } = require('electron');
const config = ipcRenderer.sendSync('coworker:connection');
contextBridge.exposeInMainWorld('__COWORKER_HTTP__', config.http);
contextBridge.exposeInMainWorld('__COWORKER_WS__', config.ws);
contextBridge.exposeInMainWorld('__COWORKER_API_TOKEN__', config.token);
