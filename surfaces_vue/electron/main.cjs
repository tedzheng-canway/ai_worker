const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { serve } = require('./static-server.cjs');
const { resolveLogo } = require('./logo.cjs');
const { createTray, showWindow } = require('./tray.cjs');

let backend, frontend, window, tray, connection, stopping = false;
async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
function stop() {
  stopping = true;
  if (tray && !tray.isDestroyed()) tray.destroy();
  frontend?.close();
  backend?.kill();
}
async function start() {
  const port = await freePort();
  const token = randomBytes(32).toString('hex');
  connection = { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}`, token };
  const root = path.resolve(__dirname, '../..');
  const executable = path.join(app.isPackaged ? process.resourcesPath : path.join(root, 'dist'), 'coworker-server', 'coworker-server.exe');
  if (!fs.existsSync(executable)) throw new Error(`后端文件不存在，请先运行 build-desktop.cmd：\n${executable}`);
  const logs = app.getPath('logs');
  fs.mkdirSync(logs, { recursive: true });
  const logPath = path.join(logs, 'coworker.log');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const log = fs.openSync(logPath, 'w');
  try {
    backend = spawn(executable, ['--host', '127.0.0.1', '--port', String(port)], {
      cwd: app.getPath('userData'), windowsHide: true, stdio: ['ignore', log, log],
      env: { ...process.env, COWORKER_API_TOKEN: token, COWORKER_EXIT_WITH_PARENT: '1', COWORKER_PARENT_PID: String(process.pid) },
    });
  } finally { fs.closeSync(log); }
  let failure;
  backend.on('error', error => { failure = error; });
  backend.on('exit', (code, signal) => {
    failure = new Error(`后端已退出 (${code ?? signal})，日志：${logPath}`);
    if (window && !stopping) { dialog.showErrorBox('AIWorker 后端已停止', failure.message); app.quit(); }
  });
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline && !stopping) {
    if (failure) throw failure;
    try {
      // An authenticated route also proves that this is our backend, not a port competitor.
      const response = await fetch(`${connection.http}/v1/settings`, {
        headers: { 'X-OpenWorker-Token': token }, signal: AbortSignal.timeout(1500),
      });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (stopping) return;
  if (!ready) throw new Error(`后端启动超时，请查看日志：${logPath}`);
  const local = await serve(path.join(__dirname, '../dist'));
  frontend = local.server;
  window = new BrowserWindow({ width: 1380, height: 900, minWidth: 900, minHeight: 600, show: false,
    title: 'AIWorker', icon: resolveLogo(path.join(__dirname, '../assets')),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.removeMenu();
  tray = createTray({ app, window, icon: resolveLogo(path.join(__dirname, '../assets')),
    Tray, Menu, nativeImage, isQuitting: () => stopping });
  ipcMain.on('coworker:connection', (event) => {
    if (event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.startsWith(local.url + '/')) event.returnValue = connection;
    else event.returnValue = {};
  });
  const external = url => { if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {}); };
  window.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== local.url) { event.preventDefault(); external(url); } });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  await window.loadURL(local.url);
  if (failure) throw failure;
  window.show();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showWindow(window));
  app.on('activate', () => showWindow(window));
  app.on('before-quit', stop);
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(start).catch(error => { stop(); dialog.showErrorBox('AIWorker 启动失败', error.message); app.quit(); });
}
