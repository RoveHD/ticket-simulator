'use strict';

let queueSort = 'priority', queueFilter = 'open', queueSearch = '', arrivalNotices = [];
const ticketDrafts = new Map();

async function switchTicket(number) {
  if (isBusy() || !active()) return;
  const session = state.session, target = session.queue?.find(item => item.number === number);
  if (!target || target.active || !['open', 'unknown'].includes(target.status)) return;
  const savedDraft = draft;
  ticketDrafts.set(`${session.id}:${session.ticket.number}`, savedDraft);
  await mutate('message', { message: `Wechsel ${number}` });
  draft = state.session?.ticket.number === number ? ticketDrafts.get(`${session.id}:${number}`) || '' : savedDraft;
  arrivalNotices = arrivalNotices.filter(item => item.number !== number);
  render();
  document.querySelector('#message')?.focus();
}

function acceptState(next) {
  const before = state?.session;
  let arrived = false;
  if ((pendingAudioSaves || audioDraft) && state?.audio) next.audio = { ...state.audio };
  if (state && next.session?.mode === 'speedrun' && next.session.status === 'active') {
    const known = new Set(before?.id === next.session.id ? before.queue?.map(item => item.number) : []);
    if (before?.id !== next.session.id) arrivalNotices = [];
    for (const ticket of next.session.queue || []) {
      if (!known.has(ticket.number)) {
        arrived = true;
        const sessionId = next.session.id;
        arrivalNotices.push({ ...ticket, sessionId });
        window.setTimeout?.(() => {
          arrivalNotices = arrivalNotices.filter(item => item.sessionId !== sessionId || item.number !== ticket.number);
          renderArrivals();
        }, 10000);
      }
    }
  }
  if (!next.session || next.session.status !== 'active') arrivalNotices = [];
  if (!next.session || before?.id !== next.session.id) {
    ticketDrafts.clear(); queueSort = 'priority'; queueFilter = 'open'; queueSearch = '';
  }
  state = next;
  window.GameAudio?.configure(next.audio || audioDefaults);
  if (arrived) window.GameAudio?.play('arrival');
  if (before?.id === next.session?.id && before?.status === 'active' && next.session?.status === 'completed') {
    const reward = next.game?.latest;
    window.GameAudio?.play(next.game?.ranked?.latest?.id === next.session.id && next.game.ranked.latest.rankUp ? 'levelup' : reward?.solved ? 'success' : 'error');
  }
}

function difficultyCard(level, id = '') {
  const profile = state.difficulties?.find(item => item.level === Number(level));
  return `<div class="difficulty-card" ${id ? `id="${id}"` : ''}>${profile ? `<span class="eyebrow">STUFE ${profile.level} / 6</span><strong>${esc(profile.title)}</strong><p>${esc(profile.summary)}</p><small>${esc(profile.challenge)}</small>` : ''}</div>`;
}

function gameProgress(full = false) {
  const game = state.game;
  if (!game) return '';
  const rank = game.ranked || {index:0,name:'IT-Support',rr:0,progress:0,nextName:'Fortgeschrittener IT-Support'};
  return `<section class="command-progress" aria-label="Dein Spielfortschritt">${grandRankBadge(rank)}<div class="rank-copy"><span class="eyebrow">DEIN EINSATZRANG</span><h2>${esc(rank.name)}</h2><div class="rank-meter"><progress max="100" value="${rank.progress}" aria-label="Fortschritt zum nächsten Einsatzrang"></progress><span>${rank.rr} / 100 RR</span></div><small>${rank.nextName ? `Noch ${100 - rank.rr} RR bis ${esc(rank.nextName)}` : 'Höchster Einsatzrang erreicht'}</small></div><div class="game-stat"><strong>${game.streak}</strong><span>Karrierefälle in Folge gelöst</span></div><div class="game-stat"><strong>${game.missions.filter(m => m.unlocked).length} / ${game.missions.length}</strong><span>Missionen erfüllt</span></div></section>${full ? missionsPanel() : ''}`;
}

function missionsPanel() { return progressionHub() + `<details class="legacy-achievements"><summary>Die ersten Karriere-Erfolge</summary>${legacyMissionsPanel()}</details>`; }

function legacyMissionsPanel() {
  if (!state.game) return '';
  return `<section class="mission-section"><div class="section-head"><h2>Deine Missionen</h2><span>DAUERHAFTE ERFOLGE</span></div><div class="mission-grid">${state.game.missions.map(m => `<article class="mission ${m.unlocked ? 'unlocked' : ''}"><div class="mission-top"><span class="mission-symbol">${icon(m.unlocked ? 'check' : 'target')}</span><span class="xp-chip">${m.unlocked ? 'Erhalten' : '+'} ${m.reward} XP</span></div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><progress max="${m.target}" value="${m.current}" aria-label="${esc(m.title)}: ${m.current} von ${m.target}"></progress><small>${m.unlocked ? 'MISSION ERFÜLLT' : `${m.current} / ${m.target}`}</small></article>`).join('')}</div><p class="game-fine-print">XP werden aus abgeschlossenen Einsätzen dieser App berechnet. Der Einsatzrang wird separat durch Rangpunkte (RR) bestimmt. 100 XP + 2 × Bewertung pro gelöstem Karrierefall, 25 XP zusätzlich ohne Fehländerung oder unnötigen Check. Im Speedrun: 100 XP je gelöstem Ticket, vergeben am Schichtende.</p></section>`;
}

function completionCard() { return resultScreen(); }

function resultProgressRewards(reward) {
  const gains = reward.masteryGains || [], rewards = reward.newRewards || [];
  const animalGains = reward.companionFormGains || [];
  if (!reward.passXp && !gains.length && !rewards.length && !animalGains.length) return '';
  return `${progressionSecretReveal(rewards)}<div class="result-progression"><div><span>BATTLEPASS</span><strong>+${Number(reward.passXp) || 0} PASS-XP</strong></div>${gains.map(m => `<div><span>${esc(m.name)} · DEINE FACHMEISTERUNG</span><strong>+${m.xp} Meisterungs-XP${m.lordUnlocked ? ' · TITEL VERDIENT' : ''}</strong></div>`).join('')}${animalGains.map(m => `<div><span>${esc(m.characterName)} · EIGENE FORMEN</span><strong>+${m.xp} eigene Formen-XP${m.astralUnlocked ? ' · ASTRAL-LORD' : m.eternalUnlocked ? ' · EWIGER LORD' : m.goldUnlocked ? ' · GOLD-LORD' : m.silverUnlocked ? ' · SILBER-LORD' : m.lordUnlocked ? ' · LORD' : ''}</strong></div>`).join('')}${rewards.length ? `<p>Freigeschaltet: ${rewards.map(item => esc(item.name)).join(' · ')}</p>` : ''}<button class="text-button" data-view="mastery">Meisterung ansehen ${icon('arrow')}</button></div>`;
}

function sortedQueue() {
  let tickets = [...(state.session?.queue || [])];
  if (queueFilter === 'open') tickets = tickets.filter(item => ['open', 'unknown'].includes(item.status));
  if (queueFilter === 'closed') tickets = tickets.filter(item => !['open', 'unknown'].includes(item.status));
  const query = queueSearch.trim().toLocaleLowerCase('de');
  if (query) tickets = tickets.filter(item => `${item.number} ${item.title} ${item.requester} ${item.department}`.toLocaleLowerCase('de').includes(query));
  const sorters = {
    priority: (a, b) => a.priority.localeCompare(b.priority) || a.arrivalMinute - b.arrivalMinute,
    waiting: (a, b) => b.age - a.age,
    sla: (a, b) => a.remaining - b.remaining,
    arrival: (a, b) => b.arrivalMinute - a.arrivalMinute,
    department: (a, b) => a.department.localeCompare(b.department, 'de'),
    requester: (a, b) => a.requester.localeCompare(b.requester, 'de'),
  };
  return tickets.sort(sorters[queueSort] || sorters.priority);
}

function canWaitForArrival() {
  const session = state?.session;
  return session?.mode === 'speedrun' && session.status === 'active' && session.canWaitForArrival === true &&
    !(session.queue || []).some(item => ['open', 'unknown'].includes(item.status));
}

function queueIdle() {
  if (!canWaitForArrival()) return '';
  return `<div class="queue-idle" role="status"><div><span class="eyebrow">IN BEREITSCHAFT</span><h3>Alle eingegangenen Tickets sind erledigt.</h3><p>Die Schicht läuft in simulierter Zeit. Spule bis zur nächsten Meldung oder zum Schichtende vor; das zählt als Wartezeit.</p></div><button class="button primary" data-action="wait-arrival" ${isBusy() ? 'disabled' : ''}>Auf nächste Meldung warten ${icon('clock')}</button></div>`;
}

function queueRows() {
  const tickets = sortedQueue();
  const statusNames = { open: 'Offen', solved: 'Gelöst', abandoned: 'Aufgegeben', unknown: 'Status noch nicht erfasst' };
  return tickets.length ? tickets.map(item => `<article class="queue-ticket ${item.active ? 'selected' : ''}"><div class="queue-priority"><span class="priority priority-${item.priority.toLowerCase()}">${esc(item.priority)}</span><strong>${esc(item.number)}</strong></div><div class="queue-ticket-copy"><h3>${esc(item.title)}</h3><p>${esc(item.requester)} <span>·</span> ${esc(item.department)}</p><small>${item.active ? 'AKTIV · ' : ''}${statusNames[item.status]} · Eingang Min. ${item.arrivalMinute}</small></div><div class="queue-timing"><strong>${item.age} Min.</strong><small>${['open', 'unknown'].includes(item.status) ? 'seit Eingang' : 'bis Abschluss'}</small><span class="${item.remaining < 0 ? 'sla-late' : ''}">${item.remaining < 0 ? `SLA um ${Math.abs(item.remaining)} Min. überschritten` : `SLA: ${item.remaining} Min. ${['open', 'unknown'].includes(item.status) ? 'übrig' : 'Reserve'}`}</span></div><button class="button ${item.active ? '' : 'primary'}" data-switch="${esc(item.number)}" ${isBusy() || !active() || item.active || !['open', 'unknown'].includes(item.status) ? 'disabled' : ''}>${['open', 'unknown'].includes(item.status) ? item.active ? 'In Bearbeitung' : 'Übernehmen · 1 Min.' : statusNames[item.status]}</button></article>`).join('') : canWaitForArrival() && queueFilter === 'open' && !queueSearch ? '' : '<p class="queue-empty">Keine Tickets für diese Ansicht.</p>';
}

function queueBoard() {
  const session = state.session;
  if (session?.mode !== 'speedrun') return '';
  const all = session.queue || [], open = all.filter(item => ['open', 'unknown'].includes(item.status)).length;
  return `<section class="queue-board" aria-label="Speedrun-Ticketliste"><div class="queue-heading"><div><span class="eyebrow">LEITSTELLE / LIVE-EINGANG</span><h2>Deine Schicht. Deine Reihenfolge.</h2></div><div class="shift-clock"><strong>${session.elapsed}<small> / ${session.duration} Min.</small></strong><span>${open} offen · ${all.filter(item => item.status === 'solved').length} gelöst</span></div></div><progress class="shift-meter" max="${session.duration}" value="${session.elapsed}" aria-label="Simulierte Schichtzeit"></progress><div class="queue-toolbar"><label>Ansicht<select id="queue-filter">${[['open','Offene Tickets'],['all','Alle eingegangenen'],['closed','Abgeschlossene']].map(([value,label]) => `<option value="${value}" ${queueFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Sortieren nach<select id="queue-sort">${[['priority','Priorität'],['sla','SLA zuerst fällig'],['waiting','Längste Wartezeit'],['arrival','Neueste zuerst'],['department','Abteilung'],['requester','Mitarbeiter']].map(([value,label]) => `<option value="${value}" ${queueSort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="queue-search">Suchen<input id="queue-search" type="search" value="${esc(queueSearch)}" placeholder="Ticket, Mitarbeiter oder Abteilung"></label></div><div id="ticket-rows">${queueRows()}</div>${queueIdle()}<p class="game-fine-print">Neue Meldungen erscheinen nach deiner Aktion, sobald die simulierte Schichtzeit ihre Ankunft erreicht. Sortieren und Suchen kosten keine Zeit. Ein Ticketwechsel kostet eine Minute.</p>${active() ? `<button class="text-button" data-action="end-shift">Schicht vorzeitig beenden ${icon('arrow')}</button>` : ''}</section>`;
}

function renderArrivals() {
  const container = document.querySelector('#ticket-notices');
  if (!container) return;
  const live = state.session;
  arrivalNotices = arrivalNotices.filter(item => item.sessionId === live?.id && live.status === 'active' && ['open', 'unknown'].includes(live.queue?.find(ticket => ticket.number === item.number)?.status));
  const signature = JSON.stringify(arrivalNotices.slice(-3));
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.innerHTML = arrivalNotices.slice(-3).map(item => `<article class="arrival-popup"><div><span class="eyebrow">NEUES TICKET · ${esc(item.number)} · ${esc(item.priority)}</span><button class="arrival-dismiss" data-dismiss-arrival="${esc(item.number)}" aria-label="Meldung ${esc(item.number)} ausblenden">×</button></div><strong>${esc(item.title)}</strong><p>${esc(item.requester)} · ${esc(item.department)}</p><button class="text-button" data-action="show-queue">Ticketliste ansehen ${icon('arrow')}</button></article>`).join('');
}

document.addEventListener('change', event => {
  if (event.target.id === 'queue-sort') { queueSort = event.target.value; render(); }
  if (event.target.id === 'queue-filter') { queueFilter = event.target.value; render(); }
  if (event.target.name === 'level' || event.target.name === 'careerStartLevel') {
    const node = document.querySelector('#difficulty-preview');
    if (node) node.outerHTML = difficultyCard(Number(event.target.value), 'difficulty-preview');
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'queue-search') { queueSearch = event.target.value; document.querySelector('#ticket-rows').innerHTML = queueRows(); }
});
