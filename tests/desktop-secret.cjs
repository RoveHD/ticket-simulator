'use strict';

// Run with Electron: electron tests/desktop-secret.cjs. Uses isolated save data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { secretArchives } = require('./fixtures/secret-companion.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', `secret-smoke-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
app.on('window-all-closed', () => {});

async function checkCase(name, archives) {
  const dataDir = path.join(output, name);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'ui-state.json'), JSON.stringify({ version: 1, rewardCatalogVersion: 2, masteryCatalogVersion: 2, companionLevelVersion: 2,
    model: 'gpt-6-luna', legacyReset: true, theme: 'dark', companionChosen: true, session: null, archives,
    cosmetics: { portrait: 'portrait-snake-base', title: 'title-rookie', badge: 'badge-recruit' }, environment: '' }));
  const backend = createApp({ root, dataDir, authCheck: async () => ({ available: false, reason: 'Isolierter Test' }) });
  await backend.ready;
  await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${backend.server.address().port}`;
  const win = new BrowserWindow({ show: false, width: 1440, height: 960,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  const run = source => win.webContents.executeJavaScript(source);
  async function load() {
    await win.loadURL(origin + '/#profile');
    await run(`new Promise((resolve,reject)=>{
      const check=()=>{if(document.querySelector('.companion-profile')){clearTimeout(timer);observer.disconnect();resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('Profil nicht bereit'));},10000);check();
    })`);
  }
  async function capture(file, selector, block = 'center') {
    await run(`(async()=>{
      await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
      for(const animation of document.getAnimations())if(animation.effect?.getTiming().iterations!==Infinity)animation.finish();
      document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:${JSON.stringify(block)},behavior:'instant'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
    fs.writeFileSync(path.join(output, file), (await win.webContents.capturePage()).toPNG());
  }
  try {
    await load();
    if (name === 'locked') {
      assert.equal((await fetch(origin + '/characters/chimera.png')).status, 404);
      assert.equal((await fetch(origin + '/characters/chimera-lord.png')).status, 404);
      assert.equal((await fetch(origin + '/characters/chimera-lord-breakout.png')).status, 404);
      for (const width of [1440, 850]) {
        win.setSize(width, 960);
        const check = await run(`(()=>{
          navigate('profile');profileTab='companions';render();
          const card=document.querySelector('.secret-choice');
          if(!card||card.querySelector('img')||card.querySelector('button'))throw Error('Geheime Karte verrät Bild oder Freischaltweg');
          if(card.textContent.includes('Nyxar'))throw Error('Geheimer Name sichtbar');
          card.scrollIntoView({block:'center'});
          return {question:card.querySelector('.secret-art b').textContent,overflow:document.documentElement.scrollWidth>innerWidth};
        })()`);
        assert.equal(check.question, '?'); assert.equal(check.overflow, false);
        await capture(`sealed-${width}.png`, '.secret-choice');
      }
      await run(`progressionCollectionKind='portrait';progressionCollectionSpecies='chimera';progressionCollectionStatus='locked';profileTab='portrait';render();
        if(document.querySelectorAll('.progression-reward-grid article').length!==1||!document.querySelector('.secret-reward'))throw Error('Geheime Formen sichtbar');`);
    } else if (name === 'unlocked') {
      assert.equal((await fetch(origin + '/characters/chimera.png')).status, 200);
      assert.equal((await fetch(origin + '/characters/chimera-lord.png')).status, 200);
      assert.equal((await fetch(origin + '/characters/chimera-lord-breakout.png')).status, 200);
      await run(`(async()=>{
        if(!state.game.characters.find(c=>c.id==='chimera'&&c.name==='Nyxar'&&c.unlocked))throw Error('Geheimnis nicht enthüllt');
        acceptState(await api('cosmetics',{kind:'portrait',id:'portrait-chimera-base'}));navigate('profile');
        if(state.game.companion.activeId!=='chimera'||state.game.companion.current.level<20)throw Error('Neuer Begleiter nicht auswählbar');
        for(const frame of ['lord','silver','gold','eternal','astral']){
          const id='portrait-chimera-lord-dns'+(frame==='lord'?'':'-'+frame);
          acceptState(await api('cosmetics',{kind:'portrait',id}));render();
          const img=document.querySelector('.profile-portrait img');await img.decode();
          const suffix=['eternal','astral'].includes(frame)?'-lord-breakout.png':'-lord.png';
          if(!img.src.endsWith('/characters/chimera'+suffix))throw Error('Falsches Lord-Porträt: '+frame);
          if(!document.querySelector('.profile-portrait .frame-'+frame))throw Error('Form fehlt: '+frame);
        }
      })()`);
      for (const width of [1440, 850]) {
        win.setSize(width, 960);
        await run(`navigate('profile');document.querySelector('.profile-showcase').scrollIntoView({block:'start'});`);
        assert.equal(await run(`document.documentElement.scrollWidth>innerWidth`), false);
        await capture(`discovered-astral-${width}.png`, '.profile-showcase');
      }
      await load();
      assert.equal(await run(`state.game.cosmetics.portrait`), 'portrait-chimera-lord-dns-astral');
      assert.equal(await run(`state.game.companion.activeId`), 'chimera');
    } else {
      await run(`navigate('mastery');document.querySelector('[data-mastery-character="wolf"]').click();
        if(progressionMasterySpecies!=='wolf'||state.game.companion.activeId!=='snake')throw Error('Tieransicht wechselt aktiven Begleiter');
        const wolf=state.game.companionMasteries.wolf.find(m=>m.id==='dhcp');
        const snake=state.game.companionMasteries.snake.find(m=>m.id==='dhcp');
        if(wolf.solved!==50||snake.solved!==0||!wolf.lordUnlocked)throw Error('Tierfortschritte vermischt');
        const card=document.querySelector('#mastery-dhcp');
        if(!card.textContent.includes('Wolf · 50 EIGENE FÄLLE')||!card.querySelector('.mastery-animal-portrait img').src.endsWith('wolf-lord.png'))throw Error('Wolfmeisterung oder Bild fehlt');
        if(!state.game.inventory.some(r=>r.id==='title-lord-dhcp')||state.game.inventory.some(r=>r.id==='portrait-snake-lord-dhcp'))throw Error('Titel/Formen-Trennung fehlt');`);
      for(const width of [1440,850]){
        win.setSize(width,960);
        await capture(`individual-wolf-dhcp-${width}.png`, '#mastery-dhcp', 'start');
        assert.equal(await run(`document.documentElement.scrollWidth>innerWidth`),false);
      }
      await run(`document.querySelector('[data-mastery-character="snake"]').click();
        if(!document.querySelector('#mastery-dhcp').textContent.includes('Schlange · 0 EIGENE FÄLLE'))throw Error('Schlange übernimmt fremde Fälle');
        if(state.game.companion.activeId!=='snake')throw Error('Aktiver Begleiter verändert');`);
    }
    assert.deepEqual(errors, []);
    return { case: name, passed: true };
  } finally { win.destroy(); await backend.close(); }
}

app.whenReady().then(async () => {
  const results = [];
  try {
    results.push(await checkCase('locked', []));
    results.push(await checkCase('unlocked', secretArchives({ astral: true })));
    const individual = Array.from({length:50},(_,i)=>({id:'dhcp-'+i,mode:'career',level:i<10?4:3,
      ticket:{number:1001+i},elapsed:12,reference:20,scenarioIds:[i<10?'dhcp-failover':'dhcp-scope'],
      completedTickets:[{number:1001+i,scenarioId:i<10?'dhcp-failover':'dhcp-scope'}],
      summary:{solved:true,solvedCount:1,arrived:1,score:95,wrongChanges:0,unnecessaryChecks:0,strengths:'',gaps:'',slaViolations:0},
      companionReward:{version:1,characterId:'wolf',xp:150}}));
    results.push(await checkCase('individual',individual));
    console.log(JSON.stringify({ ok: true, results, output }, null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { app.quit(); }
});
