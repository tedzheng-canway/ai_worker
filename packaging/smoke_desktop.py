"""Integration check: packaged Electron -> preload -> HTTP/WS -> backend cleanup."""
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

with tempfile.TemporaryDirectory(prefix='aiworker-desktop-') as temporary:
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        debug_port = listener.getsockname()[1]
    endpoint = f'http://127.0.0.1:{debug_port}'
    env = {**os.environ, 'COWORKER_STATE_DIR': str(Path(temporary) / 'state'),
           'APPDATA': temporary}
    env.pop('ELECTRON_RUN_AS_NODE', None)
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    proc = subprocess.Popen([str(Path(sys.argv[1]).resolve()), f'--remote-debugging-port={debug_port}',
                             f'--user-data-dir={temporary}/electron'], env=env, startupinfo=startup)
    try:
        deadline = time.monotonic() + 100
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(f'Electron exited: {proc.returncode}')
            try:
                with urllib.request.urlopen(endpoint + '/json/version', timeout=1):
                    break
            except OSError:
                time.sleep(.25)
        else:
            raise RuntimeError('Electron debugging endpoint timed out')
        with sync_playwright() as playwright:
            browser = playwright.chromium.connect_over_cdp(endpoint)
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else context.wait_for_event('page', timeout=90000)
            page.wait_for_function('document.querySelector("#app")?.children.length > 0', timeout=90000)
            result = page.evaluate('''async () => {
                if (typeof require !== 'undefined') throw Error('Node exposed to renderer');
                const http = globalThis.__COWORKER_HTTP__;
                const token = globalThis.__COWORKER_API_TOKEN__;
                if (!http || !token) throw Error('Preload connection missing');
                const response = await fetch(http + '/v1/settings', {headers: {'X-OpenWorker-Token': token}});
                if (!response.ok) throw Error('API status ' + response.status);
                await new Promise((resolve, reject) => {
                    const ws = new WebSocket(globalThis.__COWORKER_WS__ + '/ws/events', ['openworker', token]);
                    const timer = setTimeout(() => { ws.close(); reject(Error('WebSocket timed out')); }, 10000);
                    ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(); };
                    ws.onerror = () => { clearTimeout(timer); reject(Error('WebSocket failed')); };
                });
                return {http, title: document.title};
            }''')
            print('Packaged desktop HTTP/WebSocket passed:', result)
            screenshot = Path('build/desktop/smoke.png')
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot))
            page.evaluate('window.close()')
            proc.wait(timeout=20)
            time.sleep(1)
            try:
                with urllib.request.urlopen(result['http'] + '/v1/health', timeout=1):
                    raise AssertionError('Backend survived desktop exit')
            except OSError:
                pass
            print('Desktop exit cleaned up backend')
    finally:
        if proc.poll() is None:
            proc.terminate()
        proc.wait(timeout=15)
