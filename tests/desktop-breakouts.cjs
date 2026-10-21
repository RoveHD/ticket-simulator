'use strict';

// electron tests/desktop-breakouts.cjs: real portrait rendering with isolated saves.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { progression } = require('../server/progression');
const { CHARACTERS } = require('../server/characters');
const { secretArchives } = require('./fixtures/secret-companion.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', `breakouts-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  let backend, win;
  try {
    const dataDir = path.join(output, 'data');
    fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'ui-state.json'), JSON.stringify({ version: 1, rewardCatalogVersion: 2,
      masteryCatalogVersion: 2, companionLevelVersion: 2, model: 'gpt-6-luna', legacyReset: true, theme: 'dark', companionChosen: true,
      session: null, archives: secretArchives(), cosmetics: { portrait: 'portrait-snake-base' }, environment: '' }));
    backend = createApp({ root, dataDir, authCheck: async () => ({ available: false }) });
    await backend.ready;
    await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${backend.server.address().port}`;
    win = new BrowserWindow({ show: false, width: 1440, height: 960,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const run = source => win.webContents.executeJavaScript(source);
    await win.loadURL(origin + '/#profile');
    await run(`new Promise((resolve,reject)=>{
      const check=()=>{if(document.querySelector('.companion-profile')){clearTimeout(timer);observer.disconnect();resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('Profil nicht bereit'));},10000);check();
    })`);
    let checked = 0;
    for (const { id } of CHARACTERS) {
      assert.equal((await fetch(origin + `/characters/${id}-lord-breakout.png`)).status, 200, id + ' asset route');
      const fixture = progression(id === 'chimera' ? secretArchives({ astral: true }) : Array.from({ length: 2500 }, (_, i) => ({ id: `${id}-${i}`, mode: 'career', level: 5,
        scenarioIds: ['site-vpn-dns'], companionReward: { version: 1, characterId: id, xp: 150 },
        summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } })));
      await run(`state.game=${JSON.stringify(fixture)};profileTab='companions';`);
      for (const width of [1440, 850, 480]) {
        win.setSize(width, 960);
        for (const tier of ['eternal', 'astral']) {
          await run(`state.game.cosmetics={portrait:'portrait-${id}-lord-${tier}'};navigate('profile');window.scrollTo(0,0);`);
          await run(`(async()=>{
            await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
            for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();
            const frame=document.querySelector('.profile-portrait .character-breakout');
            const creature=frame?.querySelector('.portrait-creature'),bg=frame?.querySelector('.portrait-scene-background');
            if(!creature||!bg)throw Error('Separate layers missing: ${id}/${tier}');
            const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
            const ctx=canvas.getContext('2d');ctx.drawImage(creature,0,0,100,100);
            const pixels=ctx.getImageData(0,0,100,100).data;let transparent=0,solid=0;
            for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>240)solid++;}
            if(transparent<1000||solid<1000)throw Error('Missing transparent silhouette: ${id}');
            if(creature.getBoundingClientRect().top>=frame.getBoundingClientRect().top-8)throw Error('No frame overhang: ${id}');
            if(getComputedStyle(frame).overflowY!=='visible')throw Error('Clipped portrait: ${id}');
            const motion=creature.getAnimations().find(a=>a.animationName.startsWith('creature-'));
            if(!motion||motion.playState!=='running')throw Error('No creature motion: ${id}');
            const bgBefore=bg.getBoundingClientRect().toJSON();motion.currentTime=0;const before=getComputedStyle(creature).transform;motion.currentTime=3000;
            if(before===getComputedStyle(creature).transform)throw Error('Unchanged creature: ${id}');
            if(bg.getAnimations({subtree:true}).length||getComputedStyle(bg).transform!=='none'||JSON.stringify(bgBefore)!==JSON.stringify(bg.getBoundingClientRect().toJSON()))throw Error('Moving background: ${id}');
            const dock=document.querySelector('#companion-dock');
            if(!dock.querySelector('.portrait-creature')||dock.scrollWidth>dock.clientWidth)throw Error('Dock broken: ${id}/${tier}/${width} '+dock.scrollWidth+'/'+dock.clientWidth);
            if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Page overflow: ${id}/${width}');
          })()`);
          checked++;
          if (width === 1440 && tier === 'astral') {
            await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            fs.writeFileSync(path.join(output, id + '-astral.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
          }
        }
      }
      await run(`progressionMasterySpecies='${id}';navigate('mastery');
        if(document.querySelectorAll('#mastery-forms .character-breakout .portrait-creature').length!==2)throw Error('Meisterungsformen fehlen: ${id}');
        progressionCollectionKind='portrait';progressionCollectionSpecies='${id}';progressionCollectionStatus='all';profileTab='portrait';navigate('profile');
        if(document.querySelectorAll('.progression-reward-grid .character-breakout .portrait-creature').length!==2)throw Error('Sammlungsformen fehlen: ${id}');`);
    }
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await run(`if([...document.querySelectorAll('.portrait-creature')].some(el=>getComputedStyle(el).animationName!=='none'))throw Error('Reduced motion ignored');`);
    win.webContents.debugger.detach();
    const result = { ok: true, characters: CHARACTERS.length, portraitChecks: checked, transparentForeground: true, stationaryBackground: true, reducedMotion: true };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, ...result }));
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  } finally { win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0); }
});
