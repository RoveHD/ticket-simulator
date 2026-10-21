'use strict';
const fs = require('node:fs');
const path = require('node:path');

function prepareStorage({ assetsRoot, root }) {
  fs.mkdirSync(root, { recursive: true });
  // Seed only missing files. Existing GUI/CLI progress is never replaced.
  for (const relative of ['AGENTS.md', 'stats/karriere.md', 'stats/speedrun.md']) {
    const target = path.join(root, relative);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(assetsRoot, relative), target, fs.constants.COPYFILE_EXCL);
  }
  fs.accessSync(root, fs.constants.W_OK);
  return root;
}

module.exports = { prepareStorage };
