import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { serve } = createRequire(import.meta.url)('../electron/static-server.cjs');

test('desktop static server serves assets and rejects traversal and writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aiworker-web-'));
  await writeFile(path.join(dir, 'index.html'), '<h1>AIWorker</h1>');
  await writeFile(path.join(dir, 'app.js'), 'export default 1;');
  const { server, url } = await serve(dir);
  try {
    assert.equal(await (await fetch(url)).text(), '<h1>AIWorker</h1>');
    assert.equal((await fetch(`${url}/app.js`)).headers.get('content-type'), 'text/javascript');
    assert.equal((await fetch(`${url}/..%2fsecret`)).status, 403);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
