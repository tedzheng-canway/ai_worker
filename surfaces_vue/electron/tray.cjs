function showWindow(window) {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function createTray({ app, window, icon, Tray, Menu, nativeImage, isQuitting }) {
  const image = nativeImage.createFromPath(icon);
  if (image.isEmpty()) throw new Error(`无法加载托盘图标：${icon}`);
  const tray = new Tray(image.resize({ width: 32, height: 32 }));
  tray.setToolTip('AIWorker');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 AIWorker', click: () => showWindow(window) },
    { type: 'separator' },
    { label: '退出 AIWorker', click: () => app.quit() },
  ]));
  tray.on('click', () => showWindow(window));
  tray.on('double-click', () => showWindow(window));
  window.on('close', event => {
    // Explicit quit must reach before-quit and release the backend normally.
    if (isQuitting() || tray.isDestroyed()) return;
    event.preventDefault();
    window.hide();
  });
  return tray;
}

module.exports = { createTray, showWindow };
