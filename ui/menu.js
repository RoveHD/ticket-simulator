'use strict';

let audioDraft = null, pendingAudioSaves = 0, audioSaveChain = Promise.resolve();
const audioDefaults = { muted: false, musicEnabled: true, effectsEnabled: true, musicVolume: .22, effectsVolume: .45, musicTrack: 'funk' };
const speakerIcon = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/></svg>`;
function soundButton() {
  const muted = state?.audio?.muted;
  return `<button class="sound-button ${muted ? 'muted' : ''}" data-action="sound" aria-label="Gesamten Ton stummschalten" aria-pressed="${!!muted}" title="${muted ? 'Ton einschalten' : 'Ton stummschalten'}">${speakerIcon}<span>${muted ? 'TON AUS' : 'TON AN'}</span></button>`;
}
function previewAudio(patch) {
  audioDraft = { ...audioDefaults, ...state.audio, ...patch };
  state.audio = { ...audioDraft };
  window.GameAudio?.configure(audioDraft);
  updateAudioControls();
}
function saveAudio() {
  const snapshot = { ...state.audio };
  pendingAudioSaves++;
  audioSaveChain = audioSaveChain.catch(() => {}).then(async () => {
    try { await api('audio', { audio: snapshot }); }
    catch (error) { toast('Audioeinstellungen konnten nicht gespeichert werden. ' + error.message, true); }
    finally { pendingAudioSaves--; if (!pendingAudioSaves) audioDraft = null; }
  });
  return audioSaveChain;
}
function updateAudioControls() {
  const audio = state?.audio || audioDefaults;
  for (const holder of document.querySelectorAll('[data-sound-control]')) replaceHtml(holder, soundButton());
  for (const output of document.querySelectorAll('[data-audio-value]')) output.textContent = `${Math.round(audio[output.dataset.audioValue] * 100)} %`;
  for (const control of document.querySelectorAll('[data-audio-control]')) {
    const value = audio[control.dataset.audioControl];
    if (control.type === 'checkbox') control.checked = value;
    else control.value = control.tagName === 'SELECT' ? value : Math.round(value * 100);
  }
}
function audioPanel() {
  const audio = state.audio || audioDefaults;
  return `<section class="audio-panel" aria-label="Musik und Soundeffekte"><div class="audio-heading"><div><span class="eyebrow">AUDIO / MIXER</span><h3>Der Sound deiner Schicht.</h3></div><div data-sound-control>${soundButton()}</div></div><label class="form-field music-choice">Soundtrack<select data-audio-control="musicTrack"><option value="funk" ${audio.musicTrack !== 'battle' ? 'selected' : ''}>Happy Funk</option><option value="battle" ${audio.musicTrack === 'battle' ? 'selected' : ''}>Pixel Rush</option></select><small>Musik wechseln – deine Auswahl wird sofort gespeichert.</small></label><label class="audio-switch"><input type="checkbox" data-audio-control="musicEnabled" ${audio.musicEnabled ? 'checked' : ''}><span>Hintergrundmusik<small>Gewählter Soundtrack · im Einsatz ruhiger</small></span></label><label class="audio-slider">Musiklautstärke <output data-audio-value="musicVolume">${Math.round(audio.musicVolume * 100)} %</output><input type="range" min="0" max="100" step="1" value="${Math.round(audio.musicVolume * 100)}" data-audio-control="musicVolume"></label><label class="audio-switch"><input type="checkbox" data-audio-control="effectsEnabled" ${audio.effectsEnabled ? 'checked' : ''}><span>Soundeffekte<small>Menü, neue Tickets, Abschlüsse und Rangaufstieg</small></span></label><label class="audio-slider">Effektlautstärke <output data-audio-value="effectsVolume">${Math.round(audio.effectsVolume * 100)} %</output><input type="range" min="0" max="100" step="1" value="${Math.round(audio.effectsVolume * 100)}" data-audio-control="effectsVolume"></label><button class="button" data-action="sound-test">${speakerIcon} Effekt anhören</button><p class="fine-print">Audioänderungen werden sofort gespeichert. Musik startet nach deiner ersten Bedienung und pausiert, wenn die App ausgeblendet wird. Happy Funk wird lokal erzeugt. Pixel Rush wird als lokale Musikdatei abgespielt.</p></section>`;
}

const menuArtwork = `<svg class="menu-network" viewBox="0 0 640 560" fill="none" aria-hidden="true">
  <defs><linearGradient id="tower-front" x1="220" y1="120" x2="400" y2="450" gradientUnits="userSpaceOnUse"><stop stop-color="#233867"/><stop offset="1" stop-color="#101c3c"/></linearGradient><linearGradient id="tower-side" x1="400" y1="100" x2="480" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="#172b4e"/><stop offset="1" stop-color="#0a122b"/></linearGradient></defs>
  <g class="network-floor" stroke="currentColor" opacity=".18"><path d="m65 360 260-150 265 150-265 150zM65 400l260-150 265 150-265 150zM120 330l265 150m-205-185 265 150m-205-185 265 150m-175-170L130 415m235-135L190 450m235-135L250 485"/></g>
  <path d="m139 340 183 102 174-100M322 442v75M140 340v-83M496 342v-85" stroke="#3ee4ed" stroke-width="2" opacity=".75" class="network-link"/>
  <g class="network-tower"><path d="m232 170 111-65 107 62v218l-111 65-107-62z" fill="url(#tower-front)" stroke="#6177ad"/><path d="m343 235 107-68v218l-111 65z" fill="url(#tower-side)" stroke="#354f85"/><path d="m232 170 111-65 107 62-107 68z" fill="#314c79" stroke="#6786bd"/>
  <g stroke="#4b6c9c" fill="#0d1934"><path d="m247 202 77 45v40l-77-45zM247 258l77 45v40l-77-45zM247 314l77 45v40l-77-45z"/></g>
  <g stroke="#44e6e7" stroke-width="3" class="server-lights"><path d="m260 219 26 15m-26 41 26 15m-26 41 26 15"/><path d="m307 249 5 3m-5 53 5 3m-5 53 5 3" stroke="#b79cff"/></g>
  <g stroke="#345a82"><path d="m361 252 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43m-70 58 70-43"/></g>
  </g><g class="network-satellite satellite-left"><path d="m93 245 47-27 48 28v51l-47 28-48-28z" fill="#15284a" stroke="#546fa7"/><path d="m93 245 48 28 47-27-48-28z" fill="#334e75"/><path d="m105 262 25 14v18l-25-14z" fill="#0a1730" stroke="#46dbe5"/><path d="m141 273 47-27v51l-47 28z" fill="#0c1a36"/></g>
  <g class="network-satellite satellite-right"><path d="m463 229 42-25 47 27v55l-42 25-47-27z" fill="#14274a" stroke="#546fa7"/><path d="m463 229 47 27 42-25-47-27z" fill="#3f416e"/><path d="m473 247 26 15v23l-26-15z" fill="#0b1533" stroke="#a88cff"/><path d="m510 256 42-25v55l-42 25z" fill="#14162d"/></g>
  <path class="network-packets" d="m140 322v18l182 102v75m0-75 174-100v-38" stroke="#81fff4" stroke-width="4" stroke-linecap="round"/>
  <g class="data-orbit"><circle cx="140" cy="322" r="4" fill="#4ff4ef"/><circle cx="396" cy="397" r="4" fill="#a88cff"/><circle cx="322" cy="488" r="4" fill="#4ff4ef"/></g>
  <path d="M190 155h-44v-30H70M462 141h39V99h62" stroke="#5c75a6" stroke-dasharray="3 5"/><circle cx="70" cy="125" r="3" fill="#a88cff"/><circle cx="563" cy="99" r="3" fill="#43dfe6"/>
  <text x="34" y="109" fill="#8da9cb" font-size="10" font-family="monospace" letter-spacing="2">IDENTITY / CORE</text><text x="466" y="82" fill="#8da9cb" font-size="10" font-family="monospace" letter-spacing="2">VIRTUAL LAB</text>
</svg>`;

function menuTitle() {
  const word = (value, className) => `<span class="title-line ${className}" data-word="${value}">${[...value].map(letter => `<span class="title-char">${letter}</span>`).join('')}</span>`;
  return `<h1 class="menu-title" aria-label="Ticket Simulator"><span class="title-row" aria-hidden="true">${word('TICKET', 'title-ticket')}</span><span class="title-row" aria-hidden="true">${word('SIMULATOR', 'title-simulator')}<b class="title-dot">.</b></span></h1>`;
}

let menuMotionCleanup = () => {}, menuMotionVisible = false;
function mountMenuMotion() {
  menuMotionCleanup();
  menuMotionCleanup = () => {};
  const title = document.querySelector('.menu-title');
  const entering = !menuMotionVisible;
  menuMotionVisible = !!title;
  if (!title) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const animations = new Set();
  let frame = 0, tilt = null;
  const animate = (node, frames, options) => {
    const animation = node.animate(frames, options);
    animations.add(animation);
    animation.onfinish = () => { if (options.fill !== 'forwards') animations.delete(animation); };
    animation.oncancel = () => animations.delete(animation);
    return animation;
  };
  menuMotionCleanup = () => {
    listeners.abort(); cancelAnimationFrame(frame);
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
  motion.addEventListener('change', mountMenuMotion, { signal: listeners.signal });
  if (motion.matches) return;
  const screen = title.closest('.start-screen');
  const visibility = () => {
    screen.classList.toggle('menu-motion-paused', document.hidden);
    for (const animation of animations) {
      if (document.hidden && animation.playState === 'running') animation.pause();
      else if (!document.hidden && animation.playState === 'paused') animation.play();
    }
  };
  document.addEventListener('visibilitychange', visibility, { signal: listeners.signal });
  const letters = [...title.querySelectorAll('.title-char')];
  if (entering) {
    letters.forEach((letter, index) => animate(letter, [
      { opacity: 0, transform: 'translateY(60px) scale(.5) rotate(-14deg)', offset: 0 },
      { opacity: 1, transform: 'translateY(-15px) scale(1.15) rotate(3deg)', offset: .56 },
      { opacity: 1, transform: 'translateY(5px) scale(.97) rotate(-1deg)', offset: .78 },
      { opacity: 1, transform: 'translateY(0) scale(1) rotate(0)', offset: 1 },
    ], { duration: 850, delay: index * 38 + 80, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' }));
    document.querySelectorAll('.menu-tagline,.menu-actions,.menu-rank,.menu-objective').forEach((node, index) => animate(node,
      [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 650, delay: 400 + index * 100, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }
  const settle = () => {
    cancelAnimationFrame(frame);
    const from = getComputedStyle(title).transform;
    if (tilt) { tilt.cancel(); animations.delete(tilt); }
    tilt = animate(title, [{ transform: from }, { transform: 'perspective(900px) rotateX(0) rotateY(0) scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  };
  title.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch') return;
    cancelAnimationFrame(frame);
    const bounds = title.getBoundingClientRect();
    const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
    const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
    frame = requestAnimationFrame(() => {
      const from = getComputedStyle(title).transform;
      if (tilt) { tilt.cancel(); animations.delete(tilt); }
      tilt = animate(title, [{ transform: from }, { transform: `perspective(900px) rotateX(${-y * 12}deg) rotateY(${x * 14}deg) scale(1.035)` }],
        { duration: 180, easing: 'ease-out', fill: 'forwards' });
    });
  }, { signal: listeners.signal });
  title.addEventListener('pointerleave', settle, { signal: listeners.signal });
  for (const line of title.querySelectorAll('.title-line')) line.addEventListener('pointerenter', () => {
    for (const letter of line.querySelectorAll('.title-char')) for (const animation of letter.getAnimations()) animation.cancel();
    [...line.querySelectorAll('.title-char')].forEach((letter, index) => animate(letter,
      [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-18px) scale(1.12)', offset: .4 }, { transform: 'translateY(0) scale(1)' }],
      { duration: 540, delay: index * 32, easing: 'cubic-bezier(.2,.7,.3,1)' }));
  }, { signal: listeners.signal });
  visibility();
}

function mainMenu() {
  const game = state.game, mission = game?.challenges?.daily?.missions.find(item => !item.unlocked) || game?.missions.find(item => !item.unlocked), session = state.session;
  return `<div class="start-screen"><header class="menu-header"><a class="menu-brand" href="#menu" aria-label="Hauptmenü">TS<span>TICKET SIMULATOR<small>SYSTEMADMINISTRATOR CAREER MODE</small></span></a><div class="menu-header-right">${profileQuickButton()}<span class="menu-local">${icon('shield')} LOKAL GESPEICHERT</span><div data-sound-control>${soundButton()}</div></div></header><div class="menu-stage"><section class="menu-copy"><div class="menu-edition"><span></span> OPERATIONS / CAREER MODE</div>${menuTitle()}<p class="menu-tagline">Wenn alles ausfällt,<br>kommst du ins Spiel.</p><nav class="menu-actions" aria-label="Spiel starten"><button class="menu-play" data-action="${active() ? 'resume' : 'start'}" ${isBusy() ? 'disabled' : ''}><span class="menu-key">01</span><span>${active() ? 'Einsatz fortsetzen' : 'Karriere spielen'}<small>${active() ? esc(session.ticket.number + ' · ' + session.ticket.title) : `Level ${state.level} · ${esc(levels[state.level - 1])}`}</small></span>${icon('arrow')}</button><button class="menu-choice" data-view="speedrun"><span class="menu-key">02</span><span>Speedrun<small>Eine Schicht. Deine Prioritäten.</small></span>${icon('bolt')}</button><div class="menu-secondary"><button data-view="missions">${icon('target')} Missionen</button><button data-view="battlepass">Battlepass</button><button data-view="mastery">Meisterung</button><button data-view="settings">${icon('settings')} Optionen</button></div><button class="menu-workspace" data-view="overview">Leitstelle öffnen ${icon('arrow')}</button></nav>${isBusy() ? '<p class="menu-status">Die laufende Anfrage wird verarbeitet. Dein Einsatz bleibt gespeichert.</p>' : !state.auth?.available ? '<p class="menu-status">Verbinde dein ChatGPT-Konto in den Optionen, um zu spielen.</p>' : ''}</section><section class="menu-world" aria-label="Dein Karrierefortschritt"><div class="world-coordinate">SEKTOR 01 <span>VIRTUELLE INFRASTRUKTUR</span></div>${menuArtwork}<button class="menu-companion" data-view="profile">${equippedCharacter('large')}<span>${equippedTitleMarkup()}<small>CHARAKTER & TITEL</small></span></button><button class="menu-rank" data-view="ranks" aria-label="Rangübersicht öffnen">${grandRankBadge(game?.ranked)}<div><small>DEIN EINSATZRANG</small><strong>${esc(game?.ranked?.name || 'Neustart')}</strong><progress max="100" value="${game?.ranked?.progress || 0}" aria-label="Rangfortschritt"></progress></div><b>${game?.ranked?.rr || 0}<small>RR</small></b><span class="menu-rank-hint">Alle sechs Ränge ansehen ↗</span></button><div class="menu-objective"><span>${icon('target')} ${mission ? 'NÄCHSTE MISSION' : 'MISSIONEN ERFÜLLT'}</span><p>${esc(mission?.title || 'Alle Erfolge freigeschaltet')}<b>${mission ? '+' + mission.reward + (mission.id.startsWith('daily-') ? ' PASS-XP' : ' XP') : icon('check')}</b></p></div></section></div><footer class="menu-footer"><span>SIMULIERTE IT. ECHTE ENTSCHEIDUNGEN.</span><span>${state.auth?.available ? '● CHATGPT VERBUNDEN' : '○ VERBINDUNG OFFEN'}</span><small>Musik startet nach deiner ersten Bedienung.</small></footer></div>`;
}

document.addEventListener('pointerdown', event => {
  if (!state || event.button !== 0) return;
  window.GameAudio?.unlock().catch(() => {});
}, { capture: true });
document.addEventListener('keydown', event => {
  if (!state || event.repeat) return;
  window.GameAudio?.unlock().catch(() => {});
  if (event.key === 'Escape' && currentView !== 'menu' && !event.target.closest('input,textarea,select')) navigate('menu');
});
document.addEventListener('input', event => {
  const key = event.target.dataset.audioControl;
  if (key && event.target.type === 'range') previewAudio({ [key]: Number(event.target.value) / 100 });
});
document.addEventListener('change', event => {
  const key = event.target.dataset.audioControl;
  if (!key) return;
  previewAudio({ [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.tagName === 'SELECT' ? event.target.value : Number(event.target.value) / 100 });
  saveAudio();
});
window.addEventListener('pagehide', () => window.GameAudio?.dispose());
window.addEventListener('game-audio-error', () => toast('Pixel Rush konnte nicht abgespielt werden. Wähle den Track erneut oder wechsle zu Happy Funk.', true));
