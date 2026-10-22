'use strict';

// Responsive rendering of every companion card in isolated Electron storage.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = fs.mkdtempSync(path.join(root, 'output', 'companion-layout-'));
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
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    const run = async source => {
      let timeout;
      const result = await Promise.race([
        win.webContents.executeJavaScript(`(async()=>{try{${source}}catch(error){return {error:error.stack}}})()`),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Renderer check exceeded 15 seconds')), 15000); })
      ]).finally(() => clearTimeout(timeout));
      if (result?.error) throw Error(result.error);
      return result;
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
    const checks = [];
    for (const width of [1920, 1440, 850, 480]) {
      win.setContentSize(width, 960);
      await run(`await new Promise((resolve,reject)=>{
        const expected=${width},check=()=>{if(innerWidth===expected){removeEventListener('resize',check);clearTimeout(timer);resolve();}};
        addEventListener('resize',check);const timer=setTimeout(()=>{removeEventListener('resize',check);reject(Error('Viewport resize timed out: '+innerWidth+'px, expected '+expected+'px'));},12000);check();
      });`);
      await run(`navigate('profile');main.scrollTop=0;
        if(innerWidth===1920)await Promise.all([...document.querySelectorAll('.companion-choice-art img')].map(img=>{img.loading='eager';return img.decode();}));`);
      checks.push(await run(`
        const cards=[...document.querySelectorAll('.companion-profile .companion-choice')];
        if(cards.length!==9)throw Error('Expected all nine companion cards, got '+cards.length);
        let portraits=0,secretCards=0;
        const measures=cards.map(card=>{
          const art=card.querySelector('.companion-choice-art'),frame=art.getBoundingClientRect();
          if(frame.height<218)throw Error('Portrait frame collapsed: '+frame.height);
          if(card.querySelector('.pixel-sprite')){
            portraits++;
            const sprite=card.querySelector('.pixel-sprite'),box=sprite.getBoundingClientRect();
            if(box.height<198||box.width<145||Math.abs(box.width/box.height-.75)>.02)throw Error('Portrait size or ratio broken: '+box.width+'x'+box.height);
            if(box.left<frame.left-1||box.right>frame.right+1||box.top<frame.top-1||box.bottom>frame.bottom+1)throw Error('Portrait clipped by its frame');
            if(Math.abs((box.left+box.right-frame.left-frame.right)/2)>1)throw Error('Portrait not centered');
            if(getComputedStyle(sprite.querySelector('img')).imageRendering!=='pixelated')throw Error('Pixel art smoothing enabled');
          }else if(card.classList.contains('secret-choice')){
            secretCards++;
            if(card.querySelector('img,.pixel-sprite')||!card.querySelector('h3')?.textContent.includes('???'))throw Error('Locked secret identity leaked');
          }else throw Error('Companion artwork missing');
          if(!card.classList.contains('secret-choice')&&(!card.querySelector('.ability-preview')||!card.querySelector('.passive-preview')))throw Error('Ability information missing');
          if(!card.querySelector('button,.reward-unlock'))throw Error('Companion action missing');
          const copy=card.querySelector('.companion-choice-copy');
          if(copy.scrollHeight>copy.clientHeight+1)throw Error('Companion details clipped');
          return {frameHeight:Math.round(frame.height),portrait:card.querySelector('.pixel-sprite')?.getBoundingClientRect().toJSON()||null};
        });
        if(portraits!==8||secretCards!==1)throw Error('Expected eight visible portraits and one sealed identity');
        if(document.documentElement.scrollWidth>innerWidth||main.scrollWidth>main.clientWidth+1)throw Error('Horizontal page overflow');
        if(document.documentElement.scrollHeight>innerHeight+1)throw Error('Outer page scroll detected');
        const boxes=measures.map(card=>card.portrait).filter(Boolean);
        const result={width:innerWidth,portraits,secretCards,cards:measures.length,frameHeights:[...new Set(measures.map(card=>card.frameHeight))],portraitBounds:{minWidth:Math.min(...boxes.map(box=>box.width)),minHeight:Math.min(...boxes.map(box=>box.height))}};
        return result;`));
      if (width === 1440) {
        await run(`document.querySelector('.companion-choices').scrollIntoView({block:'start',behavior:'instant'});`);
        let timeout;
        const image = await Promise.race([
          win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Profile screenshot exceeded 15 seconds')), 15000); })
        ]).finally(() => clearTimeout(timeout));
        fs.writeFileSync(path.join(output, `profile-${width}.png`), image.toPNG());
      }
    }
    const result = { ok: true, checks, output };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error.stack); process.exitCode = 1;
  } finally {
    win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0);
  }
});
