const fs = require('node:fs');
const path = require('node:path');

function resolveLogo(assetsDir) {
  for (const name of ['logo.png', 'AIworker_logo.png']) {
    const candidate = path.join(assetsDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Missing logo: expected logo.png or AIworker_logo.png in ${assetsDir}`);
}

module.exports = { resolveLogo };
