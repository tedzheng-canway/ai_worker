import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const logo = createRequire(import.meta.url)('./electron/logo.cjs');

export default defineConfig(({ command }) => {
  const logoPath = logo.resolveLogo(fileURLToPath(new URL('./assets/', import.meta.url)));
  let devToken = "";
  if (command === "serve") {
    const state = process.env.COWORKER_STATE_DIR || (process.platform === "win32"
      ? path.join(process.env.APPDATA || os.homedir(), "coworker")
      : path.join(os.homedir(), ".config", "coworker"));
    try {
      devToken = fs.readFileSync(path.join(state, "sidecar-8765.token"), "utf8").trim();
    } catch {}
  }
  return {
    base: "./",
    plugins: [vue(), {
      name: 'app-logo',
      transformIndexHtml: {
        order: 'pre',
        handler: html => html.replace('__APP_LOGO__', `/assets/${path.basename(logoPath)}`),
      },
    }],
    resolve: { alias: { '@app-logo': logoPath } },
    server: { port: 1421, strictPort: true },
    define: { __COWORKER_DEV_TOKEN__: JSON.stringify(devToken) },
    envPrefix: ["VITE_", "TAURI_"],
  };
});
