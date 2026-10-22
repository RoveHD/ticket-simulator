'use strict';

// Run with Electron. All saves stay in this test's output directory.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(root, 'output', 'pass-layout-'));
app.setPath('userData', path.join(output, 'profile'));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  let win, backend;
  try {
    const storage = require('../electron/storage.cjs').prepareStorage({ assetsRoot: root, root: path.join(output, 'data') });
    backend = require('../server').createApp({ root: storage, assetsRoot: root, dataDir: path.join(storage, '.sim'),
      authCheck: async () => ({ available: true }), ai: require('./desktop-scenarios.cjs').smokeAI });
    await backend.ready;
    await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 1440, height: 960,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
    const run = async source => {
      const result = await win.webContents.executeJavaScript(`(async()=>{try{${source}}catch(error){return {error:error.stack}}})()`);
      if (result?.error) throw Error(result.error);
      return result;
    };
    await win.loadURL(`http://127.0.0.1:${backend.server.address().port}`);
    await run(`await new Promise((resolve,reject)=>{
      const check=()=>{if(state?.game){observer.disconnect();clearTimeout(timer);resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('App not ready'));},10000);check();
    });`);
    await require('./desktop-play.cjs').chooseInitialCompanion(win.webContents);
    const pages = await run(`return [...new Set(state.game.battlepass.tiers.flatMap((t,i)=>t.reward.kind==='portrait'?[Math.floor(i/4)]:[]))];`);
    const checks = [];
    for (const width of [1920, 1440, 850, 480]) {
      win.setSize(width, 960);
      for (const page of pages) {
        await run(`progressionPassPage=${page};navigate('battlepass');main.scrollTop=0;
          await document.fonts.ready;
          await Promise.all([...main.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
          for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
        checks.push(await run(`
          const cards=[...document.querySelectorAll('.progression-tier')];
          const bounds=cards.map(card=>{
            const preview=card.querySelector('.pass-reward-preview'),art=preview?.firstElementChild;
            if(!preview||!art)throw Error('Shared reward preview missing');
            const p=preview.getBoundingClientRect(),a=art.getBoundingClientRect();
            if(Math.abs(p.height-200)>1||a.height<198||a.height>201)throw Error('Reward preview heights differ');
            if(a.left<p.left-1||a.right>p.right+1||Math.abs(a.left+a.width/2-p.left-p.width/2)>1)throw Error('Artwork not centered or clipped');
            const sprite=art.querySelector('.pixel-sprite');
            if(sprite){
              if(a.width<145||Math.abs(a.width/a.height-.75)>.02)throw Error('Companion too small or distorted');
              if(getComputedStyle(sprite.querySelector('img')).imageRendering!=='pixelated')throw Error('Pixel art blurred');
            }
            return {top:card.getBoundingClientRect().top,name:card.querySelector('h4').getBoundingClientRect().top,
              rarity:card.querySelector('.progression-rarity').getBoundingClientRect().top};
          });
          for(const a of bounds)for(const b of bounds)if(Math.abs(a.top-b.top)<1&&
            (Math.abs(a.name-b.name)>1||Math.abs(a.rarity-b.rarity)>1))throw Error('Reward metadata misaligned');
          if(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.documentElement.scrollHeight>document.documentElement.clientHeight||main.scrollWidth>main.clientWidth)throw Error('Page overflow');
          return {width:innerWidth,page:${page}+1,cards:cards.length};`));
        if (page === 2 && width >= 850) {
          await run(`document.querySelector('.progression-tier-grid').scrollIntoView({block:'center',behavior:'instant'});
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
          win.webContents.invalidate(); await win.webContents.capturePage();
          fs.writeFileSync(path.join(output, `pass-${width}.png`), (await win.webContents.capturePage()).toPNG());
        }
      }
    }
    const result = { ok: true, checks, output };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.stack); process.exitCode = 1;
    if (win) fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
  } finally {
    win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0);
  }
});
