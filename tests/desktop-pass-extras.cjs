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
    const origin='http://127.0.0.1:'+backend.server.address().port;
    const strictCsp=require('./strict-csp.cjs');
    win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    strictCsp(win.webContents,origin);
    const errors=[];
    const run=async source=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{${source}}catch(error){return {testError:error.stack}}})()`);if(result?.testError)throw Error(result.testError);return result;};
    await win.loadURL(origin);
    await run(`await new Promise((resolve,reject)=>{const check=()=>{if(state?.game?.battlepass){o.disconnect();clearTimeout(timer);resolve();}};const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{o.disconnect();reject(Error('UI not ready'));},10000);check();});`);
    const cspProbe=await run(`const policy=await fetch(location.href).then(response=>response.headers.get('Content-Security-Policy'));
      const violations=[];const violation=new Promise(resolve=>{const listener=event=>{violations.push(event.violatedDirective);if(event.violatedDirective==='style-src-attr'){document.removeEventListener('securitypolicyviolation',listener);resolve();}};document.addEventListener('securitypolicyviolation',listener);setTimeout(resolve,1500);});
      const attr=document.createElement('i');attr.setAttribute('style','--csp-attr-probe:13px');document.body.append(attr);
      const cssom=document.createElement('i');cssom.style.setProperty('--csp-cssom-probe','29px');document.body.append(cssom);await violation;
      const result={policy,styleAttribute:attr.getAttribute('style'),attributeValue:getComputedStyle(attr).getPropertyValue('--csp-attr-probe').trim(),cssomAttribute:cssom.getAttribute('style'),cssomValue:getComputedStyle(cssom).getPropertyValue('--csp-cssom-probe').trim(),violations};attr.remove();cssom.remove();return result;`);
    console.log('CSP inline-style probe',JSON.stringify(cspProbe));
    assert.match(cspProbe.policy,/style-src 'self'/);assert.doesNotMatch(cspProbe.policy,/unsafe-inline/);
    assert.equal(cspProbe.attributeValue,'','Strict CSP unexpectedly applied a style attribute');
    assert.equal(cspProbe.cssomValue,'29px','CSSOM style properties should remain usable under the strict policy');
    assert.ok(cspProbe.violations.includes('style-src-attr'),'Style attribute probe did not trigger the enforced policy');
    win.webContents.on('console-message',({level,message})=>{if(level==='error'&&!strictCsp.isBlockedExternalInjection(message))errors.push(message);});
    const kinds=['scene','aura','trail','banner','finisher'];
    async function click(selector,check){await run(`const button=document.querySelector(${JSON.stringify(selector)});if(!button||button.disabled)throw Error('Control missing: '+${JSON.stringify(selector)});button.click();await new Promise((resolve,reject)=>{const check=()=>{if(!progressionBusy&&!pending&&(${check})){o.disconnect();clearTimeout(timer);resolve();}};const o=new MutationObserver(check);o.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{o.disconnect();reject(Error('Selection not saved'));},6000);check();});`);}
    await run(`profileTab='extras';navigate('profile');if(state.game.battlepass.rewardCount!==80||state.game.arcane.passEarned!==1750)throw Error('Pass data incomplete');`);
    let equipped=0;
    for(const kind of kinds)for(let variant=1;variant<=4;variant++){
      await click(`[data-progression-equip="${kind}"][data-reward-id="pass-${kind}-${variant}"]`,`state.game.cosmetics.${kind}==='pass-${kind}-${variant}'`);equipped++;
    }
    await run(`profileTab='extras';currentView='profile';render();`);
    await run(`if(!document.querySelector('.pass-profile-banner')||!document.querySelector('.profile-portrait .pass-companion-aura'))throw Error('Live banner/aura missing');`);
    const liveAura=await run(`const aura=document.querySelector('.profile-portrait .pass-companion-aura'),particles=[...aura.querySelectorAll('i')];return {count:particles.length,inline:particles.filter(p=>p.hasAttribute('style')).length,width:aura.clientWidth,height:aura.clientHeight,first:[parseFloat(getComputedStyle(particles[0]).left),parseFloat(getComputedStyle(particles[0]).top)],last:[parseFloat(getComputedStyle(particles[7]).left),parseFloat(getComputedStyle(particles[7]).top)]};`);
    assert.equal(liveAura.count,8);assert.equal(liveAura.inline,0);
    assert.ok(Math.abs(liveAura.first[0]-liveAura.width*.05)<1&&Math.abs(liveAura.first[1]-liveAura.height*.1)<1,'First aura particle positioning missing');
    assert.ok(Math.abs(liveAura.last[0]-liveAura.width*.93)<1&&Math.abs(liveAura.last[1]-liveAura.height*.79)<1,'Last aura particle positioning missing');
    await click('[data-pass-preview="pass-aura-4"]','!!document.querySelector(".pass-extra-preview")');
    const previewParticles=await run(`const art=document.querySelector('.pass-extra-preview .pass-extra-art'),particles=[...art.querySelectorAll('i')];
      return {count:particles.length,inline:particles.filter(p=>p.hasAttribute('style')).length,width:art.clientWidth,height:art.clientHeight,first:[parseFloat(getComputedStyle(particles[0]).left),parseFloat(getComputedStyle(particles[0]).top)],last:[parseFloat(getComputedStyle(particles[7]).left),parseFloat(getComputedStyle(particles[7]).top)]};`);
    assert.equal(previewParticles.count,8);assert.equal(previewParticles.inline,0);
    assert.ok(Math.abs(previewParticles.first[0]-previewParticles.width*.12)<1&&Math.abs(previewParticles.first[1]-previewParticles.height*.15)<1,'First preview particle positioning missing');
    assert.ok(Math.abs(previewParticles.last[0]-previewParticles.width*.87)<1&&Math.abs(previewParticles.last[1]-previewParticles.height*.70)<1,'Last preview particle positioning missing');
    await run(`document.querySelector('[data-pass-close]').click();if(document.querySelector('.pass-extra-preview'))throw Error('Preview did not close');`);
    await click('[data-pass-preview="pass-scene-4"]','!!document.querySelector(".pass-extra-preview")');
    await run(`document.querySelector('[data-pass-close]').click();if(document.querySelector('.pass-extra-preview'))throw Error('Preview did not close');`);
    let screens=0;
    for(const width of [1440,850,480]){
      win.setContentSize(width,960);
      for(const view of ['battlepass','profile','menu']){
        await run(`await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('Resize did not settle at ${width}px')),3000);const check=()=>{if(innerWidth===${width}){clearTimeout(deadline);resolve();}else requestAnimationFrame(check);};check();});progressionPassPage=9;profileTab='extras';navigate('${view}');main.scrollTop=0;
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
      const layer=document.querySelector('.pass-finisher-layer.finisher-4');if(!layer)throw Error('Victory finisher missing');
      const particles=[...layer.querySelectorAll('.finisher-particle')];if(particles.length!==24)throw Error('Finisher particle count mismatch');
      for(const index of [0,1,7,23]){const p=particles[index],style=getComputedStyle(p),x=(index*37)%100;if(style.getPropertyValue('--i').trim()!==String(index)||style.getPropertyValue('--x').trim()!==x+'%'||!style.getPropertyValue('--drift').trim()||Math.abs(parseFloat(style.left)-layer.clientWidth*x/100)>1)throw Error('Finisher CSSOM coordinates missing at '+index);}
      if(particles.some(p=>!p.hasAttribute('style')))throw Error('Finisher CSSOM particle styles missing');
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
  }catch(error){console.error(error);if(win)try{const capture=await Promise.race([win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Failure screenshot timed out')),2500))]);fs.writeFileSync(path.join(output,'failure.png'),capture.toPNG());}catch{}process.exitCode=1;}
  finally{win?.destroy();await backend?.close();app.exit(process.exitCode||0);}
});
