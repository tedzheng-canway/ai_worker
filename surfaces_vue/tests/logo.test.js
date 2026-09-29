import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const { resolveLogo } = createRequire(import.meta.url)('../electron/logo.cjs');
const frontend = fileURLToPath(new URL('../', import.meta.url));

test('logo selection and Vite build work with local override or only repository logo', async () => {
  // Keep the fixture under node_modules so Vite can resolve the existing dependencies.
  const fixture = await mkdtemp(path.join(frontend, 'node_modules/.logo-test-'));
  try {
    const assets = path.join(fixture, 'assets');
    await mkdir(assets);
    await mkdir(path.join(fixture, 'electron'));
    assert.throws(() => resolveLogo(assets), /Missing logo/);
    await copyFile(path.join(frontend, 'assets/AIworker_logo.png'), path.join(assets, 'AIworker_logo.png'));
    await copyFile(path.join(frontend, 'vite.config.js'), path.join(fixture, 'vite.config.js'));
    await copyFile(path.join(frontend, 'electron/logo.cjs'), path.join(fixture, 'electron/logo.cjs'));
    await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(fixture, 'index.html'), '<link rel="icon" href="__APP_LOGO__"><script type="module" src="/main.js"></script>');
    await writeFile(path.join(fixture, 'main.js'), 'import logo from "@app-logo"; document.body.dataset.logo = logo;');
    for (const name of ['AIworker_logo.png', 'logo.png']) {
      if (name === 'logo.png') await copyFile(path.join(assets, 'AIworker_logo.png'), path.join(assets, name));
      assert.equal(resolveLogo(assets), path.join(assets, name));
      await build({ root: fixture, configFile: path.join(fixture, 'vite.config.js'), logLevel: 'silent', build: { assetsInlineLimit: 0 } });
      const html = await readFile(path.join(fixture, 'dist/index.html'), 'utf8');
      assert.ok(html.includes(`assets/${path.basename(name, '.png')}-`), html);
      assert.ok(!html.includes('__APP_LOGO__'));
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
