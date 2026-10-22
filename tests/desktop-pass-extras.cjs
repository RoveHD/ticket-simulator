'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createApp}=require('../server');
const {smokeAI}=require('./desktop-scenarios.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','pass-extras-'+Date.now());
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'electron-profile'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  let win,backend;
  try{
    const dataDir=path.join(output,'data');fs.mkdirSync(dataDir);
    const archives=Array.from({length:250},(_,i)=>({id:'pass-extra-'+i,mode:'career',level:5,ticket:{number:String(1001+i)},
      elapsed:10,reference:15,completedAt:'2026-10-20T10:00:00Z',scenarioIds:['site-vpn-dns'],
      summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}}));
    fs.writeFileSync(path.join(dataDir,'ui-state.json'),JSON.stringify({version:1,model:'gpt-6-luna',
      legacyReset:true,rewardCatalogVersion:2,masteryCatalogVersion:2,companionLevelVersion:2,
      companionChosen:true,cosmetics:{portrait:'portrait-snake-base'},archives,session:null,theme:'dark',
      audio:{muted:true,musicEnabled:false,effectsEnabled:false,musicVolume:.22,effectsVolume:.45,musicTrack:'funk'}}));
    backend=createApp({root,dataDir,ai:smokeAI,authCheck:async()=>({available:true}),random:()=>.3});await backend.ready;
    await new Promise(resolve=>backend.server.listen(0,'127.0.0.1',resolve));
    win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    const errors=[];win.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
    const run=async source=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{${source}}catch(error){return {testError:error.stack}}})()`);if(result?.testError)throw Error(result.testError);return result;};
    await win.loadURL('http://127.0.0.1:'+backend.server.address().port);
    await run(`await new Promise((resolve,reject)=>{const check=()=>{if(state?.game?.battlepass){o.disconnect();clearTimeout(timer);resolve();}};const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{o.disconnect();reject(Error('UI not ready'));},10000);check();});`);
    const kinds=['scene','aura','trail','banner','finisher'];
    async function click(selector,check){await run(`const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled)throw Error('Control missing: '+${JSON.stringify(selector)});button.click();await new Promise((resolve,reject)=>{const check=()=>{if(!progressionBusy&&!pending&&(${check})){o.disconnect();clearTimeout(timer);resolve();}};const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{o.disconnect();reject(Error('Selection not saved'));},6000);check();});`);}
    await run(`profileTab='extras';navigate('profile');if(state.game.battlepass.rewardCount!==80||state.game.arcane.passEarned!==1750)throw Error('Pass data incomplete');`);
    let equipped=0;
    for(const kind of kinds)for(let variant=1;variant<=4;variant++){
      await click(`[data-progression-equip="${kind}"][data-reward-id="pass-${kind}-${variant}"]`,`state.game.cosmetics.${kind}==='pass-${kind}-${variant}'`);equipped++;
    }
    await run(`if(!document.querySelector('.pass-profile-banner')||!document.querySelector('.profile-portrait .pass-companion-aura'))throw Error('Live banner/aura missing');`);
    await click('[data-pass-preview="pass-scene-4"]','!!document.querySelector(".pass-extra-preview")');
    await run(`document.querySelector('[data-pass-close]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(document.querySelector('.pass-extra-preview'))throw Error('Preview did not close');`);
    let screens=0;
    for(const width of [1440,850,480]){
      win.setSize(width,1000);
      for(const view of ['battlepass','profile','menu']){
        await run(`progressionPassPage=9;profileTab='extras';navigate('${view}');main.scrollTop=0;
          await document.fonts.ready;await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
          for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();window.ArcaneFX?.clear();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          if(main.scrollWidth>main.clientWidth+1||document.documentElement.scrollWidth>innerWidth)throw Error('Overflow ${view}/${width}');
          if('${view}'==='battlepass'&&document.querySelectorAll('.pass-bonus-item').length!==4)throw Error('Bonus cards missing');
          if('${view}'==='menu'&&!document.querySelector('.pass-menu-backdrop.extra-tone-4'))throw Error('Scene not applied');
          if('${view}'==='profile')document.querySelector('.pass-extras-collection').scrollIntoView({block:'start',behavior:'instant'});
          if('${view}'==='battlepass')document.querySelector('.progression-tier-grid').scrollIntoView({block:'start',behavior:'instant'});
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
        fs.writeFileSync(path.join(output,view+'-'+width+'.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());screens++;
      }
    }
    await win.loadURL('http://127.0.0.1:'+backend.server.address().port+'/#profile');
    await run(`await new Promise((resolve,reject)=>{const check=()=>{if(state?.game?.cosmetics?.finisher==='pass-finisher-4'){clearTimeout(timer);o.disconnect();resolve();}};const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{o.disconnect();reject(Error('Reload lost selection'));},10000);check();});
      for(const kind of ${JSON.stringify(kinds)})if(state.game.cosmetics[kind]!=='pass-'+kind+'-4')throw Error('Persistence lost '+kind);
      if(document.querySelector('.pass-finisher-layer'))throw Error('Finisher played on reload');
      acceptState(await api('start',{mode:'career',level:6}));navigate('simulation');acceptState(await api('message',{message:'Abschluss prüfen'}));render();
      if(!document.querySelector('.pass-finisher-layer.finisher-4'))throw Error('Victory finisher missing');
      for(const a of document.querySelector('.pass-finisher-layer').getAnimations({subtree:true}))a.currentTime=650;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));`);
    fs.writeFileSync(path.join(output,'victory.png'),(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());screens++;
    await run(`PassExtrasFX.clear();profileTab='extras';navigate('profile');`);
    for(const kind of kinds)await click(`[data-pass-unequip="${kind}"]`,`state.game.cosmetics.${kind}===null`);
    await run(`navigate('menu');if(document.querySelector('.pass-menu-backdrop')||document.querySelector('.pass-companion-aura'))throw Error('Neutral style not restored');
      if(PassExtrasFX.status().motes||PassExtrasFX.status().finisher)throw Error('Idle particles leaked');`);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await run(`if(PassExtrasFX.burst(4,true))throw Error('Reduced motion ignored');`);
    assert.deepEqual(errors,[]);
    const result={ok:true,output,equipped,screens,passRewards:80,passDust:1750,persisted:true,neutralRestored:true,reducedMotion:true,rendererErrors:errors};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  }catch(error){console.error(error);if(win)fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());process.exitCode=1;}
  finally{win?.destroy();await backend?.close();app.exit(process.exitCode||0);}
});
