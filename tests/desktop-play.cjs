'use strict';
exports.chooseInitialCompanion = contents => contents.executeJavaScript(`(async()=>{
  if(state.game.companionChosen!==false) return {companion:state.game.companion?.activeId,level:state.game.companion?.current?.level,canSwitch:state.game.companion?.canSwitch};
  if(!document.querySelector('.companion-profile')) navigate('profile');
  const dragon=document.querySelector('[data-progression-equip="portrait"][data-reward-id="portrait-dragon-base"]');
  if(!dragon || dragon.disabled) throw Error('Drache für Pflichtauswahl fehlt oder ist gesperrt');
  dragon.click();
  await new Promise((resolve,reject)=>{
    const check=()=>{if(!pending&&!progressionBusy&&state.game.companionChosen===true&&state.game.companion?.activeId==='dragon'){clearTimeout(timer);observer.disconnect();resolve();}};
    const observer=new MutationObserver(check);observer.observe(document.body,{subtree:true,childList:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(Error('Pflicht-Begleiterwahl wurde nicht gespeichert'));},5000);check();
  });
  return {companion:state.game.companion.activeId,level:state.game.companion.current.level,canSwitch:state.game.companion.canSwitch};
})()`);

exports.checkSelection = async contents => {
  const chosen=await exports.chooseInitialCompanion(contents);
  if(chosen.companion!=='dragon'||chosen.level!==1||chosen.canSwitch)throw Error('Initialer Drache oder Maximalstufen-Sperre fehlerhaft');
  return contents.executeJavaScript(`(async()=>{
  navigate('speedrun');
  const level=document.querySelector('[name="level"][value="6"]');level.click();
  const duration=document.querySelector('[name="duration"][value="120"]');duration.click();
  const values=new FormData(document.querySelector('#speedrun-form'));
  if(values.get('level')!=='6'||values.get('duration')!=='120'||!document.querySelector('#difficulty-preview').textContent.includes('Infrastruktur'))throw Error('Auswahlkarten nicht mit Spielmodus verbunden');
  navigate('menu');navigate('speedrun');
  if(!document.querySelector('[name="level"][value="6"]').checked||!document.querySelector('[name="duration"][value="120"]').checked)throw Error('Auswahl geht beim Menüwechsel verloren');
  if(state.game.ranked.level!==1||state.game.ranked.rr!==0)throw Error('Rang wird nicht ausschließlich aus Karriereergebnissen berechnet');
  await start();
  const before=JSON.stringify(state.session);
  const form=document.querySelector('#message-form'), input=document.querySelector('#message');
  if(form.querySelectorAll('button').length!==1||form.querySelector('[data-tactic]'))throw Error('Überflüssige Aktionsauswahl vorhanden');
  input.value='Eigener sicherer Prüfauftrag';input.dispatchEvent(new Event('input',{bubbles:true}));
  if(draft!==input.value||JSON.stringify(state.session)!==before)throw Error('Direkte Eingabe wird nicht als Entwurf gespeichert');
  navigate('menu');navigate('simulation');
  if(document.querySelector('#message').value!=='Eigener sicherer Prüfauftrag')throw Error('Entwurf geht beim Menüwechsel verloren');
  draft='';document.querySelector('#message').value='';
  return {levelCards:true,durationCards:true,directInput:true,noPrematureAction:true,draftPreserved:true};
})()`);
};

exports.waitForResult = contents => contents.executeJavaScript(`new Promise((resolve,reject)=>{
  const check=()=>{
    const card=document.querySelector('.result-settled');if(!card)return false;
    for(const node of card.querySelectorAll('[data-count]'))if(node.textContent!==node.dataset.count)throw Error('Zähler endet bei falschem Wert');
    resolve({score:state.game.latest.score,xp:state.game.xp});return true;
  };
  const observer=new MutationObserver(()=>{if(check()){observer.disconnect();clearTimeout(timer);}});
  const timer=setTimeout(()=>{observer.disconnect();reject(Error('Ergebnisanimation endet nicht'));},7000);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true});
  if(check()){observer.disconnect();clearTimeout(timer);}
})`);

exports.checkReducedMotion = contents => contents.executeJavaScript(`(()=>{
  const original=window.matchMedia,before=JSON.stringify(state.game);
  try{
    window.matchMedia=query=>query==='(prefers-reduced-motion: reduce)'?{matches:true}:original.call(window,query);
    presentedResults.delete(state.session.id);render();
    const card=document.querySelector('.result-screen');
    if(!card.classList.contains('result-settled')||card.classList.contains('result-animate'))throw Error('Reduzierte Bewegung wird ignoriert');
    for(const node of card.querySelectorAll('[data-count]'))if(node.textContent!==node.dataset.count)throw Error('Reduzierte Bewegung zeigt falsche Punkte');
    if(JSON.stringify(state.game)!==before)throw Error('Animation verändert gespeicherte XP');
    return {reducedMotion:true,scoreAnimationSettles:true,noDuplicateXp:true};
  }finally{window.matchMedia=original;}
})()`);
