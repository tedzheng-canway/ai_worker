"""Exercise the frozen server with disposable state, without user credentials."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

with tempfile.TemporaryDirectory(prefix='coworker-smoke-') as state:
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    token = secrets.token_hex(32)
    env = {**os.environ, 'COWORKER_STATE_DIR': state, 'COWORKER_API_TOKEN': token,
           'COWORKER_EXIT_WITH_PARENT': '1', 'COWORKER_PARENT_PID': str(os.getpid())}
    with open(Path(state) / 'server.log', 'w+') as log:
        proc = subprocess.Popen([str(Path(sys.argv[1]).resolve()), '--host', '127.0.0.1', '--port', str(port)],
                                cwd=state, env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    raise RuntimeError(f'Frozen backend exited: {proc.returncode}')
                try:
                    req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/settings', headers={'X-OpenWorker-Token': token})
                    with urllib.request.urlopen(req, timeout=2) as response:
                        json.load(response)
                    print('Frozen backend smoke test passed')
                    break
                except (OSError, ValueError):
                    time.sleep(.25)
            else:
                raise RuntimeError('Frozen backend startup timed out')
        except Exception:
            log.seek(0)
            print(log.read(), file=sys.stderr)
            raise
        finally:
            if proc.poll() is None:
                proc.terminate()
            proc.wait(timeout=15)
