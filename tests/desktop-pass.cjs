'use strict';
const fs=require('node:fs');
const path=require('node:path');
module.exports=async(win,directory,painted)=>{
 const contents=win.webContents;
 for(const width of [1440,850]){
  win.setSize(width,960);
  await contents.executeJavaScript(`(()=>{progressionPassPage=9;navigate('battlepass');window.scrollTo(0,0);
   if(document.querySelectorAll('.progression-tier').length!==4)throw Error('Pass finale missing');
   if(!document.querySelector('.emblem-singularity')||!document.querySelector('.pass-reward-mythic .title-mythic'))throw Error('Final trophies missing');
   if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Final pass overflows');
   const orbit=document.querySelector('.emblem-singularity .em-orbit'), animation=orbit.getAnimations().find(a=>a.animationName==='emblem-orbit');
   if(!animation||animation.playState!=='running')throw Error('Badge orbit inactive');
   animation.currentTime=0;const before=getComputedStyle(orbit).transform;animation.currentTime=4000;
   if(before===getComputedStyle(orbit).transform)throw Error('Badge orbit does not move');
   const title=document.querySelector('.pass-reward-mythic .reward-title'),shine=title.getAnimations().find(a=>a.animationName==='title-lustre');
   if(!shine||shine.playState!=='running')throw Error('Title shine inactive');
   shine.currentTime=0;const color=getComputedStyle(title).backgroundPosition;shine.currentTime=2500;
   if(color===getComputedStyle(title).backgroundPosition)throw Error('Title shine does not move');})()`);
  await painted();
  fs.writeFileSync(path.join(directory,'pass-finale-'+width+'.png'),(await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 }
 win.setSize(1440,960);
 await contents.executeJavaScript(`state.game.cosmetics.title='title-pass-40';state.game.cosmetics.badge='badge-pass-39';profileTab='badge';progressionCollectionStatus='owned';navigate('profile');window.scrollTo(0,0);
  if(!document.querySelector('.profile-equipped .title-mythic')||!document.querySelector('.profile-equipped .emblem-singularity'))throw Error('Equipped trophy effects missing');
  if(!document.querySelector('.profile-quick .title-mythic')||!document.querySelector('.profile-quick .emblem-singularity'))throw Error('Header trophy effects missing');`);
 await painted();
 fs.writeFileSync(path.join(directory,'pass-equipped.png'),(await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
 const sharedMediaSession=contents.debugger.isAttached();
 if(!sharedMediaSession)contents.debugger.attach('1.3');
 try{
  await contents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await contents.executeJavaScript(`if([...document.querySelectorAll('.reward-title,.em-orbit,.em-symbol')].some(el=>getComputedStyle(el).animationName!=='none'))throw Error('Trophies ignore reduced motion');`);
 }finally{
  await contents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:sharedMediaSession?[{name:'prefers-reduced-motion',value:'no-preference'}]:[]});
  if(!sharedMediaSession)contents.debugger.detach();
 }
 return {passEmblems:true,equippedEffects:true,passReducedMotion:true};
};
