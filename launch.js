#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
try {
  const electron = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [__dirname], { cwd: __dirname, env, windowsHide: false, detached: true, stdio: 'ignore' });
  child.on('error', error => { console.error(`Ticket Simulator konnte nicht starten: ${error.message}`); process.exitCode = 1; });
  child.unref();
} catch {
  console.error('Desktop-Abhängigkeiten fehlen. Einmal npm install ausführen oder dist/TicketSimulator.exe starten.');
  process.exitCode = 1;
}
