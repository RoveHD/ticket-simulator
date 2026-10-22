'use strict';

// Real Electron rendering with an isolated save, never the player's data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createApp } = require('../server');
const { ranked, rankView } = require('../server/ranked');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'rank-divisions-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let win, backend;
  try {
    const dataDir = path.join(output, 'data');
    fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'ui-state.json'), JSON.stringify({ version: 1, model: 'gpt-6-luna',
      rewardCatalogVersion: 2, masteryCatalogVersion: 2, companionLevelVersion: 2, legacyReset: true,
      companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, archives: [], session: null, theme: 'dark' }));
    backend = createApp({ root, dataDir, authCheck: async () => ({ available: true }) });
    await backend.ready;
    await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 1440, height: 1000,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const errors = [];
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
    const run = source => win.webContents.executeJavaScript(source).catch(error => {
      throw new Error(error.message + '\n' + errors.join('\n') + '\nSource: ' + source.slice(-500));
    });
    await win.loadURL('http://127.0.0.1:' + backend.server.address().port + '/#ranks');
    await run(`new Promise((resolve,reject)=>{
      const check=()=>{if(document.querySelector('.rank-gallery')){clearTimeout(timer);observer.disconnect();resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('Rank screen not ready'));},10000);check();
    })`);
    const initial = await run('JSON.stringify(state.game.ranked)');
    for (let index = 0; index < 18; index++) {
      const rank = { ...ranked([]), ...rankView(index * 100 + 45) };
      await run(`state.game.ranked=${JSON.stringify(rank)};navigate('ranks');
        if(document.querySelectorAll('.rank-tier').length!==6)throw Error('Six ranks missing');
        if(document.querySelectorAll('.rank-division').length!==18)throw Error('Eighteen divisions missing');
        if(document.querySelectorAll('.rank-division[aria-current="true"]').length!==1)throw Error('Current division missing');
        if(!document.querySelector('.rank-current h2').textContent.includes(${JSON.stringify(rank.name)}))throw Error('Current name wrong');
        navigate('career');
        if(document.querySelectorAll('.career-division').length!==18)throw Error('Career divisions missing');
        if(!document.querySelector('.career-division.current').getAttribute('aria-label').startsWith(${JSON.stringify(rank.name)}))throw Error('Career current wrong');`);
    }
    const example = { ...ranked([]), ...rankView(420) };
    await run(`state.game.ranked=${JSON.stringify(example)}`);
    let screens = 0;
    for (const width of [1440, 850, 480]) {
      win.setSize(width, 1000);
      for (const view of ['ranks', 'career']) {
        await run(`navigate('${view}');main.scrollTop=0;`);
        await run(`(async()=>{await document.fonts.ready;
          await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
          for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          if(main.scrollWidth>main.clientWidth+1||document.documentElement.scrollWidth>innerWidth)throw Error('Horizontal overflow ${view}/${width}');
        })()`);
        fs.writeFileSync(path.join(output, view + '-' + width + '.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
        screens++;
        if (view === 'career') {
          await run(`document.querySelector('.level-track').scrollIntoView({block:'start',behavior:'instant'});`);
          fs.writeFileSync(path.join(output, 'career-path-' + width + '.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
          screens++;
        }
      }
    }
    await run(`(async()=>{state.game.ranked=${initial};await refresh();})()`);
    assert.equal(await run('JSON.stringify(state.game.ranked)'), initial, 'UI checks cannot change saved rank');
    assert.deepEqual(errors, []);
    const result = { ok: true, output, divisions: 18, screens, errors };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error);
    if (win) fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    process.exitCode = 1;
  } finally { win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0); }
});
