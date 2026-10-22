'use strict';

let loadoutLevel = null, loadoutDuration = 60;
const presentedResults = new Set();
let resultFrame = 0;

function resultScreen() {
  const reward=state.game?.latest, session=state.session;
  if(!reward || session?.status!=='completed' || reward.id!==session.id) return '';
  const rank=state.game.rank || {start:0,next:null,progress:0};
  const fromXp=Math.max(0,state.game.xp-reward.xp);
  const beforeProgress=rank.next ? Math.max(0,Math.min(100,(fromXp-rank.start)*100/(rank.next-rank.start))) : 100;
  const won=reward.solved, title=reward.mode==='speedrun'?(won?'SCHICHT GESCHAFFT':'SCHICHT BEENDET'):(won?'EINSATZ GESCHAFFT':'EINSATZ GESCHEITERT');
  return `<section class="debrief result-screen ${won?'won':'lost'}" data-result="${esc(session.id)}" aria-label="${title}"><div class="result-particles" aria-hidden="true">${'<i></i>'.repeat(20)}</div><div class="result-topline"><span>${won?'MISSION COMPLETE':'MISSION REPORT'}</span><span>${session.mode==='speedrun'?'TIME ATTACK':'CAREER MODE'} / #${esc(session.ticket.number)}</span></div><div class="result-center"><div class="result-medal" aria-hidden="true">${icon(won?'check':'shield')}</div><span class="result-kicker">${won?'SYSTEM WIEDER ONLINE':'DIESER EINSATZ IST VORBEI'}</span><h2>${title}</h2><p>${won?'Deine Entscheidungen haben den Unterschied gemacht.':'Der Bericht zeigt dir, was beim nächsten Versuch besser geht.'}</p><div class="result-score" aria-label="${reward.score}${reward.mode==='career'?' von 100 Punkten':' Punkte'}"><strong data-count="${reward.score}" aria-hidden="true">${reward.score}</strong>${reward.mode==='career'?'<span>/ 100</span>':''}<small>BEWERTUNG</small></div></div><div class="result-rewards"><div class="earned-xp" aria-label="${reward.xp} XP erhalten"><span>EINSATZBELOHNUNG</span><strong aria-hidden="true">+<b data-count="${reward.xp}" data-delay="700">${reward.xp}</b> XP</strong><small>${reward.baseXp} Einsatz · ${reward.bonusXp} Missionen${reward.abilityXp ? ' · +' + reward.abilityXp + ' Fähigkeit' : ''}</small></div><div class="result-total"><span>DEIN XP-KONTO</span><strong><b data-count="${state.game.xp}" data-from="${Math.max(0,state.game.xp-reward.xp)}" data-delay="700" aria-hidden="true">${state.game.xp}</b><span class="sr-only">${state.game.xp}</span> XP</strong><div class="reward-track" aria-hidden="true"><i data-xp-before="${beforeProgress}" data-xp-after="${Number(rank.progress) || 0}"></i></div><small>Erfahrungsfortschritt gespeichert</small></div></div>${rankedResult(session)}${companionResult(session)}${reward.unlocked.length?`<div class="reward-unlocks">${reward.unlocked.map(m=>`<span>${icon('target')}<b>${esc(m.title)}</b> +${m.reward} XP</span>`).join('')}</div>`:''}${resultProgressRewards(reward)}<div class="result-actions"><button class="button primary" data-action="start" ${isBusy()?'disabled':''}>NÄCHSTER EINSATZ ${icon('arrow')}</button><button class="button" data-action="result-report">Auswertung ansehen ${icon('file')}</button><button class="text-button" data-view="menu">Hauptmenü</button></div></section>`;
}

function animateDebrief() {
  cancelAnimationFrame(resultFrame);
  const card=document.querySelector('[data-result]');
  if(!card) return;
  const track=card.querySelector?.('.reward-track > i');
  if(track){
    const percentage=value=>`${Math.max(0,Math.min(100,Number(value)||0))}%`;
    track.style.setProperty('--xp-before',percentage(track.dataset.xpBefore));
    track.style.setProperty('--xp-after',percentage(track.dataset.xpAfter));
    track.style.width=percentage(track.dataset.xpAfter);
  }
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced){
    card.classList.remove('result-animate');
    for(const node of card.querySelectorAll('[data-count]'))node.textContent=node.dataset.count;
  }
  if(reduced || presentedResults.has(card.dataset.result)) {card.classList.add('result-settled');return;}
  presentedResults.add(card.dataset.result);
  card.classList.add('result-animate');
  card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'smooth'});
  const counters=[...card.querySelectorAll('[data-count]')].map(node=>({node,to:Number(node.dataset.count),from:Number(node.dataset.from||0),delay:Number(node.dataset.delay||0)}));
  for(const item of counters)item.node.textContent=String(item.from);
  const started=performance.now();let lastTick=0;
  const frame=now=>{
    if(!card.isConnected) return;
    const elapsed=now-started;
    for(const {node,to,from,delay} of counters){const t=Math.min(1,Math.max(0,(elapsed-delay)/1400));node.textContent=String(Math.round(from+(to-from)*(1-Math.pow(1-t,3))));}
    if(elapsed>100 && elapsed<1400 && elapsed-lastTick>95 && Number(counters[0]?.to)>0){window.GameAudio?.play('click');lastTick=elapsed;}
    if(elapsed<3100)resultFrame=requestAnimationFrame(frame);
    else {card.classList.add('result-settled');for(const {node,to} of counters)node.textContent=String(to);}
  };
  resultFrame=requestAnimationFrame(frame);
}
function gameNavigation() {
  const link = (id, label, description = '') => `<button type="button" data-view="${id}" ${currentView === id ? 'aria-current="page"' : ''}><span>${label}</span>${description ? `<small>${description}</small>` : ''}</button>`;
  const group = (id, label, items) => `<div class="play-nav-group ${items.some(([view]) => view === currentView) ? 'is-current' : ''}" data-nav-group="${id}"><button type="button" class="play-nav-toggle" data-nav-toggle="${id}" aria-expanded="false" aria-controls="play-nav-${id}"><span>${label}</span><span class="play-nav-chevron" aria-hidden="true">⌄</span></button><div class="play-nav-menu" id="play-nav-${id}" aria-label="${label}" hidden><span class="play-nav-caption">${label}</span>${items.map(item => link(...item)).join('')}</div></div>`;
  return `<a class="play-brand" href="#menu" aria-label="Zum Hauptmenü">TS<span>HAUPTMENÜ<small>ESC / ZURÜCK</small></span></a><nav class="play-tabs" aria-label="Spielnavigation">${link('overview','Leitstelle')}${group('play','Spielen', [['simulation','Einsatz','Ein Ticket bearbeiten'],['speedrun','Speedrun','Eine ganze Schicht übernehmen']])}${group('progress','Fortschritt', [['missions','Missionen','Tägliche und dauerhafte Ziele'],['battlepass','Battlepass','Stufen und Belohnungen'],['mastery','Meisterung','Begleiterformen und Fachgebiete'],['career','Karriere','Deine persönliche Entwicklung'],['ranks','Ränge','Alle 18 Rangstufen']])}${group('results','Auswertung', [['reports','Berichte','Abgeschlossene Einsätze nachlesen'],['leaderboard','Rekorde','Karriere und Speedruns vergleichen']])}${link('casino','Casino')}${link('settings','Optionen')}</nav><div class="play-profile"><div data-sound-control>${soundButton()}</div>${profileQuickButton()}</div>`;
}

function closePlayMenus(restoreFocus = false) {
  const buttons = [...document.querySelectorAll('.play-nav-toggle[aria-expanded="true"]')];
  for (const button of buttons) {
    button.setAttribute('aria-expanded', 'false');
    document.getElementById(button.getAttribute('aria-controls')).hidden = true;
  }
  if (restoreFocus) buttons[0]?.focus();
  return buttons.length > 0;
}
function openPlayMenu(button) {
  closePlayMenus();
  const panel = document.getElementById(button.getAttribute('aria-controls'));
  button.setAttribute('aria-expanded', 'true'); panel.hidden = false;
  panel.style.left = '0px';
  const bounds = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(12 - bounds.left, Math.min(0, window.innerWidth - 12 - bounds.right))}px`;
  return panel;
}
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-nav-toggle]');
  if (toggle) {
    if (toggle.getAttribute('aria-expanded') === 'true') closePlayMenus();
    else openPlayMenu(toggle);
  } else if (!event.target.closest('.play-nav-group') || event.target.closest('.play-nav-menu [data-view]')) closePlayMenus();
});
document.addEventListener('keydown', event => {
  const toggle = event.target.closest('[data-nav-toggle]');
  if (toggle && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault(); const links = openPlayMenu(toggle).querySelectorAll('button');
    links[event.key === 'ArrowUp' ? links.length - 1 : 0]?.focus(); return;
  }
  const panel = event.target.closest('.play-nav-menu');
  if (!panel || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); const links = [...panel.querySelectorAll('button')], index = links.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
  links[next]?.focus();
});
document.addEventListener('focusout', event => {
  const group = event.target.closest('.play-nav-group');
  if (group) queueMicrotask(() => { if (!group.contains(document.activeElement)) closePlayMenus(); });
});
window.addEventListener('resize', () => closePlayMenus());

function actionDeck() {
  return `${companionPassivePanel()}<form class="composer action-console" id="message-form"><div class="console-title"><label for="message">DEIN ZUG</label></div><textarea id="message" name="message" maxlength="16000" placeholder="Beschreibe deine Aktion oder gib einen simulierten Befehl ein …" ${isBusy()?'disabled':''}>${esc(draft)}</textarea><div class="composer-bottom"><small>Enter ausführen · Shift + Enter neue Zeile</small><button class="button primary deploy-action" type="submit" ${isBusy()?'disabled':''}>Aktion ausführen ${icon('send')}</button></div></form>`;
}

function missionScreen() {
  const s = state.session;
  if (!s) return heading('DEIN NÄCHSTER EINSATZ', 'Wähle deinen Modus. Dein Fortschritt wird automatisch gespeichert.') + authNotice() + `<div class="mode-select"><button class="mode-pick game-pick" data-action="start" ${isBusy()?'disabled':''}><span class="mode-number">01</span>${icon('terminal')}<small>CAREER MODE</small><h2>Ein Fall.<br>Deine Entscheidung.</h2><p>Level ${state.level} · ${esc(levels[state.level-1])}</p><strong>Karriere starten ${icon('arrow')}</strong></button><button class="mode-pick game-pick" data-view="speedrun"><span class="mode-number">02</span>${icon('bolt')}<small>TIME ATTACK</small><h2>Eine Schicht.<br>Viele Probleme.</h2><p>Tickets priorisieren. SLAs halten. Punkte sammeln.</p><strong>Speedrun wählen ${icon('arrow')}</strong></button></div>${isBusy()?pendingPanel():''}`;
  const person = s.queue?.find(item => item.number === s.ticket.number);
  const initials = person?.requester?.split(/\s+/).slice(0,2).map(word=>word[0]).join('') || 'IT';
  return `<div class="mission-heading"><div><span class="eyebrow">${s.mode==='speedrun'?'SPEEDRUN / LIVE-SCHICHT':'CAREER MODE / AKTIVER EINSATZ'}</span><h1>${esc(s.ticket.title)}</h1><p>Simulierte IT. Deine Entscheidungen bestimmen den Verlauf.</p></div><span class="mission-state">${active()?'● IM EINSATZ':'◆ AUSGEWERTET'}</span></div><section class="mission-hud" aria-label="Einsatzstatus"><div><small>TICKET</small><strong>#${esc(s.ticket.number)}</strong></div><div><small>PRIORITÄT</small><strong class="priority priority-${esc(s.ticket.priority.toLowerCase())}">${esc(s.ticket.priority)}</strong></div><div><small>SIMULIERTE ZEIT</small><strong>${s.elapsed ?? 0}<em> MIN${s.mode==='speedrun'?' / '+s.duration:''}</em></strong></div><div><small>SCHWIERIGKEIT</small><strong>${s.level || state.level}<em> / 6</em></strong></div><div class="hud-rank"><small>EINSATZRANG</small><strong>${esc(state.game?.ranked?.name || 'IT-Support')}</strong></div></section>${completionCard()}${queueBoard()}<div class="mission-stage"><section class="mission-terminal"><div class="chat-top"><strong>${icon('terminal')} EINSATZPROTOKOLL</strong><span>LOKAL GESPEICHERT</span></div><div class="messages" id="messages" role="log" aria-label="Simulationsverlauf" aria-live="polite">${s.messages.map((m,i) => `<article class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label"><span class="mini-avatar">${m.role==='user'?'DU':'IT'}</span>${m.role==='user'?'Deine Aktion':'Ticket Simulator'}<small>${String(i+1).padStart(2,'0')}</small></div><div class="markdown">${m.role==='user'?esc(m.content):markdown(m.content)}</div></article>`).join('')}</div>${isBusy()?pendingPanel():''}${active()?actionDeck():`<div class="completed-note"><span>Auswertung gespeichert. Bereit für den nächsten Einsatz?</span>${button('Nächstes Ticket','start',true)}</div>`}</section><aside class="mission-side">${companionAbilityPanel()}<section class="contact-card"><div class="contact-avatar">${esc(initials)}</div><span class="eyebrow">${person?'MELDENDE PERSON':'STÖRUNGSMELDUNG'}</span><h2>${esc(person?.requester || 'IT-Service')}</h2>${person?`<p>${esc(person.department)}</p>`:''}<div class="contact-brief">${esc(s.ticket.description || s.ticket.title)}</div><span class="case-stamp">TICKET #${esc(s.ticket.number)}</span></section><section class="mission-tools"><span class="eyebrow">EINSATZOPTIONEN</span><button class="game-pick utility-pick" data-action="help" ${!active()||isBusy()?'disabled':''}>${icon('light')}<span>Hinweis anfordern<small>Wird in der Bewertung berücksichtigt</small></span></button><button class="game-pick utility-pick" data-action="giveup" ${!active()||isBusy()?'disabled':''}>${icon('file')}<span>Einsatz aufgeben<small>Beenden und auswerten</small></span></button><button class="game-pick utility-pick" data-view="menu">${icon('back')}<span>Zum Hauptmenü<small>Der Einsatz bleibt erhalten</small></span></button></section><p class="mission-footnote">Es laufen keine echten Systembefehle. Deine reale Schreibzeit zählt nicht zur Einsatzzeit.</p></aside></div>${s.report?`<section class="panel markdown mt-22">${markdown(s.report)}</section>`:''}`;
}

const levelNames = ['EINSTIEG','ROUTINE','FORTGESCHRITTEN','SCHWER','EXPERTE','EXTREM'];
function levelPicks(level) {
  return `<fieldset class="level-picks"><legend><span>02</span> SCHWIERIGKEIT WÄHLEN</legend><div class="level-pick-grid">${levels.map((name,i)=>`<label class="level-pick game-pick ${i>3?'high-danger':''}"><input type="radio" name="level" value="${i+1}" ${Number(level)===i+1?'checked':''}><span class="level-pick-top"><span>STUFE 0${i+1}</span><b aria-hidden="true">◆</b></span><strong>${levelNames[i]}</strong><span class="difficulty-bars" aria-hidden="true">${Array.from({length:6},(_,j)=>`<i class="${j<=i?'lit':''}"></i>`).join('')}</span><small>${esc(name)}</small></label>`).join('')}</div></fieldset>`;
}

function loadoutScreen() {
  const selected = loadoutLevel ?? state.level;
  return heading('DEINE SCHICHT. DEINE REGELN.', 'Wähle Dauer und Herausforderung. Dann beginnt dein Einsatz.') + authNotice() + (active()?`<div class="notice info">Ein Einsatz läuft bereits. Schließe ihn ab, bevor du eine neue Schicht startest.<button class="text-button" data-view="simulation">Fortsetzen ${icon('arrow')}</button></div>`:'') + `<form id="speedrun-form" class="loadout"><div class="loadout-main"><fieldset class="shift-picks"><legend><span>01</span> SCHICHT WÄHLEN</legend><div class="shift-pick-grid">${[60,120,240].map((d,i)=>`<label class="shift-pick game-pick"><input type="radio" name="duration" value="${d}" ${loadoutDuration===d?'checked':''}>${icon('bolt')}<span class="shift-name">${['SPRINT','MARATHON','LANGSTRECKE'][i]}</span><strong>${d}<small> MIN</small></strong><p>${['Kurze Schicht. Jede Aktion zählt.','Mehr Fälle. Mehr Prioritäten.','Vier Stunden voller Entscheidungen.'][i]}</p><span class="selection-mark">◆ AUSGEWÄHLT</span></label>`).join('')}</div></fieldset>${levelPicks(selected)}</div><aside class="loadout-preview"><span class="eyebrow">DEIN EINSATZPROFIL</span>${difficultyCard(selected,'difficulty-preview')}<div class="loadout-rules"><span>PRIORITÄT <b>SLA</b></span>${[30,60,120,240].map((n,i)=>`<div>P${i+1}<strong>${n} MIN</strong></div>`).join('')}</div><p>Simulierte Zeit. Neue Tickets treffen während deiner Aktionen ein. Speedruns verändern dein Karrierelevel nicht.</p><button class="button primary launch-shift" type="submit" ${isBusy()||active()?'disabled':''}>SCHICHT STARTEN ${icon('arrow')}</button><small>Deine Auswahl startet erst mit diesem Knopf.</small></aside></form><div class="section-head mt-30"><h2>DEINE HIGHSCORES</h2><span>LOKAL GESPEICHERT</span></div><section class="panel markdown">${state.highscores?markdown(state.highscores):'<p>Noch keine Schicht abgeschlossen. Setze deinen ersten Highscore.</p>'}</section>`;
}

document.addEventListener('click', event => {
  if(event.target.closest('[data-action="result-report"]')) document.querySelector('.mission-stage + .panel.markdown')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  const button=event.target.closest('button,.game-pick');
  if(!button || button.disabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const bounds=button.getBoundingClientRect();
  const burst=document.createElement('span');burst.className='selection-burst';burst.setAttribute('aria-hidden','true');
  burst.style.left=(event.detail?event.clientX:bounds.x+bounds.width/2)+'px';burst.style.top=(event.detail?event.clientY:bounds.y+bounds.height/2)+'px';
  document.body.append(burst);burst.addEventListener('animationend',()=>burst.remove(),{once:true});
});
document.addEventListener('change', event => {
  if(event.target.name==='level') loadoutLevel=Number(event.target.value);
  if(event.target.name==='duration') loadoutDuration=Number(event.target.value);
});
let lastPickSound = 0;
document.addEventListener('pointerover', event => {
  const pick = event.target.closest('.game-pick,.play-tabs button,.menu-choice,.menu-secondary button,.menu-play');
  if(!pick || pick.disabled || pick.contains(event.relatedTarget) || Date.now()-lastPickSound<110) return;
  lastPickSound=Date.now(); window.GameAudio?.play('click');
});

function rankedResult(session) {
  const result=state.game?.ranked?.latest;
  if(session.mode!=='career'||result?.id!==session.id)return '';
  return `<section class="ranked-result ${result.delta<0?'rr-loss':'rr-gain'}"><div><span class="eyebrow">${result.training?'TRAINING':'RANGPUNKTE'}</span><strong>${result.delta>0?'+':''}${result.delta} RR</strong><h3>${result.rankUp?'↑ Aufstieg · ':result.rankDown?'↓ Abstieg · ':''}${esc(result.after.name)}</h3><p>${result.after.rr} / 100 RR · Rang ${result.after.level}</p></div><ul>${result.reasons.map(r=>`<li><span>${esc(r.label)}</span><b>${r.points>0?'+':''}${r.points} RR</b></li>`).join('')}</ul></section>`;
}
function companionResult(session) {
  const reward=session.companionReward;
  if(!reward)return '';
  return `<section class="companion-result"><span class="eyebrow">DEIN BEGLEITER · ${esc(reward.characterName)}</span><h3>+${reward.appliedXp} Begleiter-EP</h3><p>${reward.baseXp} Basis-EP + ${reward.bonusXp} Fachgebietsbonus${reward.abilityXp ? ' + ' + reward.abilityXp + ' Fähigkeits-EP' : ''} · Stufe ${reward.levelAfter} · ohne Levelgrenze</p></section>`;
}
