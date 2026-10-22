'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(root, 'output', 'navigation-'));
app.setPath('userData', path.join(output, 'profile'));
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let backend, win;
  try {
    const storage = require('../electron/storage.cjs').prepareStorage({ assetsRoot: root, root: path.join(output, 'data') });
    backend = require('../server').createApp({ root: storage, assetsRoot: root, dataDir: path.join(storage, '.sim'), authCheck: async () => ({ available: true }) });
    await backend.ready; await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 1440, height: 960,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
    const run = async code => {
      const result = await win.webContents.executeJavaScript(`(async()=>{try{${code}}catch(error){return {error:error.stack}}})()`);
      if (result?.error) throw Error(result.error); return result;
    };
    const origin = `http://127.0.0.1:${backend.server.address().port}`;
    require('./strict-csp.cjs')(win.webContents, origin);
    await win.loadURL(origin);
    await run(`await new Promise((resolve,reject)=>{
      const check=()=>{if(state?.game){observer.disconnect();clearTimeout(timer);resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('App not ready'));},10000);check();
    });`);
    await require('./desktop-play.cjs').chooseInitialCompanion(win.webContents);
    const layouts = [];
    for (const width of [1920, 1440, 1150, 850, 480]) {
      win.setSize(width, width === 850 ? 650 : 960);
      for (const theme of ['dark', 'light']) {
        await run(`state.theme='${theme}';navigate('career');await document.fonts.ready;
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
        layouts.push(await run(`
          const nav=document.querySelector('.play-tabs');
          if(nav.children.length!==6)throw Error('Navigation still crowded');
          const header=document.querySelector('#play-header').getBoundingClientRect();
          for(const child of nav.children){const r=child.getBoundingClientRect();if(r.width<40||r.left<header.left||r.right>header.right+1)throw Error('Navigation overflows');}
          for(const name of ['play','progress','results']){
            const button=nav.querySelector('[data-nav-toggle="'+name+'"]');button.click();
            const panel=document.getElementById(button.getAttribute('aria-controls')),r=panel.getBoundingClientRect();
            if(panel.hidden||r.left<0||r.right>innerWidth||r.bottom>innerHeight||panel.scrollWidth>panel.clientWidth)throw Error('Dropdown clipped: '+name+'/'+innerWidth);
            const point=document.elementFromPoint(r.left+20,r.top+20);
            if(!panel.contains(point))throw Error('Dropdown behind content');
          }
          const button=nav.querySelector('[data-nav-toggle="progress"]');button.focus();
          button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
          if(document.activeElement.dataset.view!=='missions')throw Error('Keyboard did not enter dropdown');
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
          if(document.activeElement.dataset.view!=='ranks')throw Error('Keyboard End broken');
          document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          if(currentView!=='career'||document.activeElement!==button||button.getAttribute('aria-expanded')!=='false')throw Error('Escape navigates away or loses focus');
          button.click();document.querySelector('#main').click();
          if(button.getAttribute('aria-expanded')!=='false')throw Error('Outside click did not close');
          if(document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight)throw Error('Outer page scroll');
          return {width:innerWidth,theme:'${theme}',entries:nav.children.length,keyboard:true,popupBounds:true};`));
        if (theme === 'dark' && [1440,850].includes(width)) {
          await run(`document.querySelector('[data-nav-toggle="progress"]').click();
            window.ArcaneFX?.clear();
            for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
          win.webContents.invalidate(); await win.webContents.capturePage();
          fs.writeFileSync(path.join(output, `navigation-${width}.png`), (await win.webContents.capturePage()).toPNG());
        }
      }
    }
    const destinations = await run(`
      const links=[...document.querySelectorAll('.play-tabs [data-view]')].map(el=>el.dataset.view);
      for(const id of links){
        const link=document.querySelector('.play-tabs [data-view="'+id+'"]'),group=link.closest('.play-nav-group');
        if(group)group.querySelector('[data-nav-toggle]').click();
        link.click();
        if(currentView!==id||document.querySelector('.play-tabs [aria-current="page"]')?.dataset.view!==id)throw Error('Wrong destination: '+id);
        if(document.querySelector('.play-nav-toggle[aria-expanded="true"]'))throw Error('Dropdown remains open after navigation');
      }
      navigate('career');const toggle=document.querySelector('[data-nav-toggle="progress"]');toggle.click();render();
      if(toggle!==document.querySelector('[data-nav-toggle="progress"]')||toggle.getAttribute('aria-expanded')!=='true')throw Error('State render resets menu');
      return links;`);
    const result = { ok: true, layouts, destinations, output };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.stack); process.exitCode = 1;
    if (win) fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
  } finally { win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0); }
});
