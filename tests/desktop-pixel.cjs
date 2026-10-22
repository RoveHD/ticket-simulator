'use strict';

// Real Electron rendering and interaction, with isolated saves and deterministic AI.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createApp}=require('../server');
const {smokeAI}=require('./desktop-scenarios.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','pixel-smoke-'+Date.now());
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'electron-profile'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  let win,backend;
  try{
    const dataDir=path.join(output,'data');fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir,'ui-state.json'),JSON.stringify({version:1,model:'gpt-6-luna',
      rewardCatalogVersion:2,masteryCatalogVersion:2,companionLevelVersion:2,legacyReset:true,
      companionChosen:true,cosmetics:{portrait:'portrait-wolf-base'},archives:[],session:null,
      theme:'dark',audio:{muted:true,musicEnabled:true,effectsEnabled:true,musicVolume:.22,effectsVolume:.45,musicTrack:'funk'}}));
    backend=createApp({root,dataDir,authCheck:async()=>({available:true}),ai:smokeAI,random:()=>.4});await backend.ready;
    await new Promise(resolve=>backend.server.listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+backend.server.address().port;
    assert.equal((await fetch(origin+'/characters/pixel-atlas-secret.png',{headers:{'If-None-Match':'*'}})).status,404);
    win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
    const run=async source=>{
      const expression=/^\s*(?:\(|new Promise)/.test(source);
      const result=await win.webContents.executeJavaScript(`(async()=>{try{${expression?'return await ':''}${source}}catch(error){return {__testError:error.stack}}})()`);
      if(result?.__testError)throw Error(result.__testError);
      return result;
    };
    await win.loadURL(origin+'/#menu');
    await run(`new Promise((resolve,reject)=>{
      const check=()=>{if(document.querySelector('.start-screen')){clearTimeout(timer);o.disconnect();resolve();}};
      const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});
      const timer=setTimeout(()=>{o.disconnect();reject(Error('Menu not ready'));},10000);check();
    })`);
    async function paint(){await run(`(async()=>{
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
      for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);}
    async function capture(name){await paint();fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
    let screenChecks=0;
    for(const width of [1440,850,480]){
      win.setSize(width,960);
      for(const view of ['menu','overview','simulation','speedrun','missions','battlepass','mastery','profile','ranks','career','settings']){
        await run(`navigate('${view}');main.scrollTop=0;`);await paint();
        await capture(view+'-'+width);
        await run(`(()=>{
          if(!document.fonts.check('16px "Pixel Arcade"'))throw Error('Pixel font missing');
          if(getComputedStyle(document.body).getPropertyValue('--accent').trim()!=='#e46b59')throw Error('Wrong arcade palette');
          if(main.scrollWidth>main.clientWidth+1)throw Error('Horizontal overflow: ${view}/${width} '+main.scrollWidth+'/'+main.clientWidth);
          if(document.documentElement.scrollWidth>innerWidth)throw Error('Window overflow: ${view}/${width}');
          for(const img of document.querySelectorAll('img'))if(!img.complete||!img.naturalWidth)throw Error('Image missing: '+img.src);
          const icon=document.querySelector('.pixel-icon');if(!icon||getComputedStyle(icon).fill==='none')throw Error('Pixel icons missing');
        })()`);screenChecks++;
      }
    }
    win.setSize(1440,960);
    await run(`navigate('speedrun');document.querySelector('[name="level"][value="6"]').click();document.querySelector('[name="duration"][value="120"]').click();`);
    await run(`if(new FormData(document.querySelector('#speedrun-form')).get('level')!=='6')throw Error('Difficulty selection broken');`);
    await run(`(async()=>{navigate('menu');await start();})()`);
    await paint();
    await run(`draft='ipconfig /all';render();const input=document.querySelector('#message');input.focus();input.setSelectionRange(2,6);const old=input;for(let i=0;i<10;i++)render();if(document.querySelector('#message')!==old||document.activeElement!==old||old.selectionStart!==2||old.value!=='ipconfig /all')throw Error('Pixel rendering loses draft/focus/selection');`);
    for(const width of [1440,850,480]){
      win.setSize(width,960);await capture('ticket-'+width);
      await run(`if(main.scrollWidth>main.clientWidth+1)throw Error('Ticket overflow ${width}');`);
    }
    // A career win and loss exercise the real completion screens and reward counters.
    win.setSize(1440,960);
    await run(`(async()=>{acceptState(await api('message',{message:'Schicht beenden'}));navigate('menu');acceptState(await api('start',{mode:'career',level:3}));navigate('simulation');acceptState(await api('message',{message:'Abschluss prüfen'}));render();})()`);
    await require('./desktop-play.cjs').waitForResult(win.webContents);
    await capture('win-1440');
    await run(`(async()=>{if(!document.querySelector('.result-screen.won'))throw Error('Win screen missing');acceptState(await api('start',{mode:'career',level:3}));navigate('simulation');acceptState(await api('message',{message:'Aufgeben'}));render();})()`);
    await require('./desktop-play.cjs').waitForResult(win.webContents);await capture('lose-1440');
    await run(`if(!document.querySelector('.result-screen.lost'))throw Error('Lose screen missing');state.theme='light';navigate('settings');`);
    await capture('settings-light-1440');
    // Test the actual atlas cell pixels, rather than the whole two-by-two image.
    const cells=await run(`(async()=>{
      state.theme='dark';navigate('profile');let cells=0;
      for(const character of progressionCharactersCatalog().filter(c=>!c.secret))for(const lord of [false,true]){
        const probe=document.createElement('div');probe.style.cssText='width:120px;height:160px;position:fixed';probe.innerHTML=progressionPixelSprite(character.id,lord);document.body.append(probe);
        const sprite=probe.querySelector('.pixel-sprite'),img=sprite.querySelector('img');await img.decode();
        const css=getComputedStyle(sprite),col=Number(css.getPropertyValue('--sprite-col')),row=Number(css.getPropertyValue('--sprite-row')),rows=Number(css.getPropertyValue('--sprite-rows'));
        const c=document.createElement('canvas');c.width=100;c.height=100;const ctx=c.getContext('2d');ctx.drawImage(img,col*img.naturalWidth/2,row*img.naturalHeight/rows,img.naturalWidth/2,img.naturalHeight/rows,0,0,100,100);
        const p=ctx.getImageData(0,0,100,100).data;let clear=0,solid=0;for(let i=3;i<p.length;i+=4){if(p[i]===0)clear++;if(p[i]>240)solid++;}
        if(clear<300||solid<500)throw Error('Atlas cell empty or opaque: '+character.id+'/'+lord);
        if(getComputedStyle(img).imageRendering!=='pixelated')throw Error('Sprite filtering blurred');
        probe.remove();cells++;
      }return cells;
    })()`);
    assert.deepEqual(errors,[]);
    const result={ok:true,output,screenChecks,cells,pixelFont:true,pixelIcons:true,selection:true,focusPreserved:true,win:true,lose:true,errors};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){console.error(error);if(win)fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
  finally{win?.destroy();await backend?.close();app.exit(process.exitCode||0);}
});
