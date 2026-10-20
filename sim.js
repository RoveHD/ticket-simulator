#!/usr/bin/env node
// IT-Ticket-Simulator – Hauptprogramm mit Menü. Die KI läuft über die Codex CLI.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline/promises');

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, 'config.json');
const STATS_FILE = path.join(ROOT, 'stats', 'karriere.md');
const REPORT_DIR = path.join(ROOT, 'stats', 'berichte');
const INTERN_DIR = path.join(ROOT, '.sim', 'intern');
const DEFAULT_MODEL = 'gpt-6-luna';
const IS_WIN = process.platform === 'win32';

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const newRl = () => readline.createInterface({ input: process.stdin, output: process.stdout });
let rl = newRl();
const ask = (q) => rl.question(q);
const pause = () => ask(c.dim('\nEnter = zurück zum Menü … '));

// ---------- Konfiguration ----------

function loadConfig() {
  try {
    return { model: DEFAULT_MODEL, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { model: process.env.SIM_MODEL || DEFAULT_MODEL };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
}

// ---------- Externe Programme ----------

function run(cmd, args, opts = {}) {
  // npm-Shims unter Windows (codex.cmd) brauchen eine Shell
  return spawnSync(cmd, args, { cwd: ROOT, shell: IS_WIN, ...opts });
}

function has(cmd) {
  const r = run(cmd, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

async function checkPrerequisites() {
  if (!has('npm')) {
    console.log(c.red('\n❌ Node.js/npm fehlt. Installieren: https://nodejs.org (LTS)'));
    return false;
  }

  if (!has('codex')) {
    console.log(c.yellow('\n⚠️  Codex CLI ist nicht installiert.'));
    console.log('   Benötigt: Codex CLI + ChatGPT-Konto mit Codex-Kontingent.');
    const a = await ask('   Jetzt installieren (npm install -g @openai/codex)? [j/N] ');
    if (!/^[jy]$/i.test(a.trim())) return false;
    if (run('npm', ['install', '-g', '@openai/codex'], { stdio: 'inherit' }).status !== 0) {
      console.log(c.red('❌ Installation fehlgeschlagen.'));
      return false;
    }
  }

  if (run('codex', ['login', 'status'], { stdio: 'ignore' }).status !== 0) {
    console.log(c.yellow('\n⚠️  Nicht bei ChatGPT angemeldet. Anmeldung startet …'));
    if (run('codex', ['login'], { stdio: 'inherit' }).status !== 0) {
      console.log(c.red('❌ Anmeldung fehlgeschlagen.'));
      return false;
    }
  }
  return true;
}

function startCodex(prompt, cfg) {
  console.log(c.dim(`\nStarte Codex (${cfg.model}) … Beenden der Sitzung mit /quit oder Strg+C.\n`));
  // Terminal komplett an Codex übergeben, danach Eingabe neu öffnen
  rl.close();
  const r = run('codex', ['-m', cfg.model, '--sandbox', 'workspace-write', prompt], { stdio: 'inherit' });
  rl = newRl();
  if (r.status !== 0 && r.status !== null) {
    console.log(c.yellow('\n⚠️  Codex wurde mit Fehler beendet. Bei Limit-Meldung ist das Kontingent aufgebraucht –'));
    console.log(c.yellow('   später fortsetzen, der Fortschritt bleibt gespeichert.'));
  }
}

// ---------- Spielstand ----------

function listFiles(dir, re) {
  try {
    return fs.readdirSync(dir).filter((f) => re.test(f)).sort();
  } catch {
    return [];
  }
}

function openTicket() {
  const done = new Set(listFiles(REPORT_DIR, /^ticket-\d+\.md$/));
  const open = listFiles(INTERN_DIR, /^ticket-\d+\.md$/).filter((f) => !done.has(f));
  return open.length ? open[open.length - 1].match(/\d+/)[0] : null;
}

function statsSummary() {
  let text;
  try {
    text = fs.readFileSync(STATS_FILE, 'utf8');
  } catch {
    return [];
  }
  const keys = ['Aktuelles Level', 'Nächste Ticketnummer', 'Abgeschlossene Tickets', 'Durchschnittliche Punktzahl'];
  return text
    .split('\n')
    .map((l) => l.split('|').map((s) => s.trim()).filter(Boolean))
    .filter((cols) => cols.length === 2 && keys.includes(cols[0]))
    .map(([k, v]) => `${k}: ${c.bold(v)}`);
}

// ---------- Menüpunkte ----------

async function newTicket(cfg) {
  const open = openTicket();
  if (open) {
    console.log(c.yellow(`\n⚠️  Ticket #${open} ist noch offen. Es gilt: immer nur ein Ticket gleichzeitig.`));
    const a = await ask('   Offenes Ticket stattdessen fortsetzen? [J/n] ');
    if (/^n$/i.test(a.trim())) return;
    return startCodex('Fortsetzen', cfg);
  }
  startCodex('Start', cfg);
}

async function resumeTicket(cfg) {
  const open = openTicket();
  if (!open) {
    console.log(c.yellow('\nKein offenes Ticket vorhanden.'));
    return pause();
  }
  startCodex('Fortsetzen', cfg);
}

async function showStats() {
  try {
    console.log('\n' + fs.readFileSync(STATS_FILE, 'utf8'));
  } catch {
    console.log(c.yellow('\nNoch keine Statistik vorhanden.'));
  }
  await pause();
}

async function showReports() {
  const reports = listFiles(REPORT_DIR, /^ticket-\d+\.md$/);
  if (!reports.length) {
    console.log(c.yellow('\nNoch keine Abschlussberichte vorhanden.'));
    return pause();
  }
  console.log();
  reports.forEach((f, i) => console.log(`  ${i + 1}) ${f.replace('.md', '')}`));
  const n = parseInt(await ask('\nNummer: '), 10);
  if (reports[n - 1]) console.log('\n' + fs.readFileSync(path.join(REPORT_DIR, reports[n - 1]), 'utf8'));
  await pause();
}

async function changeModel(cfg) {
  console.log(`\nAktuelles Modell: ${c.bold(cfg.model)}  (Standard: ${DEFAULT_MODEL})`);
  const m = (await ask('Neues Modell (leer = unverändert): ')).trim();
  if (!m) return;
  cfg.model = m;
  saveConfig(cfg);
  console.log(c.green(`✔ Modell auf ${m} gesetzt.`));
  await pause();
}

async function saveProgress() {
  if (!has('git') || run('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) {
    console.log(c.yellow('\nKein Git-Repository – Fortschritt liegt nur lokal vor.'));
    return pause();
  }
  run('git', ['add', '-A'], { stdio: 'inherit' });
  const commit = run('git', ['commit', '-m', 'Simulator-Fortschritt sichern'], { stdio: 'inherit' });
  if (commit.status === 0) {
    const push = run('git', ['push'], { stdio: 'inherit' });
    console.log(push.status === 0 ? c.green('\n✔ Fortschritt gesichert.') : c.yellow('\n⚠️  Lokal committet, Push fehlgeschlagen.'));
  }
  await pause();
}

// ---------- Hauptmenü ----------

function header(cfg) {
  console.clear();
  console.log(c.cyan('══════════════════════════════════════════════'));
  console.log(c.cyan(c.bold('   IT-TICKET-SIMULATOR – Sysadmin Career Mode')));
  console.log(c.cyan('══════════════════════════════════════════════'));
  console.log(c.dim(`Modell: ${cfg.model}`));
  const summary = statsSummary();
  if (summary.length) console.log('\n' + summary.join('\n'));
  const open = openTicket();
  if (open) console.log(c.yellow(`\nOffenes Ticket: #${open}`));
  console.log(c.dim('\nJede KI-Antwort verbraucht Codex-Kontingent.'));
}

async function main() {
  const cfg = loadConfig();
  header(cfg);
  if (!(await checkPrerequisites())) {
    await ask(c.dim('\nEnter zum Beenden … '));
    rl.close();
    process.exit(1);
  }

  const menu = [
    ['Neues Ticket starten', () => newTicket(cfg)],
    ['Offenes Ticket fortsetzen', () => resumeTicket(cfg)],
    ['Statistik anzeigen', showStats],
    ['Abschlussberichte anzeigen', showReports],
    ['Modell ändern', () => changeModel(cfg)],
    ['Fortschritt sichern (git push)', saveProgress],
    ['Beenden', null],
  ];

  for (;;) {
    header(cfg);
    console.log();
    menu.forEach(([label], i) => console.log(`  ${c.bold(i + 1)}) ${label}`));
    const choice = menu[parseInt(await ask('\nAuswahl: '), 10) - 1];
    if (!choice) continue;
    if (!choice[1]) break;
    await choice[1]();
  }
  rl.close();
}

main();
