'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { progression } = require('../server/progression');

module.exports = async (win, directory, painted) => {
  const contents = win.webContents;
  const bounded = (promise, label, milliseconds = 12000) => Promise.race([promise, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Error(`${label} dauerte zu lange`)), milliseconds);
    promise.then(() => clearTimeout(timer), () => clearTimeout(timer));
  })]);
  const capture = async () => (await contents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG();
  const check = await contents.executeJavaScript(`(async()=>{
    navigate('missions');
    if(state.game.challenges.permanent.length<100||state.game.masteries.length<11)throw Error('Missionskatalog fehlt');
    document.querySelector('[data-progression-tab="permanent"]').click();
    const search=document.querySelector('#progression-search');search.focus();
    for(const letter of 'DNS'){search.value+=letter;search.dispatchEvent(new Event('input',{bubbles:true}));if(document.activeElement!==search)throw Error('Suche verliert Fokus');}
    if(!document.querySelector('.progression-permanent-grid').textContent.includes('DNS'))throw Error('Missionssuche ohne Treffer');
    progressionQuery='';
    navigate('profile');
    const button=document.querySelector('[data-reward-id="portrait-dragon-base"]');
    if(!button||!button.disabled||state.game.companion?.activeId!=='dragon')throw Error('Aktiver Drache wird in der Sammlung nicht korrekt gebunden');
    const wolf=document.querySelector('[data-reward-id="portrait-wolf-base"]');
    if(!wolf||!wolf.disabled||state.game.companion?.current?.level!==1||state.game.companion?.canSwitch)throw Error('Tierartwechsel vor Begleiterstufe 20 nicht gesperrt');
    const title=state.game.inventory.find(item=>item.kind==='title'&&item.id!=='title-rookie');
    if(!title)throw Error('Titelbelohnung fehlt nach erfolgreichem Ticket');
    const badge=state.game.inventory.find(item=>item.kind==='badge'&&item.id!=='badge-recruit');
    const waitFor = predicate => new Promise((resolve,reject)=>{
      const check=()=>{if(predicate()&&!pending&&!progressionBusy){clearTimeout(timer);observer.disconnect();resolve();}};
      const observer=new MutationObserver(check);observer.observe(document.body,{subtree:true,childList:true,attributes:true});
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('Profilkosmetik wurde nicht automatisch gespeichert'));},5000);check();
    });
    document.querySelector('[data-profile-tab="title"]').click();
    const titleButton=document.querySelector('[data-reward-id="'+title.id+'"]');
    if(!titleButton)throw Error('Profil-Titelauswahl fehlt');
    titleButton.click();
    await waitFor(()=>state.game.cosmetics.title===title.id);
    if(badge){
      document.querySelector('[data-profile-tab="badge"]').click();
      const badgeButton=document.querySelector('[data-reward-id="'+badge.id+'"]');
      if(!badgeButton)throw Error('Profil-Abzeichenauswahl fehlt');
      badgeButton.click();
      await waitFor(()=>state.game.cosmetics.badge===badge.id);
    }
    document.querySelector('[data-profile-tab="portrait"]').click();
    if(document.querySelector('#progression-species-filter').value!=='dragon')throw Error('Formauswahl filtert nicht auf aktiven Begleiter');
    const filter=document.querySelector('#profile-reward-status'); filter.value='locked'; filter.dispatchEvent(new Event('change',{bubbles:true}));
    const species=document.querySelector('#progression-species-filter');species.value='fox';species.dispatchEvent(new Event('change',{bubbles:true}));
    const unlock=document.querySelector('[data-unlock-pass]');
    if(!unlock)throw Error('Battlepass-Freischaltweg fehlt');
    const targetLevel=Number(unlock.dataset.unlockPass);unlock.click();
    if(currentView!=='battlepass'||!document.querySelector('.progression-tier-heading').textContent.includes('Stufen '+(Math.floor((targetLevel-1)/4)*4+1)))throw Error('Freischaltweg führt nicht zur richtigen Battlepassseite');
    navigate('profile');document.querySelector('[data-profile-tab="portrait"]').click();
    const masteryLink=document.querySelector('[data-unlock-mastery]');
    if(!masteryLink)throw Error('Meisterungs-Freischaltweg fehlt');
    const masteryId=masteryLink.dataset.unlockMastery;masteryLink.click();
    if(currentView!=='mastery'||document.activeElement.id!=='mastery-'+masteryId)throw Error('Meisterungsziel nicht fokussiert');
    progressionCollectionStatus='owned';profileTab='companions';
    return {titleId:title.id,title:title.name,badgeId:badge?.id||null,portrait:state.game.cosmetics.portrait,missions:state.game.challenges.permanent.length};
  })()`);
  await win.loadURL(new URL('/#profile', contents.getURL()).href);
  await contents.executeJavaScript(`new Promise((resolve,reject)=>{
    const check=()=>{if(document.querySelector('.companion-profile')){clearTimeout(timer);observer.disconnect();resolve();}};
    const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(Error('Profil fehlt nach Reload'));},5000);check();
  })`);
  await contents.executeJavaScript(`(()=>{
    if(state.game.cosmetics.title!==${JSON.stringify(check.titleId)}||state.game.companion?.activeId!=='dragon'||state.game.companion?.current?.level!==1)throw Error('Profilwahl oder Begleiterstatus nach Reload verloren');
    ${check.badgeId ? `if(state.game.cosmetics.badge!==${JSON.stringify(check.badgeId)})throw Error('Abzeichenauswahl nach Reload verloren');` : ''}
  })()`);
  const passPages=await contents.executeJavaScript(`(()=>{
    navigate('battlepass');
    if(state.game.battlepass.tiers.some(t=>t.reward.frame||(t.reward.kind==='portrait'&&t.reward.variant!=='base')))throw Error('Rahmen im Battlepass');
    const go=page=>{const button=document.querySelector('[data-pass-page="'+page+'"]');if(!button||button.disabled)throw Error('Einsatzpassseite '+page+' fehlt');button.click();};
    go(0);if(document.querySelectorAll('.progression-tier-grid .progression-tier').length!==4||!document.querySelector('.progression-tier-heading').textContent.includes('Stufen 1–4'))throw Error('Einsatzpassseite 1 zeigt nicht vier Karten');
    go(9);if(document.querySelectorAll('.progression-tier-grid .progression-tier').length!==4||!document.querySelector('.progression-tier-heading').textContent.includes('Stufen 37–40'))throw Error('Einsatzpassseite 10 zeigt nicht vier Karten');
    document.querySelector('[data-pass-page="3"]').click();if(!document.querySelector('.progression-tier-heading').textContent.includes('Stufen 13–16'))throw Error('Direkte Seitennavigation funktioniert nicht');
    return {firstPage:true,lastPage:true,directPage:true};
  })()`);
  await win.loadURL(new URL('/#missions', contents.getURL()).href);
  await contents.executeJavaScript(`new Promise((resolve,reject)=>{
    const check=()=>{if(document.querySelector('.progression-hub')){clearTimeout(timer);observer.disconnect();resolve();}};
    const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(Error('Karriere nach Reload fehlt'));},5000);check();
  })`);
  await contents.executeJavaScript(`(()=>{
    if(state.game.cosmetics.title!==${JSON.stringify(check.titleId)}||state.game.cosmetics.portrait!=='portrait-dragon-base')throw Error('Profilauswahl nach Reload verloren');
    if(!document.querySelector('.play-profile').textContent.includes(${JSON.stringify(check.title)}))throw Error('Titel wird im Profil nicht angezeigt');
  })()`);
  await contents.executeJavaScript(`(async()=>{
    if(state.game.characters.length!==9)throw Error('Charaktervarianten fehlen');
    for(const character of state.game.characters.filter(c=>!c.secret||c.unlocked))for(const source of [character.baseImage,character.lordImage]){
      const image=new Image();image.src=source;await image.decode();if(!image.naturalWidth)throw Error('Charakterbild fehlt: '+source);
    }
  })()`);
  for (const width of [1440, 850]) {
    win.setSize(width, 960);
    for (const view of ['missions', 'battlepass', 'mastery', 'profile']) {
      await contents.executeJavaScript(`navigate('${view}');window.scrollTo(0,0);`);
      await bounded(contents.executeJavaScript(`(async()=>{
        await Promise.all([...document.querySelectorAll('#main img')].map(img=>{img.loading='eager';return img.decode();}));
        if(document.body.dataset.screen!=='${view}')throw Error('Ansicht wurde nicht gerendert: ${view}');
        if('${view}'==='profile'&&!document.querySelector('.companion-profile'))throw Error('Profilinhalt fehlt');
        if('${view}'==='battlepass'&&!document.querySelector('.pass-paged'))throw Error('Battlepassinhalt fehlt');
        if('${view}'==='mastery'){
          if(!document.querySelector('.progression-mastery'))throw Error('Meisterungsinhalt fehlt');
          for(const tier of ['lord','silver','gold','eternal','astral'])if(document.querySelectorAll('#mastery-forms .tier-'+tier).length!==1)throw Error('Form doppelt oder fehlt: '+tier);
          if(document.querySelector('.progression-mastery .eternal-mastery'))throw Error('Formen weiterhin doppelt in Fachgebieten');
          if(!document.querySelector('.progression-mastery .mastery-animal-portrait img')||!document.querySelector('.mastery-animals img'))throw Error('Tierporträts in Meisterung fehlen');
          for(const name of state.game.characters.filter(c=>!c.secret||c.unlocked).map(c=>c.name))if(!document.querySelector('#main').textContent.includes(name))throw Error('Bonusbegleiter fehlt: '+name);
        }
        if('${view}'==='missions'&&!document.querySelector('.progression-hub'))throw Error('Missionsinhalt fehlt');
        if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Ansicht läuft über: ${view}/${width}');
        if(document.querySelector('[data-progression-tab="collection"]'))throw Error('Sammlung bleibt im Missionsbereich');
        const profile=document.querySelector('#play-header [data-view="profile"]');
        if(!profile||profile.getBoundingClientRect().width===0)throw Error('Profil oben rechts fehlt');
      })()`), `Bilder und Ansichtsprüfung ${view}/${width}`);
      await painted();
      fs.writeFileSync(path.join(directory, `progression-${view}-${width}.png`), await capture());
      if(view === 'mastery') {
        await contents.executeJavaScript(`document.querySelector('#mastery-forms .tier-eternal').scrollIntoView({block:'center',behavior:'instant'});
          for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();`);
        await bounded(painted(), 'Eindeutige Formen-Vorschau');
        fs.writeFileSync(path.join(directory, `unique-companion-forms-${width}.png`), await capture());
      }
    }
  }
  const fixture = progression(Array.from({ length: 50 }, (_, i) => ({ id: `lord-fixture-${i}`, mode: 'career', level: 5,
    completedAt: new Date().toISOString(), scenarioIds: ['site-vpn-dns'], elapsed: 12, reference: 20,
    companionReward:{version:1,characterId:'dragon',xp:150},
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } })));
  fixture.cosmetics = { portrait: 'portrait-dragon-lord', title: 'title-lord-dns', badge: 'badge-lord-dns' };
  win.setSize(1440, 960);
  await bounded(contents.executeJavaScript(`state.game=${JSON.stringify(fixture)};progressionMasterySpecies='dragon';navigate('mastery');window.scrollTo(0,0);`), 'Render des Lord-Teststands');
  await bounded(contents.executeJavaScript(`Promise.all([...document.querySelectorAll('#main img')].map(img=>{img.loading='eager';return img.decode();}))`), 'Lord-Vorschaubilder');
  await bounded(painted(), 'Lord-Vorschau-Frame');
  fs.writeFileSync(path.join(directory, 'progression-lord-fixture.png'), await capture());
  const gold = progression(Array.from({ length: 200 }, (_, i) => ({ id: `gold-fixture-${i}`, mode: 'career', level: 5,
    completedAt: new Date().toISOString(), scenarioIds: ['site-vpn-dns'], elapsed: 12, reference: 20,
    companionReward:{version:1,characterId:'dragon-frost',xp:150},
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } })));
  gold.cosmetics = { portrait: 'portrait-dragon-frost-lord-gold', title: 'title-lord-dns', badge: 'badge-lord-dns-gold' };
  await bounded(contents.executeJavaScript(`state.game=${JSON.stringify(gold)};progressionMasterySpecies='dragon-frost';navigate('mastery');window.scrollTo(0,0);`), 'Render des Gold-Teststands');
  await bounded(contents.executeJavaScript(`(async()=>{
    await Promise.all([...document.querySelectorAll('#main img')].map(img=>{img.loading='eager';return img.decode();}));
    if(!document.querySelector('.play-profile .frame-gold')||!document.querySelector('.play-profile .mastery-badge-gold'))throw Error('Goldrahmen oder Goldabzeichen fehlt');
    if(document.querySelector('.progression-mastery').querySelectorAll('.mastery-badge-preview.earned').length!==3)throw Error('Drei Meisterschaftsabzeichen fehlen');
    progressionCollectionKind='portrait';
  })()`), 'Gold-Vorschau');
  await bounded(painted(), 'Gold-Vorschau-Frame');
  fs.writeFileSync(path.join(directory, 'progression-gold-fixture.png'), await capture());
  const eternal = progression(Array.from({ length: 1000 }, (_, i) => ({ id: `eternal-fixture-${i}`, mode: 'career', level: 5,
    completedAt: new Date().toISOString(), scenarioIds: ['site-vpn-dns'], elapsed: 12, reference: 20,
    companionReward:{version:1,characterId:'dragon-frost',xp:150},
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } })));
  eternal.cosmetics = { portrait: 'portrait-dragon-frost-lord-eternal', title: 'title-lord-dns', badge: 'badge-lord-dns-gold' };
  await bounded(contents.executeJavaScript(`state.game=${JSON.stringify(eternal)};navigate('profile');window.scrollTo(0,0);`), 'Render des Ewiger-Lord-Teststands');
  await bounded(contents.executeJavaScript(`(async()=>{
    await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
    const hero=document.querySelector('.profile-portrait .frame-eternal');
    if(!hero||!hero.querySelector('.eternal-frame-effect'))throw Error('Ewiger Rahmen fehlt im Profil');
    if(!document.querySelector('#companion-dock .frame-eternal'))throw Error('Ewiger Rahmen fehlt im Begleiterdock');
    const current=hero.querySelector('.eternal-current');
    if(getComputedStyle(current).animationName!=='eternal-orbit')throw Error('Ewiger Rahmen ist nicht animiert');
    const orbit=current.getAnimations().find(animation=>animation.animationName==='eternal-orbit');
    if(!orbit||orbit.playState!=='running')throw Error('Energiebahn läuft nicht');
    // Hidden smoke windows do not reliably advance the compositor clock.
    // Sample the real CSS animation at two explicit times instead.
    orbit.currentTime=0;
    const a=getComputedStyle(current).strokeDashoffset;
    orbit.currentTime=1000;
    if(getComputedStyle(current).strokeDashoffset===a)throw Error('Energiebahn bewegt sich nicht');
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Ewiges Profil läuft über');
  })()`), 'Ewiger Rahmen und Animation');
  await bounded(painted(), 'Ewiger Profil-Frame');
  fs.writeFileSync(path.join(directory, 'progression-eternal-profile.png'), await capture());
  for(const width of [1440,850]){
    win.setSize(width,960);
    await contents.executeJavaScript(`navigate('mastery');window.scrollTo(0,0);
      if(document.querySelectorAll('#mastery-dns .mastery-badge-preview.earned').length!==3)throw Error('Ewiger Lord verändert die drei Abzeichen');
      if(!document.querySelector('#mastery-forms .tier-eternal.earned'))throw Error('Ewiger Meisterungsrahmen fehlt');
      if(!document.querySelector('.progression-mastery .mastery-animal-portrait img'))throw Error('Eigenes Tierporträt fehlt');
      if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Ewige Meisterung läuft über');`);
    await bounded(painted(), 'Ewiger Meisterungs-Frame');
    fs.writeFileSync(path.join(directory, 'progression-eternal-mastery-'+width+'.png'), await capture());
  }
  const astral = progression(Array.from({ length: 2500 }, (_, i) => ({ id: `astral-fixture-${i}`, mode: 'career', level: 5,
    completedAt: new Date().toISOString(), scenarioIds: ['site-vpn-dns'], elapsed: 12, reference: 20,
    companionReward:{version:1,characterId:'dragon-frost',xp:150},
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } })));
  astral.cosmetics = { portrait: 'portrait-dragon-frost-lord-astral', title: 'title-lord-dns', badge: 'badge-lord-dns-gold' };
  win.setSize(1440,960);
  await bounded(contents.executeJavaScript(`state.game=${JSON.stringify(astral)};navigate('profile');window.scrollTo(0,0);`), 'Render des Astral-Lord-Teststands');
  await bounded(contents.executeJavaScript(`(async()=>{
    await Promise.all([...document.querySelectorAll('img')].map(img=>{img.loading='eager';return img.decode();}));
    const hero=document.querySelector('.profile-portrait .frame-astral');
    if(!hero||!hero.querySelector('.astral-halo')||!hero.querySelector('.astral-light-sweep'))throw Error('Astral-Effekte fehlen');
    const img=hero.querySelector('img');
    if(getComputedStyle(img).animationName!=='creature-astral')throw Error('Astral-Portrait bewegt sich nicht');
    const float=img.getAnimations().find(animation=>animation.animationName==='creature-astral');
    if(!float||float.playState!=='running')throw Error('Astral-Portraitanimation läuft nicht');
    float.currentTime=0;
    const before=getComputedStyle(img).transform;
    float.currentTime=3500;
    if(getComputedStyle(img).transform===before)throw Error('Astral-Portraitanimation steht still');
    if(!document.querySelector('#companion-dock .frame-astral'))throw Error('Astral-Portrait fehlt im Dock');
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Astral-Profil läuft über');
  })()`), 'Astral-Portraitanimation');
  await bounded(painted(), 'Astral Profil-Frame');
  fs.writeFileSync(path.join(directory, 'progression-astral-profile.png'), await capture());
  win.setSize(850,960);
  await contents.executeJavaScript(`navigate('mastery');window.scrollTo(0,0);
    if(!document.querySelector('#mastery-forms .tier-astral.earned'))throw Error('Astral-Meisterung nicht freigeschaltet');
    if(document.querySelectorAll('#mastery-dns .mastery-badge-preview').length!==3)throw Error('Astral verändert die drei Badges');
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)throw Error('Astral-Meisterung läuft über');`);
  const sharedMediaSession = contents.debugger.isAttached();
  if (!sharedMediaSession) contents.debugger.attach('1.3');
  try {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await contents.executeJavaScript(`if([...document.querySelectorAll('.eternal-current,.eternal-counter,.eternal-crystals,.eternal-spark,.frame-eternal,.frame-astral,.frame-astral>img,.eternal-preview-core,.astral-halo,.astral-light-sweep')].some(el=>getComputedStyle(el).animationName!=='none'))throw Error('Reduzierte Bewegung wird bei Prestige-Effekten ignoriert');`);
  } finally {
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: sharedMediaSession ? [{ name: 'prefers-reduced-motion', value: 'no-preference' }] : [] });
    if (!sharedMediaSession) contents.debugger.detach();
  }
  const passEffects=await require('./desktop-pass.cjs')(win,directory,painted);
  const snakeEffects=await require('./desktop-snake.cjs')(win,directory,painted);
  await contents.executeJavaScript(`refresh()`);
  return { ...check, ...passEffects, ...snakeEffects, passPages, selectionPersists: true, responsiveTabs: 12, lordPreview: true, goldPreview: true, eternalPreview: true, eternalAnimation: true, eternalReducedMotion: true, astralPortraitAnimation: true, characterImages: 16 };
};
