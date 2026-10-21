'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ISOLATION = Object.freeze([
  '--ignore-user-config', '--ignore-rules', '-c', 'developer_instructions=""',
  '-c', 'agents.enabled=false', '-c', 'features.multi_agent=false', '-c', 'features.multi_agent_v2=false',
  '-c', 'features.memories=false', '-c', 'features.plugins=false', '-c', 'features.apps=false',
  '-c', 'features.browser_use=false', '-c', 'features.computer_use=false', '-c', 'features.shell_tool=false',
  '-c', 'features.in_app_browser=false', '-c', 'features.browser_use_external=false',
  '-c', 'features.browser_use_full_cdp_access=false', '-c', 'features.image_generation=false',
  '-c', 'features.view_image=false', '-c', 'features.sleep_tool=false', '-c', 'features.tool_suggest=false',
  '-c', 'features.external_agent_memory_import=false', '-c', 'project_doc_max_bytes=0',
  '-c', 'web_search="disabled"',
]);

function environment(source = process.env) {
  const env = { ...source };
  const home = env.HOME || env.USERPROFILE || os.homedir();
  env.HOME = home;
  env.USERPROFILE ||= home;
  env.CODEX_HOME ||= path.join(home, '.codex');
  for (const key of Object.keys(env)) {
    if (/(?:API[_-]?KEY|OPENAI_(?:ORG|PROJECT)|AZURE_OPENAI)/i.test(key)) delete env[key];
  }
  return env;
}

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

// Use real executables or the npm JavaScript entry point, never cmd.exe or a shell.
async function discover({ env = process.env, platform = process.platform, root = path.resolve(__dirname, '..') } = {}) {
  const candidates = [];
  if (env.CODEX_BIN) candidates.push(path.resolve(env.CODEX_BIN));
  if (platform === 'win32') {
    const base = path.join(env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
    try {
      for (const version of (await fs.readdir(base)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
        candidates.push(path.join(base, version, 'codex.exe'));
      }
    } catch {}
    candidates.push(path.join(root, 'codex', 'codex-x86_64-pc-windows-msvc.exe'));
    for (const dir of (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(dir, 'codex.exe'), path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
    }
    if (env.APPDATA) candidates.push(path.join(env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'));
  } else {
    candidates.push('/Applications/Codex.app/Contents/Resources/codex');
    for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, 'codex'));
  }
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate.endsWith('.js') ? { command: process.execPath, prefix: [candidate] } : { command: candidate, prefix: [] };
  }
  return null;
}

function abortError() { return Object.assign(new Error('Anfrage abgebrochen. Der bisherige Spielstand bleibt erhalten.'), { status: 499 }); }

function run(binary, args, { input = '', cwd, signal, env, timeout = 180000, spawnProcess = spawn, rejectToolCalls = false } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(binary.command, [...binary.prefix, ...args], {
        cwd, env: { ...environment(env), ...(binary.prefix.length && process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch { reject(Object.assign(new Error('Die lokale ChatGPT-Verbindung konnte nicht gestartet werden.'), { status: 503 })); return; }
    let output = '', failure = null, events = '';
    const stop = error => { failure ||= error; try { child.kill(); } catch {} };
    const timer = setTimeout(() => stop(Object.assign(new Error('Die KI-Anfrage hat zu lange gedauert. Der Spielstand bleibt erhalten.'), { status: 504 })), timeout);
    const onAbort = () => stop(abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-12000); });
    if (rejectToolCalls) child.stdout.on('data', chunk => {
      events += chunk.toString();
      let newline;
      while ((newline = events.indexOf('\n')) !== -1) {
        const line = events.slice(0, newline); events = events.slice(newline + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        // A simulation may reason and answer. No command, MCP, search, file, image,
        // plan or other tool item is accepted, even if a future CLI adds a feature.
        if (/^item\./.test(event.type || '') && event.item?.type && !['reasoning', 'agent_message'].includes(event.item.type)) {
          stop(Object.assign(new Error('Die KI hat einen Werkzeugaufruf statt einer reinen Simulation versucht. Der Spielstand bleibt erhalten.'), { status: 502 }));
        }
      }
      if (events.length > 2 * 1024 * 1024) stop(Object.assign(new Error('Die KI-Antwort ist zu groß. Der Spielstand bleibt erhalten.'), { status: 502 }));
    });
    child.stdin.on('error', () => {});
    child.on('error', () => { failure ||= Object.assign(new Error('Die lokale ChatGPT-Verbindung ist nicht verfügbar.'), { status: 503 }); });
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (failure) reject(failure);
      else resolve({ code, output });
    });
    child.stdin.end(input);
  });
}

function createBridge(options = {}) {
  let binary;
  async function connection({ signal } = {}) {
    binary = await (options.discover || discover)(options);
    if (!binary) return { available: false, reason: 'Keine lokale Codex-Verbindung gefunden. Öffne die Codex-App und melde dich dort mit deinem ChatGPT-Konto an.' };
    try {
      const result = await run(binary, ['login', 'status'], { ...options, signal, timeout: 10000 });
      return result.code === 0 && /logged in (?:using|with) chatgpt/i.test(result.output)
        ? { available: true, reason: 'Mit deinem ChatGPT-Konto verbunden.' }
        : { available: false, reason: 'Die lokale Codex-Verbindung ist nicht mit ChatGPT angemeldet. Melde dich in der Codex-App an und prüfe die Verbindung erneut.' };
    } catch (error) {
      if (signal?.aborted) throw abortError();
      return { available: false, reason: error.message };
    }
  }
  async function generate({ prompt, schema, model, signal }) {
    if (!binary) throw Object.assign(new Error('Bitte zuerst die ChatGPT-Verbindung prüfen.'), { status: 503 });
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ticket-simulator-'));
    const output = path.join(temporary, 'answer.json');
    const schemaFile = path.join(temporary, 'response.schema.json');
    try {
      await fs.writeFile(schemaFile, JSON.stringify(schema), { mode: 0o600 });
      const result = await run(binary, ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral',
        '--color', 'never', '--model', model, ...ISOLATION, '--output-schema', schemaFile, '--output-last-message', output, '-'],
      { ...options, cwd: temporary, input: prompt, signal, rejectToolCalls: true });
      signal?.throwIfAborted();
      if (result.code !== 0) throw Object.assign(new Error('ChatGPT konnte nicht antworten. Prüfe Verbindung, Modellzugriff und dein Codex-Kontingent. Der Spielstand bleibt erhalten.'), { status: 502 });
      const info = await fs.stat(output);
      if (info.size > 2 * 1024 * 1024) throw new Error('Antwort zu groß.');
      try { return JSON.parse(await fs.readFile(output, 'utf8')); }
      catch { throw Object.assign(new Error('ChatGPT hat keine gültige Simulator-Antwort geliefert. Der Spielstand bleibt erhalten.'), { status: 502 }); }
    } finally { await fs.rm(temporary, { recursive: true, force: true }); }
  }
  return { connection, generate };
}

module.exports = { createBridge, environment, discover, run, ISOLATION, abortError };
