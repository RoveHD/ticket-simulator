'use strict';

const passExtraLabels = { scene: 'Menükulissen', aura: 'Begleiterauren', trail: 'Cursor-Spuren', banner: 'Profilbanner', finisher: 'Sieges-Finisher' };
const passExtraSymbols = { scene: '⌂', aura: '✧', trail: 'ϟ', banner: '▰', finisher: '✦', currency: '✧' };
const passExtraColors = ['#69f5d2', '#8dbbff', '#ffb566', '#d8a1ff', '#f8e29c'];
function passExtraVariant(reward) { return Math.max(1, Math.min(5, Number(reward?.variant) || 1)); }
function passExtraCatalog() {
  const game=progressionGame();
  return [...(game.battlepass?.tiers||[]).flatMap(t=>t.rewards||[t.reward]),
    ...(game.arcane?.segments||[]).map(s=>s.reward),...(game.inventory||[])]
    .filter((r,i,all)=>r?.id&&all.findIndex(item=>item?.id===r.id)===i);
}
function passExtraSelected(kind) {
  const game = progressionGame();
  return (game.inventory || []).find(reward => reward.kind === kind && reward.id === game.cosmetics?.[kind]);
}
function passExtraScene(variant) {
  const buildings = variant === 1 ? [40,74,50,95,65,112,48,78,52] : variant === 2 ? [25,65,110,80,140,80,110,65,25] : variant === 3 ? [90,55,90,55,115,55,90,55,90] : [25,35,60,95,130,95,60,35,25];
  return `<svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path class="extra-sky" d="M0 0h320v180H0z"/><circle class="extra-moon" cx="${variant === 4 ? 160 : 252}" cy="${variant === 4 ? 60 : 42}" r="${variant === 4 ? 38 : 24}"/><path class="extra-grid" d="M0 140h320M0 155h320M0 174h320M160 140 20 180M160 140 100 180M160 140 220 180M160 140 300 180"/>${buildings.map((height,i) => `<path class="extra-building" d="M${i*36} 140v-${height}h24v${height}z"/><path class="extra-windows" d="M${i*36+6} ${146-height}h12v4H${i*36+6}zM${i*36+6} ${158-height}h12v4H${i*36+6}z"/>`).join('')}<path class="extra-stars" d="M21 22h3v3h-3zM85 12h3v3h-3zM189 28h3v3h-3zM300 76h3v3h-3zM122 51h3v3h-3z"/></svg>`;
}
function passExtraArt(reward, compact = false) {
  const kind = reward?.kind, variant = passExtraVariant(reward);
  if (!Object.hasOwn(passExtraLabels, kind) && kind !== 'currency') return '';
  const art = kind === 'scene' || kind === 'banner' ? passExtraScene(variant)
    : kind === 'currency' ? `<span class="extra-dust-symbol" aria-hidden="true">✧</span><strong>${Number(reward.amount) || 0}</strong>`
    : `<span class="extra-core" aria-hidden="true">${passExtraSymbols[kind]}</span>${Array.from({length:8},(_,i)=>`<i style="--i:${i}" aria-hidden="true"></i>`).join('')}`;
  return `<div class="progression-art pass-extra-art extra-${kind} extra-tone-${variant} ${compact ? 'compact' : ''}" role="img" aria-label="${progressionEscape(reward.name)}">${art}<span class="extra-art-label">${kind === 'currency' ? 'ARKANSTAUB' : progressionEscape(passExtraLabels[kind])}</span></div>`;
}
function passExtraBanner() {
  const reward = passExtraSelected('banner');
  return reward ? `<section class="pass-profile-banner extra-tone-${passExtraVariant(reward)}" aria-label="Dein Profilbanner: ${progressionEscape(reward.name)}">${passExtraScene(passExtraVariant(reward))}<div><small>DEIN PROFIL · DEIN UNIVERSUM</small><strong>${progressionEscape(reward.name)}</strong></div></section>` : '';
}
function passExtraPreviewButton(reward) {
  return Object.hasOwn(passExtraLabels, reward.kind) ? `<button class="progression-equip pass-preview-button" data-pass-preview="${progressionEscape(reward.id)}">Vorschau ansehen</button>` : '';
}
function passExtrasCollection() {
  const game = progressionGame();
  const rewards = passExtraCatalog();
  return `<section class="pass-extras-collection"><header class="pass-extras-heading"><span class="progression-overline">DEINE NEUEN LOOKS & EFFEKTE</span><h2>Mach das Spiel zu deinem.</h2><p>Battlepass-Looks und exklusive Spinwheel-Funde. Eine Ausrüstung gilt für alle deine Begleiter. Vorschauen sind auch vor dem Freischalten möglich.</p></header>${Object.entries(passExtraLabels).map(([kind,label]) => {
    const selected = passExtraSelected(kind);
    return `<section class="pass-extra-group"><header><div><span class="progression-overline">${progressionEscape(selected ? 'AKTIV: ' + selected.name : 'STANDARD AKTIV')}</span><h3>${label}</h3></div><button class="text-button" data-pass-unequip="${kind}" ${!selected || progressionBusy || isBusy() ? 'disabled' : ''}>Standard verwenden</button></header><div class="pass-extra-grid">${rewards.filter(reward => reward?.kind === kind).map(reward => progressionRewardCard(reward, { locked: !progressionRewardOwned(reward) })).join('')}</div></section>`;
  }).join('')}</section>`;
}

// Event-driven, bounded DOM effects. No canvas loop or saved preview state.
(() => {
  let trail = null, finisher = null, previousId = null, previousStatus = null, lastPoint = 0;
  let previewLayer = null, finishLayer = null;
  const motes = new Set();
  const reduced = () => document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function clear() {
    for (const mote of motes) { mote.getAnimations?.().forEach(a => a.cancel()); mote.remove(); }
    motes.clear(); finishLayer?.getAnimations?.().forEach(a=>a.cancel()); finishLayer?.remove(); finishLayer = null;
  }
  function burst(variant, preview = false) {
    if (reduced()) return false;
    finishLayer?.getAnimations?.().forEach(a=>a.cancel()); finishLayer?.remove();
    const layer = document.createElement('div');
    layer.className = `pass-finisher-layer extra-tone-${variant} finisher-${variant}`;
    layer.setAttribute('aria-hidden', 'true');
    const names = ['STERNENREGEN', 'RUNENEXPLOSION', 'PHÖNIX-AUFSTIEG', 'WELTENRISS', 'ARKANE SUPERNOVA'];
    layer.innerHTML = `<span class="finisher-flash"></span><span class="finisher-rune">${['✦','◇','ϟ','✧','✺'][variant-1]}</span><strong>${preview ? 'VORSCHAU · ' : ''}${names[variant-1]}</strong>${Array.from({length:24},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100}%;--drift:${(i%2?1:-1)*(35+i*5)}px"></i>`).join('')}`;
    document.body.append(layer); finishLayer = layer;
    const animation = layer.animate([{opacity:0},{opacity:1,offset:.12},{opacity:1,offset:.65},{opacity:0}], {duration:2000,easing:'ease-out'});
    animation.finished.catch(()=>{}).finally(()=>{ layer.remove(); if(finishLayer===layer)finishLayer=null; });
    return true;
  }
  function preview(reward) {
    if (reward.kind === 'finisher') {
      if (!burst(passExtraVariant(reward), true) && typeof toast === 'function') toast('Bei reduzierter Bewegung bleibt der Sieges-Effekt ausgeschaltet.');
      return;
    }
    previewLayer?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'pass-extra-preview'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label', 'Vorschau: ' + reward.name);
    overlay.innerHTML = `<div class="pass-extra-preview-card"><button class="text-button" data-pass-close>Schließen ×</button>${passExtraArt(reward)}<h2>${progressionEscape(reward.name)}</h2><p>${progressionEscape(reward.description)}</p><small>Vorschau · Deine Ausrüstung bleibt erhalten.</small></div>`;
    document.body.append(overlay); previewLayer = overlay;
    overlay.querySelector('[data-pass-close]').focus();
  }
  function closePreview() {
    if(!previewLayer)return;
    const id=previewLayer.dataset.rewardId;previewLayer.remove();previewLayer=null;
    if(id)document.querySelector(`[data-pass-preview="${id}"]`)?.focus({preventScroll:true});
  }
  window.mountPassExtras = function() {
    const kinds = Object.keys(passExtraLabels), selected = Object.fromEntries(kinds.map(kind=>[kind,passExtraSelected(kind)]));
    for(const kind of kinds)document.body.dataset['pass'+kind[0].toUpperCase()+kind.slice(1)] = selected[kind] ? String(passExtraVariant(selected[kind])) : '';
    trail = selected.trail; finisher = selected.finisher;
    document.body.classList.toggle('pass-fx-paused', !!document.hidden);
    const world = document.querySelector('.menu-world');
    const artwork = world?.querySelector('.menu-network');
    if(artwork)artwork.style.display=selected.scene ? 'none' : '';
    let scene = world?.querySelector('.pass-menu-backdrop');
    if(world && selected.scene) {
      const key=selected.scene.id;
      if(scene?.dataset.rewardId!==key) { scene?.remove();scene=document.createElement('div');scene.className=`pass-menu-backdrop extra-tone-${passExtraVariant(selected.scene)}`;scene.dataset.rewardId=key;scene.setAttribute('aria-hidden','true');scene.innerHTML=passExtraScene(passExtraVariant(selected.scene));world.insertBefore(scene,artwork); }
    } else scene?.remove();
    for(const avatar of document.querySelectorAll('.profile-portrait .progression-avatar,.menu-companion .progression-avatar,#companion-dock .progression-avatar')) {
      const old=avatar.querySelector('.pass-companion-aura');
      if(!selected.aura) {old?.remove();continue;}
      if(old?.dataset.rewardId===selected.aura.id)continue;
      old?.remove(); const aura=document.createElement('span');aura.className=`pass-companion-aura extra-tone-${passExtraVariant(selected.aura)}`;aura.dataset.rewardId=selected.aura.id;aura.setAttribute('aria-hidden','true');
      aura.innerHTML=Array.from({length:8},(_,i)=>`<i style="--i:${i}"></i>`).join('');avatar.append(aura);
    }
    const session=state?.session;
    if(finisher && session?.status==='completed' && previousId===session.id && previousStatus==='active' && state.game?.latest?.id===session.id && state.game.latest.solved && currentView==='simulation')burst(passExtraVariant(finisher));
    previousId=session?.id ?? null;previousStatus=session?.status ?? null;
  };
  document.addEventListener('pointermove', event => {
    if(!trail || reduced() || event.pointerType==='touch' || event.buttons || performance.now()-lastPoint<30)return;
    lastPoint=performance.now();
    if(motes.size>=24) { const old=motes.values().next().value;old.remove();motes.delete(old); }
    const mote=document.createElement('span'),variant=passExtraVariant(trail);
    mote.className=`pass-cursor-mote trail-${variant}`;mote.setAttribute('aria-hidden','true');mote.style.left=event.clientX+'px';mote.style.top=event.clientY+'px';mote.style.color=passExtraColors[variant-1];mote.textContent=['✦','◇','ϟ','✧','✺'][variant-1];document.body.append(mote);motes.add(mote);
    const animation=mote.animate([{opacity:.9,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:`translate(-50%,${variant===3?'-220%':'-120%'}) scale(.2)`}],{duration:variant===2?700:500,easing:'ease-out'});
    animation.finished.catch(()=>{}).finally(()=>{mote.remove();motes.delete(mote);});
  }, {passive:true});
  document.addEventListener('click', async event => {
    if(event.target.closest('[data-pass-close]') || event.target===previewLayer){closePreview();return;}
    if(event.target.closest('[data-pass-collection]')) {profileTab='extras';navigate('profile');return;}
    const button=event.target.closest('[data-pass-preview]');
    if(button){const reward=passExtraCatalog().find(r=>r?.id===button.dataset.passPreview);if(reward){preview(reward);if(previewLayer)previewLayer.dataset.rewardId=reward.id;}return;}
    const reset=event.target.closest('[data-pass-unequip]');
    if(reset&&!reset.disabled&&!progressionBusy&&!isBusy()) {
      progressionBusy=true;
      try{await mutate('cosmetics',{kind:reset.dataset.passUnequip,id:null});}
      finally{progressionBusy=false;render();}
    }
  });
  document.addEventListener('keydown',event=>{
    if(!previewLayer)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePreview();}
    if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();previewLayer.querySelector('[data-pass-close]').focus();}
  });
  document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('pass-fx-paused',!!document.hidden);if(document.hidden)clear();});
  window.addEventListener('pagehide',()=>{clear();closePreview();});
  window.addEventListener('resize',clear);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',clear);
  window.PassExtrasFX={clear,preview,burst,status:()=>({motes:motes.size,finisher:!!finishLayer,preview:!!previewLayer})};
})();
