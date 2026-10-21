'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../server');
const { smokeAI } = require('./desktop-scenarios.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', `wait-smoke-${Date.now()}`);
const dataDir = path.join(output, 'data');
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', path.join(output, 'electron-profile'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  let win, backend;
  try {
    backend = createApp({ root, dataDir, random: () => .999,
      ai: smokeAI, authCheck: async () => ({ available: true, reason: 'Isolierter Desktop-Test' }) });
    await backend.ready;
    await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${backend.server.address().port}`;
    win = new BrowserWindow({ show: false, width: 1440, height: 960,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    const run = source => win.webContents.executeJavaScript(source);
    const errors = [];
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    await win.loadURL(origin);
    await run(`new Promise((resolve,reject)=>{
      const check=()=>{if(state?.game){clearTimeout(timer);observer.disconnect();resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('UI nicht bereit'));},10000);check();
    })`);
    await require('./desktop-play.cjs').chooseInitialCompanion(win.webContents);
    await run(`(async()=>{await start('speedrun',{duration:60,level:1});await send('Abschluss prüfen');
      if(!canWaitForArrival()||!document.querySelector('[data-action="wait-arrival"]'))throw Error('Warteaktion nach gelöstem Ticket fehlt');
      if(state.session.elapsed!==10||state.session.queue.filter(t=>t.status==='solved').length!==1)throw Error('Ungültiger Ausgangszustand');
    })()`);
    for (const width of [1440, 850]) {
      win.setSize(width, 960);
      await run(`(async()=>{
        for(const animation of document.getAnimations())if(animation.effect?.getTiming().iterations!==Infinity)animation.finish();
        document.querySelector('.queue-board').scrollIntoView({block:'start',behavior:'instant'});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        if(document.documentElement.scrollWidth>innerWidth)throw Error('Wartestatus läuft über');
        const box=document.querySelector('[data-action="wait-arrival"]').getBoundingClientRect();
        if(box.width<100||box.height<40)throw Error('Warteknopf nicht bedienbar');
      })()`);
      fs.writeFileSync(path.join(output, `waiting-${width}.png`), (await win.webContents.capturePage()).toPNG());
    }
    const result = await run(`(async()=>{
      const button=document.querySelector('[data-action="wait-arrival"]');button.click();
      await new Promise((resolve,reject)=>{
        const check=()=>{if(!isBusy()&&state.session.ticket.number==='S02'){clearTimeout(timer);observer.disconnect();resolve();}};
        const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
        const timer=setTimeout(()=>{observer.disconnect();reject(Error('Warten liefert kein neues Ticket: '+document.querySelector('#toast').textContent));},10000);check();
      });
      if(state.session.elapsed!==20||canWaitForArrival())throw Error('Warten verbucht falsche Zeit oder bleibt aktiv');
      const next=state.session.queue.find(t=>t.number==='S02');
      if(!next?.active||next.status!=='open'||!document.querySelector('#message'))throw Error('Neues Ticket nicht bearbeitbar');
      await send('Abschluss prüfen');
      if(!canWaitForArrival())throw Error('Zweite Bereitschaft fehlt');
      await send('Bis zur nächsten Meldung warten');
      if(state.session.ticket.number!=='S03'||state.session.elapsed!==40)throw Error('Drittes Ticket fehlt');
      await send('Abschluss prüfen');await send('Bis zur nächsten Meldung warten');
      if(state.session.status!=='completed'||state.session.elapsed!==60)throw Error('Schicht wird nicht sauber beendet');
      return {tickets:state.session.queue.length,solved:state.session.queue.filter(t=>t.status==='solved').length,elapsed:state.session.elapsed};
    })()`);
    const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'ui-state.json'), 'utf8'));
    assert.equal(saved.session.current.elapsed, 30);
    assert.equal(saved.session.current.waiting, 30);
    assert.equal(saved.archives.length, 1);
    assert.equal(saved.archives[0].summary.solvedCount, 3);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, ...result, activeWork: 30, waiting: 30, output }, null, 2));
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { win?.destroy(); if (backend) await backend.close(); app.quit(); }
});
