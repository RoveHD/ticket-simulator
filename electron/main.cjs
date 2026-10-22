'use strict';
const { app, BrowserWindow, Menu, dialog, nativeImage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createApp } = require('../server');
const { prepareStorage } = require('./storage.cjs');

const smokeDirectory = process.env.SIM_DESKTOP_SMOKE_DIR;
// The smoke mode is local developer instrumentation, never a packaged switch.
const smoke = !app.isPackaged && !!smokeDirectory;
const smokeResult = data => {
  if (!smoke) return;
  fs.mkdirSync(smokeDirectory, { recursive: true });
  fs.writeFileSync(path.join(smokeDirectory, 'result.json'), JSON.stringify(data, null, 2));
};
if (smoke) app.setPath('userData', path.join(smokeDirectory, 'electron-profile'));

let win, backend, quitting = false, origin;
app.setName('Ticket Simulator');
app.setAppUserModelId('com.rovehd.ticketsimulator');
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting || !backend) return;
    event.preventDefault(); quitting = true;
    // Stop in-flight inference before allowing Electron to exit.
    backend.close().finally(() => { backend = null; app.quit(); });
  });
  app.whenReady().then(start).catch(error => {
    smokeResult({ ok: false, error: error.message });
    if (!smoke) dialog.showErrorBox('Ticket Simulator konnte nicht starten', `${error.message}\n\nDer bisherige Spielstand bleibt erhalten.`);
    process.exitCode = 1;
    app.quit();
  });
}

async function start() {
  const assetsRoot = app.getAppPath();
  const portableRoot = process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : assetsRoot);
  const root = prepareStorage({ assetsRoot, root: smoke ? path.join(smokeDirectory, 'data') : portableRoot });
  backend = createApp({ root, assetsRoot, onThemeChange: theme => {
    nativeTheme.themeSource = theme;
    win?.setBackgroundColor(theme === 'dark' ? '#080d1c' : '#eef2fa');
  }, ...(smoke ? { dataDir: path.join(root, '.sim'), random: () => .5, ai: require('../tests/desktop-scenarios.cjs').smokeAI, authCheck: async () => ({ available: true, reason: 'Isolierter Desktop-Test mit simulierten Antworten.' }) } : {}) });
  await new Promise((resolve, reject) => {
    backend.server.once('error', reject);
    backend.server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${backend.server.address().port}`;
  const rendererErrors = [];
  win = new BrowserWindow({
    title: 'Ticket Simulator', width: 1440, height: 960, minWidth: 850, minHeight: 650,
    show: false, backgroundColor: nativeTheme.shouldUseDarkColors ? '#161329' : '#eee3c5', autoHideMenuBar: true,
    icon: nativeImage.createFromPath(path.join(assetsRoot, 'assets', 'icon.png')),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, spellcheck: false, backgroundThrottling: !smoke },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  win.webContents.on('console-message', (_event, details) => {
    if (details.level === 'error') rendererErrors.push(details.message);
  });
  win.once('closed', () => { win = null; });
  if (!smoke) win.once('ready-to-show', () => { win.show(); });
  await win.loadURL(origin);
  if (smoke) {
    try {
      // Attach after navigation has created the renderer. Keep this test-owned
      // media session across reloads; reduced motion is checked separately.
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
      });
      await backend.ready;
      const result = await win.webContents.executeJavaScript(`new Promise((resolve,reject) => {
        const inspect = () => {
          if (!document.querySelector('.start-screen,.companion-profile')) return false;
          resolve({ title:document.title, heading:document.querySelector('h1').textContent,
            navigation:document.querySelectorAll('.nav-button').length,
            reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
            nodeExposed:typeof require !== 'undefined' || typeof process !== 'undefined',
            width:document.documentElement.clientWidth, contentWidth:document.documentElement.scrollWidth });
          return true;
        };
        if(inspect()) return;
        const observer=new MutationObserver(()=>{if(inspect()){observer.disconnect();clearTimeout(timer);}});
        observer.observe(document.body,{childList:true,subtree:true});
        const timer=setTimeout(()=>{observer.disconnect();reject(new Error('UI wurde nicht bereit: '+document.body.innerText.slice(-1800)));},15000);
      })`);
      if (result.navigation !== 12 || result.nodeExposed || result.contentWidth > result.width || result.reducedMotion) throw new Error('Desktop-Oberfläche, Isolation oder Animations-Testbasis ungültig.');
      if (rendererErrors.length) throw new Error(rendererErrors.join('\n'));
      const painted = () => win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => { for(const animation of document.getAnimations()) { if(animation.effect?.getTiming().iterations!==Infinity) animation.finish(); } requestAnimationFrame(resolve); }))');
      await painted();
      const screenshot = await win.webContents.capturePage();
      fs.writeFileSync(path.join(smokeDirectory, 'desktop.png'), screenshot.toPNG());
      const appearance = await win.webContents.executeJavaScript(`({
        theme:document.documentElement.dataset.theme,
        background:getComputedStyle(document.documentElement).backgroundColor,
        navigationFont:getComputedStyle(document.querySelector('.nav-button')).fontSize,
        headingFont:getComputedStyle(document.querySelector('h1')).fontFamily
      })`);
      if (appearance.theme !== 'dark' || appearance.background !== 'rgb(22, 19, 41)' || !appearance.headingFont.includes('Pixel Arcade') || parseFloat(appearance.navigationFont) < 16 || !nativeTheme.shouldUseDarkColors) throw new Error('Pixel-Darstellung, dunkler Modus oder Schriftgröße fehlt.');
      const initialCompanion = await require('../tests/desktop-play.cjs').chooseInitialCompanion(win.webContents);
      if (initialCompanion.companion !== 'dragon' || initialCompanion.level !== 1 || initialCompanion.canSwitch) throw new Error('Pflicht-Begleiterwahl oder Maximalstufen-Sperre fehlerhaft.');
      await win.webContents.executeJavaScript('navigate("menu")');
      const layouts = [];
      for (const width of [1440, 850]) {
        const resized = new Promise(resolve => win.webContents.once('did-stop-loading', resolve));
        win.setSize(width, 960);
        win.webContents.reload();
        await resized;
        await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
          const ready=()=>document.querySelector('.page-heading,.start-screen') && window.innerWidth === ${win.getContentBounds().width};
          const cleanup=()=>{observer.disconnect();window.removeEventListener('resize',check);clearTimeout(timer);};
          const check=()=>{if(ready()){cleanup();resolve();}};
          const observer=new MutationObserver(check);
          const timer=setTimeout(()=>{cleanup();reject(new Error('Fenster wurde nicht bereit'));},10000);
          observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',check);check();
        })`);
        for (const view of ['menu', 'overview', 'simulation', 'speedrun', 'missions', 'battlepass', 'mastery', 'career', 'reports', 'settings']) {
          const layout = await win.webContents.executeJavaScript(`(() => {
            navigate('${view}');
            return {view:'${view}',width:document.documentElement.clientWidth,contentWidth:document.documentElement.scrollWidth};
          })()`);
          if (layout.contentWidth > layout.width) throw new Error('Überlauf: ' + JSON.stringify(layout));
          layouts.push(layout);
          if (view === 'speedrun') { await painted(); fs.writeFileSync(path.join(smokeDirectory, 'loadout-' + width + '.png'), (await win.webContents.capturePage()).toPNG()); }
          if (view === 'menu') { await painted(); fs.writeFileSync(path.join(smokeDirectory, 'menu-' + width + '.png'), (await win.webContents.capturePage()).toPNG()); }
        }
        await painted();
        const small = await win.webContents.capturePage();
        fs.writeFileSync(path.join(smokeDirectory, 'settings-' + width + '.png'), small.toPNG());
      }
      // Exercise the real settings form and backend, then restore the default appearance.
      for (const theme of ['light', 'dark']) {
        await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Darstellung wurde nicht gespeichert: '+JSON.stringify({theme:state.theme,busy:isBusy(),toast:document.querySelector('#toast').textContent,valid:document.querySelector('#settings-form').checkValidity(),model:document.querySelector('[name="model"]').value}))); },5000);
          const observer=new MutationObserver(()=>{
            if(document.documentElement.dataset.theme==='${theme}') {clearTimeout(timer);observer.disconnect();resolve();}
          });
          observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
          document.querySelector('[name="theme"]').value='${theme}';
          document.querySelector('#settings-form').requestSubmit();
        })`);
        if (nativeTheme.shouldUseDarkColors !== (theme === 'dark')) throw new Error('Fensterleiste wechselt nicht mit.');
      }
      const audio = await require('../tests/desktop-audio.cjs').checkAudio(win.webContents);
      await win.webContents.executeJavaScript('document.querySelector(".audio-panel").scrollIntoView({block:"center"});');
      await painted();
      fs.writeFileSync(path.join(smokeDirectory, 'audio-options.png'), (await win.webContents.capturePage()).toPNG());
      const rankedReset = await win.webContents.executeJavaScript(`(async () => {
        navigate('settings');
        if(document.querySelector('[name="careerStartLevel"]')) throw new Error('Entfernte Startlevel-Auswahl wird noch angezeigt');
        navigate('career');
        if(state.game.ranked.level!==1 || state.game.ranked.rr!==0) throw new Error('Neue Karriere startet nicht auf Rang 1 mit 0 RR');
        navigate('settings');
        const settled = () => new Promise((resolve,reject) => {
          const cleanup=()=>{observer.disconnect();clearTimeout(timer);};
          const check=()=>{if(!isBusy()){cleanup();resolve();}};
          const observer=new MutationObserver(check);
          const timer=setTimeout(()=>{cleanup();reject(new Error('Einstellungen nicht abgeschlossen'));},5000);
          observer.observe(document.body,{childList:true,subtree:true});check();
        });
        const originalConfirm=window.confirm;
        try {
          let confirmations=0;
          window.confirm=()=>{confirmations++;return false;};
          const before=JSON.stringify(state);
          document.querySelector('[data-action="reset"]').click();
          if(confirmations!==1 || JSON.stringify(state)!==before) throw new Error('Reset-Abbruch verändert Daten');
          window.confirm=()=>{confirmations++;return true;};
          document.querySelector('[data-action="reset"]').click();
          await settled();
          if(confirmations!==2 || state.game.ranked.level!==1 || state.game.ranked.rr!==0 || state.session!==null || state.reports.length || state.highscores || state.stats['Nächste Ticketnummer']!=='#1001' || state.game.companionChosen!==false) throw new Error('Reset fehlgeschlagen');
          return {rankedStartLevel:state.game.ranked.level,rankedStartRr:state.game.ranked.rr,resetConfirmed:true,cancelPreservesState:true,companionReselectionRequired:true};
        } finally {window.confirm=originalConfirm;}
      })()`);
      const selection = await require('../tests/desktop-play.cjs').checkSelection(win.webContents);
      win.setSize(1440,960);
      await win.webContents.executeJavaScript('window.scrollTo(0,0);document.querySelector("#toast").hidden=true;');
      await painted();
      fs.writeFileSync(path.join(smokeDirectory, 'mission.png'), (await win.webContents.capturePage()).toPNG());
      const gameplay = await win.webContents.executeJavaScript(`(async () => {
        await start();
        const originalSession=state.session.id;
        navigate('menu');
        if(!document.querySelector('.menu-play[data-action="resume"]')) throw new Error('Menü bietet kein Fortsetzen');
        document.querySelector('.menu-play').click();
        if(currentView!=='simulation'||state.session.id!==originalSession) throw new Error('Fortsetzen verändert den Einsatz');
        await send('Abschluss prüfen');
        if(!document.querySelector('.debrief') || state.game.xp!==415 || state.game.missions.filter(m=>m.unlocked).length!==1) throw new Error('Abschlussbelohnung fehlt');
        return { xp:state.game.xp, rank:state.game.rank.name };
      })()`);
      await win.loadURL(origin + '/#simulation');
      await win.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
        const cleanup=()=>{observer.disconnect();clearTimeout(timer);};
        const check=()=>{if(document.querySelector('.debrief')){cleanup();resolve();}};
        const observer=new MutationObserver(check);
        const timer=setTimeout(()=>{cleanup();reject(new Error('Gespeicherter Abschluss fehlt nach Reload'));},5000);
        observer.observe(document.body,{childList:true,subtree:true});check();
      })`);
      await require('../tests/desktop-play.cjs').waitForResult(win.webContents);
      await win.webContents.executeJavaScript('document.querySelector("#toast").hidden=true;document.querySelector(".result-screen").scrollIntoView({block:"start"});');
      await painted();
      fs.writeFileSync(path.join(smokeDirectory, 'debrief.png'), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG());
      await win.webContents.executeJavaScript(`(async () => {
        await start('speedrun',{duration:60,level:6});
        await send('Prüfen');
        if(state.session.queue.length<2 || !document.querySelector('.arrival-popup')) throw new Error('Neue Tickets fehlen');
        const original=state.session.ticket.number;
        const target=state.session.queue.find(t=>!t.active).number;
        const composer=document.querySelector('#message');composer.value='Entwurf für '+original;composer.dispatchEvent(new Event('input',{bubbles:true}));
        const before=state.session.elapsed;
        await switchTicket(target);
        if(state.session.ticket.number!==target || state.session.elapsed!==before+1 || draft!=='') throw new Error('Ticketwechsel fehlerhaft');
        await switchTicket(original);
        if(draft!=='Entwurf für '+original) throw new Error('Ticketentwurf verloren');
        const select=document.querySelector('#queue-sort');select.value='requester';select.dispatchEvent(new Event('change',{bubbles:true}));
        if(queueSort!=='requester') throw new Error('Sortierung fehlt');
        navigate('simulation');
      })()`);
      for (const width of [1440, 850]) {
        win.setSize(width, 960);
        await win.webContents.executeJavaScript('window.scrollTo(0,0); document.querySelector("#toast").hidden=true;');
        await painted();
        const bounds = await win.webContents.executeJavaScript(`({width:document.documentElement.clientWidth,content:document.documentElement.scrollWidth})`);
        if(bounds.content>bounds.width) throw new Error('Ticketliste läuft über');
        fs.writeFileSync(path.join(smokeDirectory, 'speedrun-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
      }
      await win.webContents.executeJavaScript(`(async()=>{
        await send('Schicht beenden');await start();
        const before=state.game.xp;await send('Aufgeben');
        if(!document.querySelector('.result-screen.lost')||state.game.xp!==before)throw Error('Verlustanzeige vergibt falsche XP');
      })()`);
      await require('../tests/desktop-play.cjs').waitForResult(win.webContents);
      await painted();
      fs.writeFileSync(path.join(smokeDirectory,'defeat.png'),(await win.webContents.capturePage()).toPNG());
      const animations = await require('../tests/desktop-play.cjs').checkReducedMotion(win.webContents);
      const performance = await require('../tests/desktop-performance.cjs')(win.webContents);
      const progression = await require('../tests/desktop-progression.cjs')(win, smokeDirectory, painted);
      if (rendererErrors.length) throw new Error(rendererErrors.join('\n'));
      smokeResult({ ok: true, ...result, sandbox: win.webContents.getLastWebPreferences().sandbox,
        appearance, layouts, rankedReset, initialCompanion, gameplay, audio, selection, animations, performance, progression, rendererErrors, port: backend.server.address().port, packaged: app.isPackaged });
      app.quit();
    } catch (error) { smokeResult({ ok: false, error: error.message, rendererErrors }); app.exit(1); }
  }
}
