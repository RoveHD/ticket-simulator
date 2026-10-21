'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const output = path.join(root, 'output', `desktop-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, SIM_DESKTOP_SMOKE_DIR: output };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [root], { cwd: root, env, windowsHide: true, stdio: 'pipe' });
let diagnostics = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-6000); });
const timer = setTimeout(() => { child.kill(); console.error('Desktop-Test hat nicht rechtzeitig beendet.'); process.exitCode = 1; }, 90000);
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on('close', async code => {
  clearTimeout(timer);
  try {
    const result = JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8'));
    if (code !== 0 || !result.ok) throw new Error(result.error || 'Desktop-Prozess fehlgeschlagen');
    let stillListening = false;
    try { await fetch(`http://127.0.0.1:${result.port}/api/bootstrap`); stillListening = true; } catch {}
    if (stillListening) throw new Error('Backend läuft nach App-Ende weiter.');
    console.log(JSON.stringify({ ...result, shutdownVerified: true, screenshot: path.join(output, 'desktop.png') }, null, 2));
  } catch (error) { console.error(error.message, diagnostics); process.exitCode = 1; }
});
