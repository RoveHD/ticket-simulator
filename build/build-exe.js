#!/usr/bin/env node
'use strict';
require('./create-icon');
const fs = require('node:fs');
const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { version } = require('../package.json');
const target = process.argv[2] || 'win';
if (target !== 'win') throw new Error('Dieser Build erstellt die Windows-Desktop-App.');
build({ targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64), publish: 'never' })
  .then(files => {
    const executable = path.join(__dirname, '..', 'dist', `TicketSimulator-${version}.exe`);
    // Keep the documented download name and CI release inputs in sync with the
    // versioned portable build; never reuse an executable from an older build.
    fs.copyFileSync(executable, path.join(__dirname, '..', 'dist', 'TicketSimulator.exe'));
    for (const file of files) console.log(`Desktop-App erstellt: ${file}`);
  })
  .catch(error => { console.error(error.message); process.exitCode = 1; });
