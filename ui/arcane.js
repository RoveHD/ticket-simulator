'use strict';
let arcaneBusy=false,arcaneRequest=null,arcaneReceipt=null,arcaneWheelAnimation=null;
let leaderboardOffset=0;
let leaderboardMode='career',leaderboardDuration='60',leaderboardRevision='',leaderboardError='';
const leaderboardCache=new Map(),leaderboardRequests=new Set();
function arcaneSigil(){return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="m50 5 39 23v44L50 95 11 72V28Z M50 18 23 65h54Z M50 82l27-47H23Z"/><circle cx="50" cy="50" r="18"/><path d="M50 31v38M31 50h38"/></svg>'}
function arcaneWallet(){return state.game?.arcane||{balance:0,price:100,totalSpins:0,segments:[],recent:[],earned:0,starter:300}}
function arcaneWheelAngle(segments,index){const item=segments[index];return item?-(segments.slice(0,index).reduce((sum,s)=>sum+Number(s.weight??s.chance),0)+Number(item.weight??item.chance)/2)*3.6:0}
function arcaneLootType(segment){return segment.dust!==undefined?'Arkanstaub':segment.grant?.kind==='companionXp'?'Bonus-EP für deinen aktiven Begleiter':segment.grant?.kind==='passXp'?'Pass-EP · bei Pass 40: 150 Begleiter-EP':segment.reward?.presentation||'Exklusive Profilbelohnung'}
function arcaneWheel(segments){let angle=-90;return `<svg class="arcane-wheel" viewBox="0 0 360 360" role="img" aria-label="Glücksrad mit ${segments.length} möglichen Belohnungen"><circle cx="180" cy="180" r="170" class="wheel-rim"/>${segments.map((segment,index)=>{
 const sweep=Number(segment.weight||segment.chance||0)*3.6,end=angle+sweep,point=a=>[180+156*Math.cos(a*Math.PI/180),180+156*Math.sin(a*Math.PI/180)],a=point(angle),b=point(end),middle=(angle+end)/2;
 const labelX=180+114*Math.cos(middle*Math.PI/180),labelY=180+114*Math.sin(middle*Math.PI/180);angle=end;
 return `<g class="wheel-segment wheel-tone-${index%4}"><path d="M180 180L${a[0]} ${a[1]}A156 156 0 ${sweep>180?1:0} 1 ${b[0]} ${b[1]}Z"/>${sweep>=12?`<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle">${segment.dust!==undefined?esc(segment.dust):'✦'}</text>`:''}</g>`;
 }).join('')}<circle cx="180" cy="180" r="164" class="wheel-rune-track"/><path class="wheel-orbit-mark" d="M180 7v14M353 180h-14M180 353v-14M7 180h14"/><circle cx="180" cy="180" r="48" class="wheel-hub"/><path class="wheel-hub-star" d="m180 144 10 26 26 10-26 10-10 26-10-26-26-10 26-10Z"/></svg>`}
function arcaneSegmentName(segment){return segment.name||segment.reward?.name||`${segment.amount??segment.reward?.amount??0} Arkanstaub`}
function casinoScreen(){
 const wallet=arcaneWallet(),recent=wallet.recent||[],receipt=recent.find(r=>r.requestId===arcaneReceipt?.requestId)||recent[0];
 return `<section class="arcane-hall"><header class="arcane-heading"><div><span class="eyebrow">THE ARCANE ARCADE</span><h1>Wheel of Fates</h1><p>Entfessle die Runen. Verdiene deinen nächsten legendären Auftritt.</p></div><div class="arcane-wallet" aria-label="Dein Arkanstaub"><span>✧ ARKANSTAUB</span><strong>${Number(wallet.balance).toLocaleString('de-AT')}</strong><small>Im Spiel verdient</small></div></header><div class="arcane-casino-layout"><section class="arcane-wheel-chamber" aria-label="Arkanes Glücksrad"><div class="arcane-chamber-label"><span>RITUAL ${String(wallet.totalSpins+1).padStart(3,'0')}</span><span>✦ ${wallet.price} STAUB</span></div><div class="arcane-wheel-stage"><div class="arcane-wheel-runes" aria-hidden="true">ᛟ · ᚱ · ᛉ · ᚨ · ᛟ · ᚱ · ᛉ · ᚨ</div><div class="wheel-pointer" aria-hidden="true"></div><div id="arcane-wheel-rotor" class="${receipt?'wheel-stop-'+receipt.segmentIndex:''}">${arcaneWheel(wallet.segments||[])}</div><span class="wheel-center-glow" aria-hidden="true"></span></div><div class="arcane-ritual-action"><button class="button primary arcane-spin" data-arcane-spin ${arcaneBusy||isBusy()||wallet.canSpin===false||wallet.balance<wallet.price?'disabled':''}>${arcaneSigil()}<span>${arcaneBusy?'RUNEN WERDEN BESCHWOREN …':'SCHICKSAL BESCHWÖREN'}<small>${wallet.price} Arkanstaub pro Dreh</small></span></button><p id="arcane-spin-status" role="status" aria-live="polite">${receipt?esc(arcaneReceiptText(receipt)):esc(wallet.spinBlockedReason||`Ein Dreh. ${wallet.segments.length} mögliche Belohnungen.`)}</p>${wallet.balance<wallet.price?'<button class="text-button" data-view="simulation">Einsätze spielen und Arkanstaub verdienen →</button>':''}</div></section><aside class="arcane-loot"><div class="arcane-loot-title"><span class="eyebrow">THE LOOT TABLE</span><h2>Was die Runen hüten</h2><p>Jeder Sektor zeigt seine tatsächliche Gewinnchance.</p></div><div class="arcane-loot-grid">${(wallet.segments||[]).map((segment,index)=>`<article class="arcane-loot-item arcane-loot-${index} ${receipt?.segmentIndex===index?'loot-revealed':''}"><span class="arcane-loot-icon">${segment.dust!==undefined?'✧':segment.grant?'XP':index===7?'♛':'✦'}</span><div><strong>${esc(arcaneSegmentName(segment))}</strong><small>${esc(arcaneLootType(segment))}</small>${segment.reward && typeof passExtraPreviewButton === 'function' ? passExtraPreviewButton(segment.reward) : ''}</div><b>${segment.weight??segment.chance}%</b></article>`).join('')}</div><div class="arcane-earn-note"><h3>Deine Einsätze nähren das Ritual</h3><p>300 Staub zum Start. Gelöster Karrierefall: 40 Staub, sauber gelöst: +10. Pro gelöstem Speedrun-Ticket: 20. Gewinne auch Bonus-EP-Pakete oder exklusive Looks, Auren und Sieges-Finisher.</p><p>Battlepass-Pakete: ${Number(wallet.passEarned || 0).toLocaleString('de-AT')} Staub bereits automatisch gutgeschrieben.</p><p>Kosmetische Duplikate geben 150 Staub. Kosmetische Gewinne findest du im Profil, neue Looks unter „Looks & Effekte“. Bonus-EP werden sofort und dauerhaft gutgeschrieben.</p></div></aside></div><section class="arcane-history"><div><span class="eyebrow">DEINE LETZTEN RITUALE</span><h2>Im Runenbuch verewigt</h2></div>${recent.length?`<ol>${recent.slice(0,6).map(item=>`<li><span>✦</span><strong>${esc(arcaneReceiptText(item))}</strong><small>${item.createdAt?esc(new Date(item.createdAt).toLocaleString('de-AT')):''}</small></li>`).join('')}</ol>`:'<p>Dein erster Fund wartet noch auf dich.</p>'}</section></section>`;
}
function arcaneReceiptText(receipt){if(!receipt)return '';const segment=arcaneWallet().segments?.[receipt.segmentIndex];if(receipt.grant)return `+${receipt.grant.amount} ${receipt.grant.kind==='companionXp'?'Begleiter-EP':'Pass-EP'} · dauerhaft gutgeschrieben`;return receipt.duplicate?(segment?.name||'Kosmetik')+' · Duplikat: +150 Arkanstaub':segment?.name||'Belohnung gespeichert'}

async function performArcaneSpin(){
 if(arcaneBusy||isBusy())return;
 const wallet=arcaneWallet();if(wallet.canSpin===false){toast(wallet.spinBlockedReason||'Das Spinwheel ist gerade nicht bereit.');return}if(wallet.balance<wallet.price){toast('Spiele weitere Einsätze, um Arkanstaub zu verdienen.');return}
 arcaneBusy=true;pending=true;
 arcaneRequest ||= {requestId:crypto.randomUUID(),expectedSpins:wallet.totalSpins};
 const button=document.querySelector('[data-arcane-spin]'),status=document.querySelector('#arcane-spin-status');
 if(button)button.disabled=true;if(status)status.textContent='Die Runen bestimmen deinen Fund …';
 let response;const ticks=[];
 try{
  response=await api('arcane/spin',arcaneRequest);
  acceptState(response.state);
  const receipt=response.receipt,rotor=document.querySelector('#arcane-wheel-rotor'),segments=wallet.segments;
  const index=receipt.segmentIndex,segment=segments[index],start=segments.slice(0,index).reduce((sum,s)=>sum+Number(s.weight??s.chance),0),middle=(start+Number(segment.weight??segment.chance)/2)*3.6;
  window.GameAudio?.play('spin');
  if(rotor&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const last=wallet.recent?.[0],previousAngle=last?-(segments.slice(0,last.segmentIndex).reduce((sum,s)=>sum+Number(s.weight??s.chance),0)+Number(segments[last.segmentIndex].weight??segments[last.segmentIndex].chance)/2)*3.6:0;
   arcaneWheelAnimation=rotor.animate([{transform:`rotate(${previousAngle}deg)`},{transform:`rotate(${2160-middle}deg)`}],{duration:4200,easing:'cubic-bezier(.12,.72,.08,1)',fill:'forwards'});
   for(const delay of [100,180,260,350,450,560,700,860,1040,1260,1510,1800,2150,2550,3000,3500,4000]) ticks.push(setTimeout(()=>window.GameAudio?.play('tick'),delay));
   await arcaneWheelAnimation.finished.catch(()=>{});
  }
  arcaneReceipt=receipt;arcaneRequest=null;
  const rare=index>=5;window.GameAudio?.stopEffect?.('spin');window.GameAudio?.play(rare?'jackpot':'success');window.ArcaneFX?.emit(rare?'jackpot':'spell');
  toast(arcaneReceiptText(receipt));
 }catch(error){
  toast(error.message,true);
  try{const next=await api('state');acceptState(next);const receipt=next.game?.arcane?.recent?.find(item=>item.requestId===arcaneRequest?.requestId);if(receipt){arcaneReceipt=receipt;arcaneRequest=null}else if(next.game?.arcane?.totalSpins!==arcaneRequest?.expectedSpins)arcaneRequest=null}catch{}
 }finally{for(const timer of ticks)clearTimeout(timer);window.GameAudio?.stopEffect?.('spin');arcaneWheelAnimation?.cancel();arcaneWheelAnimation=null;arcaneBusy=false;pending=false;render()}
}
function leaderboardKey(){return `${leaderboardMode}:${leaderboardDuration}:${leaderboardOffset}`}
function leaderboardScreen(){
 const data=leaderboardCache.get(leaderboardKey());
 return `<section class="arcane-leaderboard"><header class="arcane-heading"><div><span class="eyebrow">HALL OF RECORDS</span><h1>Deine Bestenliste</h1><p>Deine echten lokalen Einsätze. Deine stärksten Leistungen.</p></div><div class="leaderboard-seal">♜<small>LOKALE REKORDE</small></div></header><nav class="leaderboard-tabs" aria-label="Bestenlisten-Modus"><button data-board-mode="career" ${leaderboardMode==='career'?'aria-current="page"':''}>Karriere-Tickets</button><button data-board-mode="speedrun" ${leaderboardMode==='speedrun'?'aria-current="page"':''}>Speedrun-Schichten</button></nav>${leaderboardMode==='speedrun'?`<div class="leaderboard-duration" aria-label="Schichtdauer">${[['60','60 Minuten'],['120','120 Minuten'],['240','240 Minuten']].map(([value,label])=>`<button data-board-duration="${value}" ${leaderboardDuration===value?'aria-current="page"':''}>${label}</button>`).join('')}</div>`:''}<section class="leaderboard-podium" aria-label="Beste drei Leistungen">${(leaderboardOffset===0?data?.entries:[])?.slice(0,3).map((entry,i)=>`<article class="podium-place podium-${i+1}"><span class="podium-rank">${i===0?'♛':i===1?'✦':'◇'}<small>PLATZ ${entry.rank??i+1}</small></span><strong>${entry.score}</strong><span>${leaderboardMode==='career'?'VON 100 PUNKTEN':'SPEEDRUN-PUNKTE'}</span><h2>${esc(entry.title||entry.id)}</h2><small>${Number(entry.elapsed??entry.minutes??0)} Min. · Stufe ${entry.level}</small></article>`).join('')||''}</section><section class="arcane-record-table" aria-live="polite">${!data?(leaderboardError?`<p class="leaderboard-empty">${esc(leaderboardError)} <button class="text-button" data-board-retry>Erneut laden</button></p>`:'<p class="leaderboard-empty">Die Chronik wird geöffnet …</p>'):!data.entries.length?'<div class="leaderboard-empty"><span>♜</span><h2>Deine Legende beginnt hier.</h2><p>Schließe deinen ersten Einsatz ab, um einen echten Rekord einzutragen.</p><button class="button primary" data-view="simulation">Zum Einsatz →</button></div>':`<div class="leaderboard-table-wrap"><table><thead><tr><th>Platz</th><th>Einsatz</th><th>Punkte</th><th>Zeit</th><th>Stufe</th><th>Bericht</th></tr></thead><tbody>${data.entries.map((entry,index)=>`<tr><td><b>${entry.rank??index+1}</b></td><td>${esc(entry.title||entry.id)}<small>${entry.completedAt?esc(new Date(entry.completedAt).toLocaleDateString('de-AT')):''}</small></td><td><strong>${entry.score}</strong></td><td>${entry.elapsed??entry.minutes??0} Min.</td><td>${entry.level}</td><td><button class="text-button" data-report="${esc(entry.id)}">Ansehen ↗</button></td></tr>`).join('')}</tbody></table></div><div class="leaderboard-paging"><button class="text-button" data-board-page="${Math.max(0,leaderboardOffset-50)}" ${leaderboardOffset===0?'disabled':''}>← Zurück</button><span>${leaderboardOffset+1}–${Math.min(leaderboardOffset+data.entries.length,data.total)} von ${data.total}</span><button class="text-button" data-board-page="${leaderboardOffset+50}" ${leaderboardOffset+50>=data.total?'disabled':''}>Weiter →</button></div><p class="leaderboard-count">${data.total} gespeicherte ${leaderboardMode==='career'?'Karriereleistungen':'Schichten'} · Höchste Punktzahl zuerst · Gleiche Leistung teilt sich den Platz</p>`}</section><p class="arcane-local-note">Diese Chronik enthält ausschließlich deinen lokalen Spielstand.</p></section>`;
}
function mountArcaneViews(){
 if(currentView==='casino'){
  if(!arcaneBusy&&!arcaneWheelAnimation){
   const rotor=document.querySelector('#arcane-wheel-rotor'),wallet=arcaneWallet(),recent=wallet.recent||[];
   const receipt=recent.find(item=>item.requestId===arcaneReceipt?.requestId)||recent[0];
   if(rotor)rotor.style.transform=`rotate(${receipt?arcaneWheelAngle(wallet.segments,receipt.segmentIndex):0}deg)`;
  }
  return;
 }
 if(currentView!=='leaderboard')return;
 const revision=`${state.reports?.length||0}:${state.reports?.[0]?.id||''}`;if(leaderboardRevision!==revision){leaderboardCache.clear();leaderboardRevision=revision}
 const key=leaderboardKey();if(leaderboardCache.has(key)||leaderboardRequests.has(key)||leaderboardError)return;
 leaderboardRequests.add(key);const mode=leaderboardMode,duration=leaderboardMode==='speedrun'?leaderboardDuration:'';
 api(`leaderboard?mode=${mode}${duration?'&duration='+duration:''}&offset=${leaderboardOffset}`).then(result=>{if(revision!==leaderboardRevision)return;leaderboardCache.set(key,result);if(currentView==='leaderboard')render()}).catch(error=>{leaderboardError=error.message;if(currentView==='leaderboard')render()}).finally(()=>{leaderboardRequests.delete(key);if(currentView==='leaderboard'&&!leaderboardCache.has(key)&&!leaderboardError)mountArcaneViews()});
}
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.hasAttribute('data-arcane-spin')){performArcaneSpin();return}
 if(button.dataset.boardMode){leaderboardMode=button.dataset.boardMode;leaderboardOffset=0;leaderboardError='';render()}
 if(button.hasAttribute('data-board-duration')){leaderboardDuration=button.dataset.boardDuration;leaderboardOffset=0;leaderboardError='';render()}
 if(button.hasAttribute('data-board-page')){leaderboardOffset=Number(button.dataset.boardPage);leaderboardError='';render()}
 if(button.hasAttribute('data-board-retry')){leaderboardError='';render()}
});
document.addEventListener('click',event=>{const button=event.target.closest('[data-view],.play-brand,.menu-brand');if(button&&!button.hasAttribute('data-arcane-spin')&&arcaneWheelAnimation)arcaneWheelAnimation.finish()},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&arcaneWheelAnimation)arcaneWheelAnimation.finish()});
