'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { progression } = require('../server/progression');

module.exports = async (win, directory, painted) => {
  const contents = win.webContents;
  const fixture = progression(Array.from({length:2500},(_,i)=>({id:`snake-${i}`,mode:'career',level:5,
    scenarioIds:['site-vpn-dns'],companionReward:{version:1,characterId:'snake',xp:150},
    summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}})));
  fixture.cosmetics={portrait:'portrait-snake-lord-eternal',title:'title-lord-dns',badge:'badge-lord-dns-gold'};
  await contents.executeJavaScript(`state.game=${JSON.stringify(fixture)};progressionMasterySpecies='snake';`);
  for(const width of [1440,850]) {
    win.setSize(width,960);
    for(const tier of ['eternal','astral']) {
      await contents.executeJavaScript(`state.game.cosmetics.portrait='portrait-snake-lord-${tier}';navigate('profile');window.scrollTo(0,0);`);
      await contents.executeJavaScript(`(async()=>{
        await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
        for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();
        const frame=document.querySelector('.profile-portrait .breakout-snake'), creature=frame?.querySelector('.portrait-creature'),bg=frame?.querySelector('.portrait-scene-background');
        if(!creature||!bg)throw Error('Getrennte Schlangenebenen fehlen');
        const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;
        const sheet=creature.querySelector('img'),css=getComputedStyle(creature);
        const col=Number(css.getPropertyValue('--sprite-col')),row=Number(css.getPropertyValue('--sprite-row')),rows=Number(css.getPropertyValue('--sprite-rows'));
        const cellWidth=sheet.naturalWidth/2,cellHeight=sheet.naturalHeight/rows;
        const ctx=canvas.getContext('2d');ctx.drawImage(sheet,col*cellWidth+cellWidth*.04,row*cellHeight,cellWidth*.92,cellHeight,0,0,100,100);
        const pixels=ctx.getImageData(0,0,100,100).data;let transparent=0,solid=0;
        for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>240)solid++;}
        if(transparent<1000||solid<1000)throw Error('Schlange ist nicht sauber freigestellt: '+JSON.stringify({transparent,solid,width:${width},tier:'${tier}',col,row,rows,source:sheet.currentSrc,naturalWidth:sheet.naturalWidth,naturalHeight:sheet.naturalHeight,complete:sheet.complete,contextLost:ctx.isContextLost?.(),colorSpace:ctx.getContextAttributes?.().colorSpace}));
        if(creature.getBoundingClientRect().top>=frame.getBoundingClientRect().top-8)throw Error('Schlange ragt nicht über den Rahmen');
        if(getComputedStyle(frame).overflowY!=='visible')throw Error('Rahmen schneidet den Kopf ab');
        const motion=creature.getAnimations().find(a=>a.animationName.startsWith('creature-'));
        if('${tier}'==='eternal') {
          if(motion||css.animationName!=='none'||css.transform!=='none')throw Error('Ewige Schlange muss statisch bleiben');
        } else if(!motion||motion.playState!=='running')throw Error('Astrale Schlange bewegt sich nicht');
        const bgBefore=bg.getBoundingClientRect().toJSON();
        if(motion){motion.currentTime=0;const before=getComputedStyle(creature).transform;motion.currentTime=3000;
          if(before===getComputedStyle(creature).transform)throw Error('Astrale Schlangenbewegung unverändert');}
        if(bg.getAnimations({subtree:true}).length||getComputedStyle(bg).transform!=='none'||JSON.stringify(bgBefore)!==JSON.stringify(bg.getBoundingClientRect().toJSON()))throw Error('Hintergrund bewegt sich mit');
        if(!document.querySelector('#companion-dock .breakout-snake .portrait-creature'))throw Error('Freistellung fehlt im Dock');
        const dock=document.querySelector('#companion-dock');if(dock.scrollWidth>dock.clientWidth)throw Error('Schlange erzeugt horizontalen Dock-Scrollbalken');
        if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Schlange verursacht Überlauf');
      })()`);
      await painted();
      fs.writeFileSync(path.join(directory,`snake-${tier}-profile-${width}.png`),(await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    }
  }
  await contents.executeJavaScript(`navigate('mastery');document.querySelector('#mastery-forms .tier-eternal').scrollIntoView({block:'center',behavior:'instant'});
    for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish();`);
  await contents.executeJavaScript(`Promise.all([...document.querySelectorAll('#main img')].map(img=>{img.loading='eager';return img.decode();}))`);
  await painted();
  fs.writeFileSync(path.join(directory,'snake-mastery.png'),(await contents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
  const sharedMediaSession=contents.debugger.isAttached();
  if(!sharedMediaSession)contents.debugger.attach('1.3');
  try {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await contents.executeJavaScript(`if([...document.querySelectorAll('.portrait-creature')].some(el=>getComputedStyle(el).animationName!=='none'))throw Error('Schlange ignoriert reduzierte Bewegung');`);
  } finally {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:sharedMediaSession?[{name:'prefers-reduced-motion',value:'no-preference'}]:[]});
    if(!sharedMediaSession)contents.debugger.detach();
  }
  return {snakeBreakout:true,separateStaticBackground:true,transparentSnake:true};
};
