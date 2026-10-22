'use strict';

// Eight-pixel glyphs use filled, integer-aligned blocks throughout the game.
const pixelIconGlyphs = {
  "grid": [
    "11100111",
    "10100101",
    "11100111",
    "00000000",
    "00000000",
    "11100111",
    "10100101",
    "11100111"
  ],
  "terminal": [
    "11111111",
    "10000001",
    "10100001",
    "10010001",
    "10100101",
    "10000001",
    "10000001",
    "11111111"
  ],
  "bolt": [
    "00011000",
    "00111000",
    "01110000",
    "11111110",
    "00011100",
    "00111000",
    "00110000",
    "01100000"
  ],
  "chart": [
    "10000000",
    "10000010",
    "10010010",
    "10010010",
    "11010010",
    "11011010",
    "11011010",
    "11111111"
  ],
  "file": [
    "01111000",
    "01001100",
    "01000110",
    "01000010",
    "01111010",
    "01000010",
    "01111010",
    "01111110"
  ],
  "settings": [
    "00111100",
    "01100110",
    "11000011",
    "10011001",
    "10011001",
    "11000011",
    "01100110",
    "00111100"
  ],
  "arrow": [
    "00001000",
    "00001100",
    "00000110",
    "11111111",
    "11111111",
    "00000110",
    "00001100",
    "00001000"
  ],
  "back": [
    "00010000",
    "00110000",
    "01100000",
    "11111111",
    "11111111",
    "01100000",
    "00110000",
    "00010000"
  ],
  "refresh": [
    "00111100",
    "01100111",
    "11000011",
    "10000011",
    "11000001",
    "11000011",
    "11100110",
    "00111100"
  ],
  "check": [
    "00111100",
    "01100110",
    "11000011",
    "10001001",
    "10110001",
    "11010011",
    "01100110",
    "00111100"
  ],
  "clock": [
    "00111100",
    "01100110",
    "11010011",
    "10010001",
    "10011101",
    "11000011",
    "01100110",
    "00111100"
  ],
  "layers": [
    "00011000",
    "01111110",
    "11011011",
    "00111100",
    "11000011",
    "01111110",
    "11000011",
    "00111100"
  ],
  "target": [
    "00111100",
    "01100110",
    "11011011",
    "10111101",
    "10111101",
    "11011011",
    "01100110",
    "00111100"
  ],
  "calendar": [
    "01000010",
    "11111111",
    "11000011",
    "11111111",
    "10000001",
    "10101001",
    "10000001",
    "11111111"
  ],
  "light": [
    "00111100",
    "01100110",
    "01000010",
    "01000010",
    "01100110",
    "00111100",
    "00111100",
    "00011000"
  ],
  "shield": [
    "11111111",
    "10000001",
    "10000001",
    "10011001",
    "01011010",
    "01000010",
    "00100100",
    "00011000"
  ],
  "send": [
    "11000000",
    "11110000",
    "10111100",
    "10001111",
    "11111111",
    "10001111",
    "10111100",
    "11110000"
  ],
  "link": [
    "00011110",
    "00110011",
    "01100011",
    "11001110",
    "01110011",
    "11000110",
    "11001100",
    "01111000"
  ]
};
const icons = Object.fromEntries(Object.entries(pixelIconGlyphs).map(([name,rows])=>[name,rows.flatMap((row,y)=>[...row].flatMap((bit,x)=>bit==='1'?['M'+(x*2)+' '+(y*2)+'h2v2h-2z']:[])).join('')]));
const icon = name => '<svg class="icon pixel-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path d="'+icons[Object.hasOwn(icons,name)?name:'file']+'"/></svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const levels = ['IT-Support', 'Fortgeschrittener IT-Support', 'Junior-Systemadministrator', 'Systemadministrator', 'Senior-Systemadministrator', 'Infrastruktur-Experte'];
const views = [['menu', 'Hauptmenü', 'grid'], ['overview', 'Übersicht', 'grid'], ['simulation', 'Simulation', 'terminal'], ['speedrun', 'Speedrun', 'bolt'], ['missions', 'Missionen', 'target'], ['battlepass', 'Battlepass', 'shield'], ['mastery', 'Meisterung', 'chart'], ['career', 'Karriere', 'chart'], ['reports', 'Berichte', 'file'], ['settings', 'Einstellungen', 'settings'], ['profile', 'Dein Profil', 'shield'], ['ranks', 'Rangübersicht', 'shield'], ['casino', 'Arcane Casino', 'target'], ['leaderboard', 'Leaderboard', 'chart']];
let state = null, token = '', currentView = 'menu', pending = false, draft = '', selectedReport = null, toastTimer, statusTimer;
const main = document.querySelector('#main');

function inline(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
const renderedHtml = new WeakMap();
function replaceHtml(node, html) {
  if (renderedHtml.get(node) === html) return false;
  node.innerHTML = html;
  renderedHtml.set(node, html);
  return true;
}
// Repeated status renders reuse already escaped Markdown; keep history memory bounded.
const markdownCache = new Map();
let markdownCacheSize = 0;
function markdown(text = '') {
  const source = String(text);
  if (markdownCache.has(source)) return markdownCache.get(source);
  const html = renderMarkdown(source), size = source.length + html.length;
  if (size <= 500000) {
    while (markdownCache.size && (markdownCache.size >= 128 || markdownCacheSize + size > 500000)) {
      const [key, value] = markdownCache.entries().next().value;
      markdownCacheSize -= key.length + value.length;
      markdownCache.delete(key);
    }
    markdownCache.set(source, html); markdownCacheSize += size;
  }
  return html;
}
function renderMarkdown(text = '') {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  let html = '', paragraph = [], code = null, table = [], list = false;
  const flushParagraph = () => { if (paragraph.length) { html += `<p>${paragraph.map(inline).join('<br>')}</p>`; paragraph = []; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter(line => !/^\|?[\s:|-]+\|?$/.test(line));
    html += '<div class="table-wrap"><table>' + rows.map((row, i) => '<tr>' + row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => `<${i ? 'td' : 'th'}>${inline(cell.trim())}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table></div>';
    table = [];
  };
  const flushList = () => { if (list) html += '</ul>'; list = false; };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph(); flushTable(); flushList();
      if (code !== null) { html += `<pre><code>${esc(code.join('\n'))}</code></pre>`; code = null; } else code = [];
    } else if (code !== null) code.push(line);
    else if (line.trim().startsWith('|')) { flushParagraph(); flushList(); table.push(line.trim()); }
    else {
      flushTable();
      const heading = line.match(/^(#{1,3})\s+(.+)$/), bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
      if (bullet) { flushParagraph(); if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(bullet[1])}</li>`; }
      else {
        flushList();
        if (heading) { flushParagraph(); html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`; }
        else if (!line.trim()) flushParagraph();
        else if (line.startsWith('> ')) { flushParagraph(); html += `<blockquote>${inline(line.slice(2))}</blockquote>`; }
        else if (!/^\s*---+\s*$/.test(line)) paragraph.push(line);
      }
    }
  }
  flushParagraph(); flushTable(); flushList();
  if (code !== null) html += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
  return html;
}

async function api(path, data) {
  const response = await fetch(`/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'X-Sim-Token': token, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Anfrage fehlgeschlagen (${response.status}).`);
  return result;
}
function toast(message, error = false) {
  if (error) window.GameAudio?.play('error');
  const node = document.querySelector('#toast');
  clearTimeout(toastTimer); node.textContent = message; node.className = error ? 'error' : ''; node.hidden = false;
  toastTimer = setTimeout(() => { node.hidden = true; }, error ? 12000 : 5000);
}
const isBusy = () => pending || state?.busy;
const active = () => state?.session?.status === 'active';
const button = (label, action, primary = false, symbol = 'arrow') => `<button class="button${primary ? ' primary' : ''}" data-action="${action}" ${isBusy() ? 'disabled' : ''}>${label}${icon(symbol)}</button>`;
const stat = (key, fallback = '–') => state?.stats?.[key] ?? fallback;
function heading(title, subtitle, action = '') {
  return `<div class="page-heading"><div><span class="eyebrow">DEIN IT-TRAININGSPLATZ</span><h1>${title}</h1><p>${subtitle}</p></div>${action || `<span class="date-label">${icon('calendar')}${esc(new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date()))}</span>`}</div>`;
}
function authNotice() {
  if (state.auth?.available) return '';
  return `<div class="notice"><span>Dein ChatGPT-Konto ist noch nicht verbunden. ${esc(state.auth?.reason || 'Öffne die Einstellungen, um die Verbindung zu prüfen.')}</span><button class="text-button" data-view="settings">Verbindung prüfen ${icon('arrow')}</button></div>`;
}
function metrics() {
  const data = [['check', 'Abgeschlossene Tickets', stat('Abgeschlossene Tickets', '0'), '', 'Dein bisheriger Fortschritt'], ['target', 'Durchschnittliche Bewertung', stat('Durchschnittliche Punktzahl'), '/ 100', 'Nach abgeschlossenen Tickets'], ['clock', 'Ø Lösungszeit', stat('Durchschnittliche Lösungszeit'), '', 'Simulierte Arbeitszeit'], ['layers', 'Dein Einsatzrang', (state.game?.ranked?.index || 0) + 1, '/ 18', state.game?.ranked?.name || 'IT-Support 1']];
  return `<div class="metrics">${data.map(([i, label, value, unit, foot]) => `<div class="metric"><div class="metric-label">${icon(i)}${label}</div><div class="metric-value">${esc(value)}<small>${unit}</small></div><div class="metric-foot">${esc(foot)}</div></div>`).join('')}</div>`;
}
const infrastructure = menuArtwork;

function overview() {
  return heading('DEINE LEITSTELLE', 'Deine Leitstelle. Deine Entscheidungen. Dein nächster Rang.') + gameProgress() +
    `<section class="hero"><div class="hero-copy"><span class="eyebrow">SYSADMIN CAREER MODE</span><h2>Du hältst den<br>Betrieb am Laufen.</h2><p>Übernimm deinen nächsten Fall, stelle den Betrieb wieder her und schalte neue Erfolge frei.</p><p class="hero-mission">${esc(state.game?.missions.find(m => !m.unlocked)?.title || 'Alle Missionen erfüllt')} ${state.game?.missions.find(m => !m.unlocked) ? '· +' + state.game.missions.find(m => !m.unlocked).reward + ' XP' : ''}</p><div class="button-row">${button(active() ? 'Simulation fortsetzen' : 'Neues Ticket starten', active() ? 'resume' : 'start', true)}<button class="button ghost" data-view="career">Deine Karriere ${icon('arrow')}</button></div></div><div class="hero-art">${infrastructure}</div></section>` +
    difficultyCard(state.level) + metrics() + `<div class="section-head"><h2>Dein nächster Einsatz</h2>Wähle deinen Trainingsmodus</div><div class="training-grid"><article class="training-card"><div class="tile-icon">${icon('terminal')}</div><div><span class="small-badge">FOKUS</span><h3>Ein Ticket. Dein Tempo.</h3><p>Geh einer Störung auf den Grund. Schritt für Schritt, mit einer Auswertung zum Abschluss.</p><button class="text-button" data-action="${active() ? 'resume' : 'start'}" ${isBusy() ? 'disabled' : ''}>${active() ? 'Ticket fortsetzen' : 'Karriere starten'} ${icon('arrow')}</button></div></article><article class="training-card"><div class="tile-icon coral">${icon('bolt')}</div><div><span class="small-badge">CHALLENGE</span><h3>Deine Schicht. Dein Highscore.</h3><p>Neue Tickets, laufende SLAs und klare Prioritäten. Behalte im Speedrun den Überblick.</p><button class="text-button" data-view="speedrun">Speedrun konfigurieren ${icon('arrow')}</button></div></article></div><div class="lower-grid"><section><div class="section-head"><h2>Letzte Aktivität</h2><button class="text-button" data-view="reports">Alle Berichte ${icon('arrow')}</button></div><div class="activity-panel">${state.session ? `<button class="report-button" data-view="simulation">${icon('terminal')}<span>${esc(state.session.ticket?.title || 'Deine Simulation')}<small>${active() ? 'In Bearbeitung · Fortschritt gespeichert' : 'Abgeschlossen · Auswertung verfügbar'}</small></span>${icon('arrow')}</button>` : ''}${state.reports?.length ? state.reports.slice(0,2).map(reportRow).join('') : !state.session ? `<div class="empty-activity">${icon('file')}<div><h3>Deine Geschichte beginnt mit Ticket #1001.</h3><p>Deine abgeschlossenen Einsätze und Auswertungen<br>findest du anschließend hier.</p></div></div>` : ''}</div></section><section><div class="section-head"><h2>Gut zu wissen</h2><span>01 / TRAININGSPRINZIP</span></div><div class="learning-note"><span class="eyebrow">${icon('light')} ECHTES VERSTÄNDNIS ZÄHLT</span><p>Ein erfolgreicher Ping ist noch keine Lösung. <strong>Prüfe den Dienst – und bestätige die Wiederherstellung.</strong></p></div></section></div>`;
}
function reportRow(report) { return `<button class="report-button" data-report="${esc(report.id)}">${icon('file')}<span>${esc(report.title)}<small>Abschlussbericht ansehen</small></span>${icon('arrow')}</button>`; }
function simulation() { return missionScreen(); }
function pendingPanel() { return `<div class="busy-message"><span class="spinner"></span>Die Simulation wird verarbeitet. Dein Spielstand bleibt erhalten.<button class="text-button" data-action="cancel">Abbrechen</button></div>`; }
function speedrun() { return loadoutScreen(); }
function career() {
  return heading('DEINE KARRIERE', 'Deine Entwicklung als Systemadministrator – nachvollziehbar und auf Basis deiner Entscheidungen.') + gameProgress(false) + `<button class="text-button rank-overview-link" data-view="ranks">Alle 18 Rangstufen ansehen ${icon('arrow')}</button>` + metrics() +
    `<div class="two-column"><section class="panel"><span class="eyebrow">DEINE LEISTUNG</span><h2>Der Weg zählt mit.</h2><p>Eine schnelle Lösung ist gut. Eine verstandene, sichere und überprüfte Lösung ist besser. Jeder abgeschlossene Einsatz wird in sechs Kategorien bewertet.</p><ul class="rule-list">${[['Problemlösung', 25], ['Technische Diagnose', 20], ['Effizienz', 15], ['Geschwindigkeit', 15], ['Sicherheit & Risikobewusstsein', 15], ['Prüfung & Dokumentation', 10]].map(([l, n]) => `<li>${l}<strong>${n} Punkte</strong></li>`).join('')}</ul><div class="section-head mt-26"><h3>Deine Gesamtstatistik</h3></div><div class="markdown"><table>${Object.entries(state.stats || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div></section><section class="panel"><span class="eyebrow">KARRIEREPFAD</span><h2>Schritt für Schritt.</h2>${careerRankTrack()}<p class="fine-print">Jeder Rang hat drei Stufen. Nach Stufe 3 beginnt der nächste Rang bei Stufe 1.</p></section></div>`;
}
function reports() {
  const report = state.reports?.find(r => r.id === selectedReport);
  if (report) return heading('Deine Auswertung', 'Ursache, Lösungsweg und konkrete Erkenntnisse für deinen nächsten Einsatz.') + `<button class="text-button back-button" data-action="all-reports">${icon('back')} Alle Berichte</button><section class="panel markdown report-reader">${markdown(report.content)}</section>`;
  return heading('EINSATZARCHIV', 'Alle abgeschlossenen Tickets und Schichten. Dein persönliches Nachschlagewerk.') + (state.reports?.length ? `<div class="activity-panel">${state.reports.map(reportRow).join('')}</div>` : `<section class="panel empty-state"><div class="tile-icon">${icon('file')}</div><h2>Hier entsteht dein Erfahrungsarchiv.</h2><p>Nach deinem ersten abgeschlossenen Ticket findest du hier die Ursache, deine Bewertung und konkrete Verbesserungsmöglichkeiten.</p>${button(active() ? 'Zum laufenden Einsatz' : 'Erstes Ticket starten', active() ? 'resume' : 'start', true)}</section>`);
}
function settings() {
  return heading('OPTIONEN', 'Dein Spiel. Deine Regeln. Dein Sound.') + `<div class="two-column"><section class="panel"><div class="setting-status"><div class="tile-icon">${icon('link')}</div><div><h3>ChatGPT-Verbindung</h3><p>${state.auth?.available ? 'Verbunden · Deine vorhandene Anmeldung wird verwendet.' : 'Noch nicht verbunden'}</p></div></div><div class="connection-copy"><p>${esc(state.auth?.reason || 'Die lokale ChatGPT-Anbindung ist bereit. Die Antworten erscheinen direkt hier im Simulator.')}</p><p>Wie bei JORY wird die lokale Codex-Komponente deiner ChatGPT-/Codex-App im Hintergrund verwendet. Ein API-Schlüssel ist nicht erforderlich. Melde dich in der App mit deinem ChatGPT-Konto an und prüfe anschließend die Verbindung.</p></div>${button('Verbindung erneut prüfen', 'connection', false, 'refresh')}<form id="settings-form" class="mt-32"><label class="form-field">Darstellung<select name="theme"><option value="dark" ${state.theme !== 'light' ? 'selected' : ''}>Dunkel</option><option value="light" ${state.theme === 'light' ? 'selected' : ''}>Hell</option></select><small>Wird auf diesem Rechner gespeichert und beim nächsten Start wieder verwendet.</small></label><div class="ranked-settings"><h3>Dein Rang bestimmt die Schwierigkeit</h3><p>Aktuell: <strong>${esc(state.game?.ranked?.name || 'IT-Support')} · ${state.game?.ranked?.rr || 0} / 100 RR</strong></p><p>100 RR pro Rang. Leichter Einstieg auf Rang 1–3: Ab 70 Punkten erhältst du einen Einstiegsbonus, Abzüge fallen kleiner aus. Perfekte Einsätze bringen +33/+25/+18 RR; pro Einsatz verlierst du dort höchstens 12/20/30 RR. Ab Rang 4 bleibt die anspruchsvolle Kurve mit +10/+9/+7 RR und maximal 59/73/92 RR Verlust. Bereits abgeschlossene Fälle behalten ihre bisherigen Rangpunkte. Unter 0 RR steigst du ab. Ab Rang 4 kommen anspruchsvolle Linux-Tickets hinzu.</p><p>Nur simulierte Arbeitszeit zählt. Deine reale Schreibzeit bleibt außen vor. Im Speedrun kannst du jede Stufe frei trainieren.</p></div>${difficultyCard(state.level, 'difficulty-preview')}<label class="form-field">Modell<input name="model" value="${esc(state.model)}" pattern="[a-zA-Z0-9][a-zA-Z0-9._:\\-]{0,99}" maxlength="100" required spellcheck="false"><small>Verwende ein Modell, das für dein ChatGPT-Konto verfügbar ist. Standard: gpt-6-luna.</small></label><button class="button primary" type="submit" ${isBusy() ? 'disabled' : ''}>Einstellungen speichern ${icon('check')}</button></form></section><section class="panel"><div class="tile-icon mb-20">${icon('shield')}</div><h2>Dein eigener Trainingsraum.</h2><p>Spielstand, Chatverlauf und Berichte werden automatisch auf diesem Rechner gespeichert.</p><ul class="rule-list"><li>Anmeldung<strong>ChatGPT-Konto</strong></li><li>Verbindung<strong>Lokal auf deinem PC</strong></li><li>Systembefehle<strong>Nur simuliert</strong></li><li>Fortschritt<strong>Automatisch gespeichert</strong></li></ul><p class="fine-print">KI-Antworten nutzen dein verfügbares ChatGPT-/Codex-Kontingent. Die eingegebenen Simulationstexte werden zur Verarbeitung an OpenAI übermittelt.</p>${audioPanel()}<div class="reset-settings mt-32"><h3>Trainingsdaten zurücksetzen</h3><p>Setzt Karriere, Missionen, Battlepass, Meisterungen, freigeschaltete Belohnungen, laufende Tickets, Chatverläufe, Berichte, Speedruns und die simulierte Unternehmensumgebung zurück. Du beginnst wieder mit Ticket #1001.</p><p>Neustart auf Rang 1 · IT-Support mit 0 RR und einer neuen Begleiterwahl.</p><p class="fine-print">Anmeldung, Modell, Darstellung und Audio bleiben erhalten. Vorher wird eine lokale Sicherung angelegt. Daten aus der Terminal-Version werden im neuen Spielstand nicht mehr eingebunden.</p><button class="button reset-button" data-action="reset" ${isBusy() ? 'disabled' : ''}>Trainingsdaten zurücksetzen ${icon('refresh')}</button></div></section></div>`;
}

let missionRotationTimer;
function scheduleMissionRotation() {
  clearTimeout(missionRotationTimer);
  if (!state?.game?.challenges) return;
  const ends = ['daily', 'weekly'].map(kind => Date.parse(state.game.challenges[kind]?.endsAt)).filter(time => Number.isFinite(time) && time > Date.now());
  if (ends.length) missionRotationTimer = setTimeout(() => {
    if (!isBusy()) refresh().catch(error => toast(error.message, true));
  }, Math.min(2147483647, Math.max(50, Math.min(...ends) - Date.now() + 100)));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state && !isBusy()) refresh().catch(() => {});
});
function render() {
  if (!state) return;
  if (state.game?.companionChosen === false) currentView = 'profile';
  if (location.hash !== `#${currentView}`) history.replaceState(null, '', `#${currentView}`);
  document.body.classList.add('has-companion-dock');
  scheduleMissionRotation();
  document.body.dataset.screen = currentView;
  window.GameAudio?.setScene(currentView === 'simulation' ? (state.session?.status === 'completed' ? 'debrief' : 'play') : 'menu');
  document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  clearTimeout(statusTimer);
  // Resume observing a turn after a page reload or a request in another tab.
  if (state.busy && !pending) statusTimer = setTimeout(() => refresh().catch(error => toast(error.message, true)), 1500);
  replaceHtml(document.querySelector('#navigation'), views.filter(([id]) => !['profile', 'ranks'].includes(id)).map(([id, label, sym], i) => `${i === 6 ? '<div class="nav-divider"></div>' : ''}<button class="nav-button ${currentView === id ? 'active' : ''}" data-view="${id}" title="${label}" ${currentView === id ? 'aria-current="page"' : ''}>${icon(sym)}<span>${label}</span>${id === 'simulation' && active() ? '<span class="nav-count">1</span>' : ''}</button>`).join(''));
  document.querySelector('#page-title').textContent = views.find(v => v[0] === currentView)?.[1] || 'Übersicht';
  document.querySelector('#sidebar-level').textContent = state.game?.ranked?.name || 'IT-Support 1';
  document.querySelector('#connection').className = `connection ${state.auth?.available ? '' : 'offline'}`;
  replaceHtml(document.querySelector('#connection'), `<span class="small-dot"></span>${state.auth?.available ? 'ChatGPT verbunden' : 'ChatGPT nicht verbunden'}`);
  replaceHtml(document.querySelector('#refresh'), icon('refresh'));
  document.querySelector('#refresh').disabled = pending;
  const viewChanged = replaceHtml(main, ({ menu: mainMenu, casino: typeof casinoScreen === 'function' ? casinoScreen : overview, leaderboard: typeof leaderboardScreen === 'function' ? leaderboardScreen : overview, ranks: ranksScreen, profile: companionProfile, missions: missionsPanel, battlepass: progressionPass, mastery: progressionMastery, overview, simulation, speedrun, career, reports, settings }[currentView] || overview)());
  renderCompanionDock();
  if (viewChanged) mountMenuMotion();
  if (typeof mountArcaneViews === 'function') mountArcaneViews();
  renderArrivals();
  replaceHtml(document.querySelector('#play-header'), gameNavigation());
  if (typeof window.mountPassExtras === 'function') window.mountPassExtras();
  updateAudioControls();
  if (viewChanged || window.matchMedia('(prefers-reduced-motion: reduce)').matches) animateDebrief();
  if (viewChanged && currentView === 'simulation') { const log = document.querySelector('#messages'); if (log) log.scrollTop = log.scrollHeight; }
}
function navigate(view) { if (!views.some(v => v[0] === view)) view = 'menu'; if (state?.game?.companionChosen === false) view = 'profile'; const changed=currentView!==view; currentView = view; if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`); render(); if(changed) {main.scrollTo({top:0,left:0,behavior:'instant'});window.GameAudio?.play('navigate');window.ArcaneFX?.emit('portal');} if(changed && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) main.animate([{opacity:.25,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'ease-out'}); }
async function refresh() { acceptState(await api('state')); render(); }
async function mutate(path, body, success) {
  if (isBusy()) return;
  pending = true; render();
  try { const response = await api(path, body); acceptState(response.state || response); if (success) toast(success); }
  catch (error) { toast(error.message, true); try { acceptState(await api('state')); } catch {} }
  finally { pending = false; render(); }
}
async function start(mode = 'career', options = {}) {
  if (state.game?.companionChosen === false) { navigate('profile'); return; }
  if (active()) { navigate('simulation'); return; }
  if (!state.auth?.available) { navigate('settings'); toast('Bitte prüfe zuerst deine ChatGPT-Verbindung.'); return; }
  navigate('simulation');
  await mutate('start', { mode, level: state.level || 3, ...options });
}
async function send(message) {
  if (!message.trim() || isBusy() || !active()) return;
  window.GameAudio?.play('spell'); window.ArcaneFX?.emit('spell');
  const previous = message;
  draft = '';
  pending = true; render();
  try { const response = await api('message', { message }); acceptState(response.state || response); }
  catch (error) { draft = previous; toast(error.message, true); try { acceptState(await api('state')); } catch {} }
  finally { pending = false; render(); document.querySelector('#message')?.focus(); }
}
document.addEventListener('click', async event => {
  const target = event.target.closest('button, a[data-view]');
  if (!target || target.disabled) return;
  try {
    if (!target.dataset.view && !['sound', 'sound-test'].includes(target.dataset.action)) window.GameAudio?.play(target.dataset.action==='ability'?'spell':target.dataset.progressionEquip?'equip':'click');
    if (target.dataset.view) { selectedReport = null; navigate(target.dataset.view); return; }
    if (target.dataset.switch) { await switchTicket(target.dataset.switch); return; }
    if (target.dataset.dismissArrival) { arrivalNotices = arrivalNotices.filter(item => item.number !== target.dataset.dismissArrival); renderArrivals(); return; }
    if (target.dataset.report) { selectedReport = target.dataset.report; navigate('reports'); return; }
    switch (target.dataset.action) {
      case 'sound': previewAudio({ muted: !state.audio.muted }); await saveAudio(); break;
      case 'companion-ability': await mutate('ability', {}); break;
      case 'sound-test': await window.GameAudio?.unlock(); window.GameAudio?.play('arrival'); break;
      case 'start': await start(); break;
      case 'resume': navigate('simulation'); break;
      case 'show-queue': arrivalNotices = []; queueFilter = 'open'; queueSearch = ''; navigate('simulation'); document.querySelector('.queue-board')?.scrollIntoView({ block: 'start' }); break;
      case 'wait-arrival': if (canWaitForArrival()) await send('Bis zur nächsten Meldung warten'); break;
      case 'end-shift': if (confirm('Schicht jetzt beenden und auswerten? Offene Tickets zählen als ungelöst.')) await send('Schicht beenden'); break;
      case 'refresh': await refresh(); break;
      case 'connection': await mutate('connection', {}, 'Verbindungsstatus aktualisiert.'); break;
      case 'help': await send('Hilfe'); break;
      case 'giveup': if (confirm('Diesen Einsatz aufgeben und auswerten lassen?')) await send(state.session?.mode === 'speedrun' ? 'Schicht beenden' : 'Aufgeben'); break;
      case 'cancel': await api('cancel', {}); toast('Abbruch angefordert. Der letzte bestätigte Spielstand bleibt erhalten.'); await refresh(); break;
      case 'reset':
        if (isBusy()) break;
        if (confirm(`Alle Trainingsdaten zurücksetzen? Karriere, aktive Tickets, Chatverläufe, Berichte und Speedruns werden zurückgesetzt. Neustart auf Rang 1 mit 0 RR. Eine lokale Sicherung wird angelegt. Anmeldung, Modell, Darstellung und Audio bleiben erhalten.`)) {
          await mutate('reset', { confirmation: 'RESET' }, 'Trainingsdaten zurückgesetzt. Deine neue Karriere ist bereit.');
          if (!state.session && !state.reports.length) { draft = ''; selectedReport = null; }
        }
        break;
      case 'all-reports': selectedReport = null; render(); break;
    }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('input', event => { if (event.target.id === 'message') { draft = event.target.value; renderCompanionPassive(); } });
document.addEventListener('keydown', event => { if (event.target.id === 'message' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); document.querySelector('#message-form')?.requestSubmit(); } });
document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, data = new FormData(form);
  if (form.id === 'message-form') await send(String(data.get('message') || ''));
  if (form.id === 'speedrun-form') await start('speedrun', { duration: Number(data.get('duration')), level: Number(data.get('level')) });
  if (form.id === 'settings-form') await mutate('settings', { model: String(data.get('model')).trim(), theme: String(data.get('theme')) }, 'Einstellungen gespeichert.');
});
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
async function bootstrap() {
  try { ({ token } = await api('bootstrap')); acceptState(await api('state')); navigate(location.hash.slice(1) || 'menu'); }
  catch (error) { main.innerHTML = `<section class="panel error-panel"><h2>Der Trainingsplatz ist gerade nicht erreichbar.</h2><p>${esc(error.message)}</p><p>Starte die Anwendung über start.cmd und lade diese Seite erneut.</p><button class="button" id="retry-bootstrap">Erneut versuchen</button></section>`; document.querySelector('#retry-bootstrap').addEventListener('click', bootstrap); }
}
bootstrap();
