'use strict';

let audioDraft = null, pendingAudioSaves = 0, audioSaveChain = Promise.resolve();
const audioDefaults = { muted: false, musicEnabled: true, effectsEnabled: true, musicVolume: .22, effectsVolume: .45, musicTrack: 'funk' };
const speakerIcon = `<svg class="icon pixel-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6h3V4h2V2h2v12H6v-2H4v-2H1zM10 4h2v2h2v4h-2v2h-2v-2h2V6h-2z"/></svg>`;
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
  return `<section class="audio-panel" aria-label="Musik und Soundeffekte"><div class="audio-heading"><div><span class="eyebrow">AUDIO / MIXER</span><h3>Der Sound deiner Schicht.</h3></div><div data-sound-control>${soundButton()}</div></div><label class="form-field music-choice">Soundtrack<select data-audio-control="musicTrack"><option value="funk" ${audio.musicTrack !== 'battle' ? 'selected' : ''}>Happy Funk</option><option value="battle" ${audio.musicTrack === 'battle' ? 'selected' : ''}>Pixel Rush</option></select><small>Musik wechseln – deine Auswahl wird sofort gespeichert.</small></label><label class="audio-switch"><input type="checkbox" data-audio-control="musicEnabled" ${audio.musicEnabled ? 'checked' : ''}><span>Hintergrundmusik<small>Gewählter Soundtrack · im Einsatz ruhiger</small></span></label><label class="audio-slider">Musiklautstärke <output data-audio-value="musicVolume">${Math.round(audio.musicVolume * 100)} %</output><input type="range" min="0" max="100" step="1" value="${Math.round(audio.musicVolume * 100)}" data-audio-control="musicVolume"></label><label class="audio-switch"><input type="checkbox" data-audio-control="effectsEnabled" ${audio.effectsEnabled ? 'checked' : ''}><span>Soundeffekte<small>Arkane Runen, Kristallklänge, Zauber und Spinwheel</small></span></label><label class="audio-slider">Effektlautstärke <output data-audio-value="effectsVolume">${Math.round(audio.effectsVolume * 100)} %</output><input type="range" min="0" max="100" step="1" value="${Math.round(audio.effectsVolume * 100)}" data-audio-control="effectsVolume"></label><button class="button" data-action="sound-test">${speakerIcon} Effekt anhören</button><p class="fine-print">Audioänderungen werden sofort gespeichert. Musik startet nach deiner ersten Bedienung und pausiert, wenn die App ausgeblendet wird. Happy Funk wird lokal erzeugt. Pixel Rush wird als lokale Musikdatei abgespielt.</p></section>`;
}

// Integer-aligned arcade artwork shares the same palette as the game HUD.
const menuArtwork = '<svg class="menu-network pixel-cabinet" viewBox="0 0 240 228" fill="none" aria-hidden="true" shape-rendering="crispEdges">'+
  '<path d="M35 6h170v5h10v10h5v184h-5v12H25v-12h-5V21h5V11h10z" fill="#0d1023"/>'+
  '<path d="M37 8h166v5h10v10h5v177h-6V26h-7V17H35v9h-7v174h-6V23h5V13h10z" fill="#58b7a1"/>'+
  '<path d="M37 15h166v5h6v15h-6V23H37v12h-6V20h6z" fill="#e7bc5a"/>'+
  '<path d="M40 26h160v23H40z" fill="#512b43"/><path d="M45 29h150v3H45zM45 44h150v3H45z" fill="#e46b59"/>'+
  '<text x="120" y="41" text-anchor="middle" fill="#f4e5bf" font-size="13" font-family="Pixel Arcade,monospace">IT ARCADE</text>'+
  '<path d="M43 53h154v5h8v8h5v91h-5v8h-8v5H43v-5h-8v-8h-5V66h5v-8h8z" fill="#e46b59"/>'+
  '<path d="M47 59h146v5h8v8h4v79h-4v8h-8v5H47v-5h-8v-8h-4V72h4v-8h8z" fill="#27253f"/>'+
  '<path d="M54 67h132v5h8v8h4v63h-4v8h-8v5H54v-5h-8v-8h-4V80h4v-8h8z" fill="#12162c"/>'+
  '<path d="M59 75h122v4h7v9h4v47h-4v9h-7v4H59v-4h-7v-9h-4V88h4v-9h7z" fill="#315f62"/>'+
  '<path d="M63 80h114v4h7v53h-7v5H63v-5h-7V84h7z" fill="#48998d"/>'+
  '<path d="M114 110h12v5h-12zM116 94h8v36h-8z" fill="#b0dcad" opacity=".4"/>'+
  '<g fill="#202e43"><path d="M70 91h33v40H70zM137 91h33v40h-33z"/></g>'+
  '<g fill="#94d2ba"><path d="M74 96h25v7H74zM74 107h25v7H74zM74 118h25v7H74zM141 96h25v7h-25zM141 107h25v7h-25zM141 118h25v7h-25z"/></g>'+
  '<g class="server-lights" fill="#f4d778"><path d="M77 98h4v3h-4zM77 109h4v3h-4zM77 120h4v3h-4zM144 98h4v3h-4zM144 109h4v3h-4zM144 120h4v3h-4z"/></g>'+
  '<g fill="#f4e5bf"><path d="M85 98h10v3H85zM85 109h10v3H85zM85 120h10v3H85zM152 98h10v3h-10zM152 109h10v3h-10zM152 120h10v3h-10z"/></g>'+
  '<path d="M24 176h192v30H24z" fill="#325b60"/><path d="M29 178h182v5H29zM29 203h182v5H29z" fill="#e7bc5a"/><path d="M31 184h178v18H31z" fill="#28243f"/>'+
  '<path d="M52 184h8v5h6v8h-6v5h-8v-5h-6v-8h6z" fill="#0c1224"/><path d="M54 185h4v7h6v4h-6v5h-4v-5h-6v-4h6z" fill="#b4c5b3"/>'+
  '<path d="M154 185h10v3h3v10h-3v3h-10v-3h-3v-10h3z" fill="#e46b59"/><path d="M177 185h10v3h3v10h-3v3h-10v-3h-3v-10h3z" fill="#e7bc5a"/>'+
  '<path d="M93 189h18v8H93zM118 189h18v8h-18z" fill="#487e7a"/>'+
  '<g fill="#e7bc5a"><path d="M35 57h5v5h-5zM200 57h5v5h-5zM35 155h5v5h-5zM200 155h5v5h-5zM7 89h5v5H7zM225 90h5v5h-5zM10 143h5v5h-5zM226 147h5v5h-5z"/></g>'+
  '<path d="M42 211h156v5H42zM29 217h182v6H29z" fill="#e46b59"/>'+
  '<g fill="#f4e5bf"><path d="M86 213h12v2H86zM106 213h12v2h-12zM126 213h12v2h-12zM146 213h12v2h-12z"/></g></svg>';

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
    const animation = node.animate(frames, { ...options, easing: 'steps(8,end)' });
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
  return `<div class="start-screen"><header class="menu-header"><a class="menu-brand" href="#menu" aria-label="Hauptmenü">TS<span>TICKET SIMULATOR<small>SYSTEMADMINISTRATOR CAREER MODE</small></span></a><div class="menu-header-right">${profileQuickButton()}<span class="menu-local">${icon('shield')} LOKAL GESPEICHERT</span><div data-sound-control>${soundButton()}</div></div></header><div class="menu-stage"><section class="menu-copy"><div class="menu-edition"><span></span> OPERATIONS / CAREER MODE</div>${menuTitle()}<p class="menu-tagline">Wenn alles ausfällt,<br>kommst du ins Spiel.</p><nav class="menu-actions" aria-label="Spiel starten"><button class="menu-play" data-action="${active() ? 'resume' : 'start'}" ${isBusy() ? 'disabled' : ''}><span class="menu-key">01</span><span>${active() ? 'Einsatz fortsetzen' : 'Karriere spielen'}<small>${active() ? esc(session.ticket.number + ' · ' + session.ticket.title) : esc(game?.ranked?.name || 'IT-Support 1')}</small></span>${icon('arrow')}</button><button class="menu-choice" data-view="speedrun"><span class="menu-key">02</span><span>Speedrun<small>Eine Schicht. Deine Prioritäten.</small></span>${icon('bolt')}</button><div class="menu-secondary"><button data-view="missions">${icon('target')} Missionen</button><button data-view="battlepass">Battlepass</button><button data-view="mastery">Meisterung</button><button data-view="settings">${icon('settings')} Optionen</button></div><div class="arcane-menu-links"><button data-view="casino">✧ Arcane Casino</button><button data-view="leaderboard">♜ Leaderboard</button></div><button class="menu-workspace" data-view="overview">Leitstelle öffnen ${icon('arrow')}</button></nav>${isBusy() ? '<p class="menu-status">Die laufende Anfrage wird verarbeitet. Dein Einsatz bleibt gespeichert.</p>' : !state.auth?.available ? '<p class="menu-status">Verbinde dein ChatGPT-Konto in den Optionen, um zu spielen.</p>' : ''}</section><section class="menu-world" aria-label="Dein Karrierefortschritt"><div class="world-coordinate">SEKTOR 01 <span>VIRTUELLE INFRASTRUKTUR</span></div>${menuArtwork}<button class="menu-companion" data-view="profile">${equippedCharacter('large')}<span>${equippedTitleMarkup()}<small>CHARAKTER & TITEL</small></span></button><button class="menu-rank" data-view="ranks" aria-label="Rangübersicht öffnen">${grandRankBadge(game?.ranked)}<div><small>DEIN EINSATZRANG</small><strong>${esc(game?.ranked?.name || 'Neustart')}</strong><progress max="100" value="${game?.ranked?.progress || 0}" aria-label="Rangfortschritt"></progress></div><b>${game?.ranked?.rr || 0}<small>RR</small></b><span class="menu-rank-hint">Alle 18 Rangstufen ansehen ↗</span></button><div class="menu-objective"><span>${icon('target')} ${mission ? 'NÄCHSTE MISSION' : 'MISSIONEN ERFÜLLT'}</span><p>${esc(mission?.title || 'Alle Erfolge freigeschaltet')}<b>${mission ? '+' + mission.reward + (mission.id.startsWith('daily-') ? ' PASS-XP' : ' XP') : icon('check')}</b></p></div></section></div><footer class="menu-footer"><span>SIMULIERTE IT. ECHTE ENTSCHEIDUNGEN.</span><span>${state.auth?.available ? '● CHATGPT VERBUNDEN' : '○ VERBINDUNG OFFEN'}</span><small>Musik startet nach deiner ersten Bedienung.</small></footer></div>`;
}

document.addEventListener('pointerdown', event => {
  if (!state || event.button !== 0) return;
  window.GameAudio?.unlock().catch(() => {});
}, { capture: true });
document.addEventListener('keydown', event => {
  if (!state || event.repeat) return;
  window.GameAudio?.unlock().catch(() => {});
  if (event.key === 'Escape' && closePlayMenus(true)) { event.preventDefault(); return; }
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
