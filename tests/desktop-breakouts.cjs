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
    const run = async source => {
      const expression=/^\s*(?:\(|new Promise)/.test(source);
      const value=await win.webContents.executeJavaScript(`(async()=>{try{${expression?'return await ':''}${source}}catch(error){return {__testError:error.stack}}})()`);
      if(value?.__testError)throw Error(value.__testError);
      return value;
    };
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
            const sheet=creature.querySelector('img'),css=getComputedStyle(creature);
        const col=Number(css.getPropertyValue('--sprite-col')),row=Number(css.getPropertyValue('--sprite-row')),rows=Number(css.getPropertyValue('--sprite-rows'));
        const cellWidth=sheet.naturalWidth/2,cellHeight=sheet.naturalHeight/rows;
        const ctx=canvas.getContext('2d');ctx.drawImage(sheet,col*cellWidth+cellWidth*.04,row*cellHeight,cellWidth*.92,cellHeight,0,0,100,100);
            const pixels=ctx.getImageData(0,0,100,100).data;let transparent=0,solid=0;
            for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>240)solid++;}
            if(transparent<1000||solid<1000)throw Error('Missing transparent silhouette: ${id}');
            if(creature.getBoundingClientRect().top>=frame.getBoundingClientRect().top-8)throw Error('No frame overhang: ${id}');
            if(getComputedStyle(frame).overflowY!=='visible')throw Error('Clipped portrait: ${id}');
            const motion=creature.getAnimations().find(a=>a.animationName.startsWith('creature-'));
            if('${tier}'==='eternal'){
              if(creature.getAnimations({subtree:true}).length||getComputedStyle(creature).transform!=='none')throw Error('Eternal creature must stay still: ${id}');
            }else{
              if(!motion||motion.playState!=='running')throw Error('No Astral creature motion: ${id}');
              if(getComputedStyle(creature).animationTimingFunction.includes('steps'))throw Error('Stepped creature motion: ${id}');
              motion.currentTime=1500;const fineBefore=getComputedStyle(creature).transform;motion.currentTime=1516;
              if(fineBefore===getComputedStyle(creature).transform)throw Error('Quantized creature motion: ${id}');
            }
            const effect=frame.querySelector('.eternal-frame-effect'),edge=getComputedStyle(effect);
            if(Number(edge.zIndex)>=Number(getComputedStyle(creature).zIndex)||parseFloat(edge.borderLeftWidth)<3||parseFloat(edge.outlineWidth)<2)throw Error('Frame must remain behind silhouette: ${id}');
            if(edge.borderLeftColor==='rgba(0, 0, 0, 0)')throw Error('Invisible frame: ${id}');
            const border=effect.getBoundingClientRect(),figure=creature.getBoundingClientRect();
            if(border.left>=figure.left||border.right<=figure.right)throw Error('Perimeter does not clear creature: ${id}');
            if(getComputedStyle(effect.querySelector('svg')).display!=='none')throw Error('Decorative lines cross face: ${id}');
            if(edge.boxShadow==='none'||getComputedStyle(effect,'::after').animationName!=='lord-perimeter-glow')throw Error('Missing animated luminous perimeter: ${id}');
            const flow=effect.getAnimations({subtree:true}).find(a=>a.animationName==='lord-frame-flow'&&a.effect.pseudoElement==='::before');
            const flowStyle=getComputedStyle(effect,'::before');
            if(!flow||!flowStyle.maskComposite.split(',').every(value=>value.trim()==='exclude')||parseFloat(flowStyle.paddingLeft)<2)throw Error('Missing border-only light current: ${id} '+JSON.stringify({animations:effect.getAnimations().map(a=>a.animationName),mask:flowStyle.maskComposite,padding:flowStyle.paddingLeft,animation:flowStyle.animationName}));
            flow.pause();flow.currentTime=1000;
            const angle=getComputedStyle(effect,'::before').getPropertyValue('--lord-perimeter-angle');
            flow.currentTime=1016;
            if(angle===getComputedStyle(effect,'::before').getPropertyValue('--lord-perimeter-angle'))throw Error('Stepped frame current: ${id}');
            const spark=effect.querySelector('.eternal-spark'),orbit=spark.getAnimations().find(a=>a.animationName==='lord-frame-spark');
            if(!orbit||getComputedStyle(spark).offsetPath==='none')throw Error('Missing perimeter particles: ${id}');
            orbit.pause();orbit.currentTime=0;
            const sparkStart=spark.getBoundingClientRect().toJSON();orbit.currentTime=1500;
            const sparkEnd=spark.getBoundingClientRect();
            if(Math.abs(sparkStart.x-sparkEnd.x)+Math.abs(sparkStart.y-sparkEnd.y)<5)throw Error('Stationary perimeter particles: ${id}');
            // Check the entire circuit, including corners, so particles cannot cross the face.
            for(const time of [0,750,1500,2250,3000,3750,4500,5250]){
              orbit.currentTime=time;const r=spark.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
              const inset=Math.min(x-border.left,border.right-x,y-border.top,border.bottom-y);
              if(inset>2||inset< -12)throw Error('Particle leaves the outer perimeter: ${id}, inset='+inset);
            }
            if('${tier}'==='astral'){
              const halo=effect.querySelector('.astral-halo'),corners=effect.querySelector('.astral-light-sweep');
              if(getComputedStyle(halo).display==='none'||!getComputedStyle(halo).maskComposite.split(',').every(value=>value.trim()==='exclude')||getComputedStyle(halo).animationDirection!=='reverse')throw Error('Missing Astral counter-orbit: ${id}');
              if(!corners.getAnimations().some(a=>a.animationName==='lord-astral-corners'))throw Error('Missing Astral corner lights: ${id}');
            }
            const bgBefore=bg.getBoundingClientRect().toJSON();if(motion){motion.currentTime=0;const before=getComputedStyle(creature).transform;motion.currentTime=3000;
            if(before===getComputedStyle(creature).transform)throw Error('Unchanged Astral creature: ${id}');}
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
      `);
      if(id==='dragon') {
        win.setSize(1440,960);
        await run(`progressionMasterySpecies='dragon';navigate('mastery');for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();document.querySelector('#mastery-forms .frame-eternal').scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
        fs.writeFileSync(path.join(output,'dragon-mastery-frames.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
      }
      await run(`
        progressionCollectionKind='portrait';progressionCollectionSpecies='${id}';progressionCollectionStatus='all';profileTab='portrait';navigate('profile');
        if(document.querySelectorAll('.progression-reward-grid .character-breakout .portrait-creature').length!==2)throw Error('Sammlungsformen fehlen: ${id}');`);
    }
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await run(`if([...document.querySelectorAll('.portrait-creature')].some(el=>getComputedStyle(el).animationName!=='none'))throw Error('Reduced motion ignored');
      if([...document.querySelectorAll('.character-breakout>.eternal-frame-effect')].some(el=>getComputedStyle(el,'::after').animationName!=='none'||getComputedStyle(el,'::before').animationName!=='none'||el.getAnimations({subtree:true}).length))throw Error('Frame ignores reduced motion');`);
    win.webContents.debugger.detach();
    const result = { ok: true, characters: CHARACTERS.length, portraitChecks: checked, eternalPortraitStill: true, astralContinuousMotion: true, unobstructedPerimeter: true, luminousAnimatedFrame: true, continuousFrameCurrent: true, perimeterParticles: true, astralCounterOrbit: true, transparentForeground: true, stationaryBackground: true, reducedMotion: true };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, ...result }));
  } catch (error) {
    console.error(error);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  } finally { win?.destroy(); await backend?.close(); app.exit(process.exitCode || 0); }
});
