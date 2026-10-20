#!/usr/bin/env node
// Baut die portable EXE (Node Single Executable Application).
// Aufruf: node build/build-exe.js [win|linux]   (Standard: win)
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const target = process.argv[2] || 'win';
const IS_WIN_HOST = process.platform === 'win32';
const outName = target === 'win' ? 'TicketSimulator.exe' : 'ticket-simulator';
const out = path.join(DIST, outName);
const blob = path.join(DIST, 'sea-prep.blob');

fs.mkdirSync(DIST, { recursive: true });

// 1) SEA-Blob mit eingebetteten Startdateien erzeugen
const seaConfig = {
  main: path.join(ROOT, 'sim.js'),
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets: {
    'AGENTS.md': path.join(ROOT, 'AGENTS.md'),
    'README.md': path.join(ROOT, 'README.md'),
    'karriere.md': path.join(ROOT, 'stats', 'karriere.md'),
    'speedrun.md': path.join(ROOT, 'stats', 'speedrun.md'),
  },
};
const configFile = path.join(DIST, 'sea-config.json');
fs.writeFileSync(configFile, JSON.stringify(seaConfig, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', configFile], { stdio: 'inherit' });

// 2) Node-Binary der Zielplattform in gleicher Version besorgen
async function nodeBinary() {
  if ((target === 'win') === IS_WIN_HOST) return process.execPath;
  if (target !== 'win') throw new Error('Linux-Build nur auf Linux');
  const url = `https://nodejs.org/dist/${process.version}/win-x64/node.exe`;
  const cached = path.join(DIST, `node-${process.version}-win-x64.exe`);
  if (!fs.existsSync(cached)) {
    console.log(`Lade ${url} …`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
    fs.writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
  }
  return cached;
}

(async () => {
  fs.copyFileSync(await nodeBinary(), out);
  fs.chmodSync(out, 0o755);

  // 3) Blob einschleusen
  execFileSync(
    IS_WIN_HOST ? 'npx.cmd' : 'npx',
    ['--yes', 'postject@1.0.0-alpha.6', out, 'NODE_SEA_BLOB', blob,
      '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'],
    { stdio: 'inherit', shell: IS_WIN_HOST },
  );
  fs.rmSync(blob, { force: true });
  console.log(`\n✔ ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1048576).toFixed(0)} MB)`);
})().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
