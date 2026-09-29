import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { createTray, showWindow } = createRequire(import.meta.url)('../electron/tray.cjs');

function fixture() {
  const calls = [];
  let quitting = false;
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isMinimized: () => true,
    restore: () => calls.push('restore'), show: () => calls.push('show'),
    focus: () => calls.push('focus'), hide: () => calls.push('hide'),
  });
  class Tray extends EventEmitter {
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed = true; }
  }
  const tray = createTray({
    app: { quit: () => { quitting = true; calls.push('quit'); } },
    window, icon: 'logo.png', Tray,
    Menu: { buildFromTemplate: value => value },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: () => ({}) }) },
    isQuitting: () => quitting,
  });
  const close = () => window.emit('close', { preventDefault: () => calls.push('prevent-close') });
  return { calls, window, tray, close };
}

test('closing the window hides it; tray clicks and menu restore and focus it', () => {
  const { calls, tray, close } = fixture();
  close();
  assert.deepEqual(calls.splice(0), ['prevent-close', 'hide']);
  assert.equal(tray.tooltip, 'AIWorker');
  for (const open of [() => tray.emit('click'), () => tray.emit('double-click'), () => tray.menu[0].click()]) {
    open();
    assert.deepEqual(calls.splice(0), ['restore', 'show', 'focus']);
  }
});

test('explicit tray exit allows the window to close instead of hiding again', () => {
  const { calls, tray, close } = fixture();
  tray.menu[2].click();
  close();
  assert.deepEqual(calls, ['quit']);
});

test('an unavailable tray never traps a closing window', () => {
  const { calls, tray, close } = fixture();
  tray.destroy();
  close();
  assert.deepEqual(calls, []);
});

test('second launch shows a hidden window and ignores an absent or destroyed window', () => {
  const { window, calls } = fixture();
  window.isMinimized = () => false;
  showWindow(window);
  assert.deepEqual(calls.splice(0), ['show', 'focus']);
  showWindow(undefined);
  window.isDestroyed = () => true;
  showWindow(window);
  assert.deepEqual(calls, []);
});
