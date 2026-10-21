(function (root, make) {
  const api = make({ AudioContext: root && (root.AudioContext || root.webkitAudioContext), Audio: root && root.Audio, document: root && root.document, setTimeout: root && root.setTimeout, clearTimeout: root && root.clearTimeout, onMusicError: () => { if(root?.dispatchEvent && root.CustomEvent) root.dispatchEvent(new root.CustomEvent('game-audio-error')); } });
  if (typeof module === 'object' && module.exports) { api.createForTest = options => make(options); module.exports = api; }
  if (root) root.GameAudio = api;
})(typeof window !== 'undefined' ? window : globalThis, function createGameAudio(deps = {}) {
  const defaults = { muted: false, musicEnabled: true, effectsEnabled: true, musicVolume: 0.22, effectsVolume: 0.45, musicTrack: 'funk' };
  const clamp = (v, fallback) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : fallback;
  const validScenes = new Set(['menu', 'play', 'debrief']);
  let settings = { ...defaults }, scene = 'menu', context = null, master = null, musicBus = null, effectsBus = null;
  let unlocked = false, timer = null, nextStep = 0, step = 0, visibilityBound = false, disposed = false;
  let battleAudio = null, battlePlayToken = 0, battlePlayRequest = null, musicError = null;
  const musicNodes = new Set(), effectNodes = new Set();
  const lastEffectAt = new Map();
  const midi = n => 440 * 2 ** ((n - 69) / 12);
  const harmony = [ // Bright C/F/G/Dm progression across eight bars.
    { root: 36, notes: [60,64,67] }, { root: 41, notes: [65,69,72] },
    { root: 43, notes: [67,71,74] }, { root: 38, notes: [62,65,69] },
    { root: 41, notes: [65,69,72] }, { root: 36, notes: [60,64,67] },
    { root: 38, notes: [62,65,69] }, { root: 43, notes: [67,71,74] }
  ];
  const lead = [
    [72,null,76,79,null,84,79,null], [81,null,79,76,null,74,76,null],
    [79,null,83,86,null,91,86,null], [89,null,86,81,null,79,81,null],
    [81,null,84,89,null,93,89,null], [84,null,79,76,null,72,76,null],
    [74,null,77,81,null,86,81,null], [79,null,83,86,84,null,79,null]
  ];
  function status() {
    const mediaRunning = settings.musicTrack === 'battle' && !!battleAudio && !battleAudio.paused && !settings.muted && settings.musicEnabled;
    const synthRunning = settings.musicTrack === 'funk' && !!context && context.state === 'running' && !settings.muted && settings.musicEnabled;
    const effectsRunning = !!context && context.state === 'running' && !settings.muted && settings.effectsEnabled;
    const musicRunning = settings.musicTrack === 'battle' ? mediaRunning : synthRunning;
    const running = !settings.muted && settings.musicEnabled ? musicRunning : effectsRunning;
    return { supported: !!(deps.AudioContext || typeof deps.createContext === 'function' || deps.Audio || typeof deps.createAudio === 'function'), unlocked, running, scene, ...settings, musicError };
  }
  function safeDisconnect(node) { try { node.disconnect(); } catch {} }
  function cleanupSet(nodes) { for (const n of nodes) { try { n.stop(); } catch {} safeDisconnect(n); } nodes.clear(); }
  function stopTimer() { if (timer !== null) { (deps.clearTimeout || clearTimeout)(timer); timer = null; } }
  function musicOn() { return settings.musicTrack === 'funk' && unlocked && context && context.state === 'running' && !settings.muted && settings.musicEnabled && (!deps.document || deps.document.visibilityState !== 'hidden'); }
  function battleOn() { return settings.musicTrack === 'battle' && unlocked && !settings.muted && settings.musicEnabled && (!deps.document || deps.document.visibilityState !== 'hidden') && !disposed; }
  function sceneVolume() { return scene === 'play' ? 0.72 : scene === 'debrief' ? 0.88 : 1; }
  function pauseBattle() {
    battlePlayToken++; battlePlayRequest = null;
    try { battleAudio?.pause(); } catch {}
  }
  function ensureBattleAudio() {
    if (battleAudio) return battleAudio;
    try {
      battleAudio = typeof deps.createAudio === 'function' ? deps.createAudio('/music/pixel-rush.ogg') : deps.Audio ? new deps.Audio('/music/pixel-rush.ogg') : null;
      if (!battleAudio) { musicError = 'Audio-Datei-Wiedergabe ist nicht verfügbar.'; return null; }
      battleAudio.src = '/music/pixel-rush.ogg'; battleAudio.loop = true; battleAudio.preload = 'auto';
      return battleAudio;
    } catch (error) { musicError = String(error?.message || error); return null; }
  }
  function startBattle() {
    if (!battleOn()) { pauseBattle(); return; }
    const audio = ensureBattleAudio();
    if (!audio) return;
    audio.volume = clamp(settings.musicVolume * sceneVolume(), 0);
    if (!audio.paused || battlePlayRequest) return;
    let request;
    try { request = audio.play(); }
    catch (error) { musicError = String(error?.message || error); return; }
    const token = ++battlePlayToken;
    if (!request || typeof request.then !== 'function') { musicError = null; return; }
    const pending = Promise.resolve(request).then(() => {
      if (token === battlePlayToken) { battlePlayRequest = null; musicError = null; }
      else if (!battleOn()) { try { audio.pause(); } catch {} }
    }).catch(error => {
      if (token === battlePlayToken) { battlePlayRequest = null; musicError = String(error?.message || error || 'Wiedergabe nicht möglich.'); deps.onMusicError?.(musicError); }
    });
    battlePlayRequest = pending;
  }
  function scheduleTone(freq, start, duration, gain, type = 'sine', bus = musicBus, detune = 0) {
    if (!context || !bus) return;
    const osc = context.createOscillator(), amp = context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, start); if (detune) osc.detune.setValueAtTime(detune, start);
    amp.gain.setValueAtTime(0.0001, start); amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.025, duration * 0.2));
    amp.gain.setTargetAtTime(0.0001, start + duration * 0.55, Math.max(0.025, duration * 0.16));
    const nodes = bus === musicBus ? musicNodes : effectNodes;
    osc.connect(amp); amp.connect(bus); nodes.add(osc); nodes.add(amp);
    const done = () => { safeDisconnect(osc); safeDisconnect(amp); nodes.delete(osc); nodes.delete(amp); };
    osc.onended = done; osc.start(start); osc.stop(start + duration + 0.12);
  }
  function scheduleStep() {
    const beat = 60 / 114, eighth = beat / 2, horizon = 0.14;
    while (nextStep < context.currentTime + horizon) {
      const index = step % 64, barIndex = Math.floor(index / 8), slot = index % 8;
      const chord = harmony[barIndex], at = nextStep, level = scene === 'play' ? 0.72 : scene === 'debrief' ? 0.88 : 1;
      // Syncopated bass and offbeat chord chops give the loop a buoyant platform-game groove.
      if ([0,3,4,7].includes(slot)) {
        const bass = chord.root + (slot === 3 ? 7 : slot === 7 ? 12 : 0);
        scheduleTone(midi(bass), at, slot === 0 ? beat * 0.72 : eighth * 0.78, 0.07 * level, 'sawtooth');
      }
      if (slot === 2 || slot === 6) chord.notes.forEach((note, voice) => scheduleTone(midi(note + (voice === 2 ? 12 : 0)), at, eighth * 0.82, 0.018 * level, 'triangle'));
      // Four-on-floor kick variation, a handclap-like backbeat and bright eighth-note hats.
      if (slot === 0 || slot === 4 || (barIndex % 2 === 1 && slot === 3)) scheduleTone(72, at, 0.12, 0.055 * level, 'sine');
      if (slot === 2 || slot === 6) {
        scheduleTone(185, at, 0.095, 0.018 * level, 'triangle');
        scheduleTone(740, at, 0.045, 0.004 * level, 'square');
      }
      if (slot % 2 === 1) scheduleTone(6200 + (barIndex % 3) * 370, at, 0.027, 0.0018 * level, 'square');
      const melodyNote = lead[barIndex][slot];
      if (melodyNote) {
        // Triangle fundamental plus a quiet octave partial suggests a woody marimba mallet.
        scheduleTone(midi(melodyNote), at, eighth * 0.76, 0.045 * level, 'triangle');
        scheduleTone(midi(melodyNote + 12), at, eighth * 0.48, 0.008 * level, 'sine');
      }
      nextStep += eighth; step++;
    }
    timer = (deps.setTimeout || setTimeout)(() => { timer = null; if (musicOn()) scheduleStep(); }, 45);
  }
  function stopMusic() { stopTimer(); cleanupSet(musicNodes); nextStep = context ? context.currentTime + 0.04 : 0; }
  function sync() {
    if (context) {
      const now = context.currentTime;
      master.gain.setTargetAtTime(settings.muted ? 0.0001 : 0.72, now, 0.025);
      // Keep the synthesized track lively; the scene factor and master retain headroom.
      musicBus.gain.setTargetAtTime(settings.musicTrack === 'funk' && !settings.muted && settings.musicEnabled ? settings.musicVolume * 3.4 : 0, now, 0.025);
      effectsBus.gain.setTargetAtTime(!settings.muted && settings.effectsEnabled ? settings.effectsVolume : 0, now, 0.025);
      if (settings.muted || !settings.effectsEnabled) cleanupSet(effectNodes);
      if (!musicOn()) stopMusic(); else if (timer === null) { nextStep = Math.max(nextStep, now + 0.04); scheduleStep(); }
      if (settings.muted || (!settings.musicEnabled && !settings.effectsEnabled) || deps.document?.visibilityState === 'hidden') { try { context.suspend().catch(() => {}); } catch {} }
      else if (unlocked && context.state !== 'running') { try { context.resume().then(sync).catch(() => {}); } catch {} }
    }
    if (battleOn()) startBattle(); else pauseBattle();
    if (battleAudio) battleAudio.volume = clamp(settings.musicVolume * sceneVolume(), 0);
  }
  function onVisibility() {
    if (!unlocked) return;
    if (deps.document.visibilityState === 'hidden') {
      stopMusic(); pauseBattle();
      try { context?.suspend().catch(() => {}); } catch {}
    } else {
      if (context && !settings.muted && (settings.musicEnabled || settings.effectsEnabled)) { try { context.resume().then(sync).catch(() => {}); } catch {} }
      else sync();
    }
  }
  async function unlock() {
    if (disposed) return status();
    if (!context && (deps.AudioContext || typeof deps.createContext === 'function')) {
      const Ctx = deps.AudioContext;
      try { context = typeof deps.createContext === 'function' ? deps.createContext() : new Ctx(); }
      catch { context = null; }
      if (context) {
        master = context.createGain(); musicBus = context.createGain(); effectsBus = context.createGain();
        musicBus.connect(master); effectsBus.connect(master); master.connect(context.destination);
      }
    }
    if (!context && !(deps.Audio || typeof deps.createAudio === 'function')) return status();
    if (!visibilityBound && deps.document) {
      if (deps.document && !visibilityBound) { deps.document.addEventListener('visibilitychange', onVisibility); visibilityBound = true; }
    }
    unlocked = true;
    if (context && (deps.document?.visibilityState === 'hidden' || settings.muted || (!settings.musicEnabled && !settings.effectsEnabled))) { try { await context.suspend(); } catch {} }
    else if (context) { try { await context.resume(); } catch {} }
    sync(); return status();
  }
  function configure(next = {}) {
    const previousTrack = settings.musicTrack;
    settings = { ...settings, ...Object.fromEntries(Object.keys(defaults).filter(k => Object.hasOwn(next, k) && k !== 'musicTrack').map(k => [k, ['musicVolume','effectsVolume'].includes(k) ? clamp(next[k], defaults[k]) : !!next[k]])) };
    if (next.musicTrack === 'funk' || next.musicTrack === 'battle') settings.musicTrack = next.musicTrack;
    if (previousTrack !== settings.musicTrack) { musicError = null; if (settings.musicTrack === 'battle') stopMusic(); else pauseBattle(); }
    sync(); return status();
  }
  function setScene(value) { if (!validScenes.has(value) || scene === value) return status(); scene = value; sync(); return status(); }
  function play(name) {
    if (!context || !unlocked || settings.muted || !settings.effectsEnabled || !['click','arrival','success','error','levelup'].includes(name) || context.state !== 'running') return false;
    const cooldowns = { click: 40, arrival: 250, success: 180, error: 180, levelup: 400 };
    const t = context.currentTime, previous = lastEffectAt.get(name);
    if (previous !== undefined && (t - previous) * 1000 < cooldowns[name]) return false;
    lastEffectAt.set(name, t);
    const specs = { click:[620,0.055,0.045], arrival:[440,0.18,0.095], success:[523.25,0.28,0.12], error:[196,0.22,0.1], levelup:[659.25,0.42,0.14] };
    const [f, d, g] = specs[name];
    scheduleTone(f, t, d, g, name === 'error' ? 'triangle' : 'sine', effectsBus);
    if (name === 'success') scheduleTone(f * 1.25, t + 0.09, d * 0.8, g * 0.55, 'sine', effectsBus);
    if (name === 'arrival' || name === 'levelup') scheduleTone(f * 1.5, t + 0.1, d * 0.8, g * 0.45, 'triangle', effectsBus);
    return true;
  }
  function dispose() { stopMusic(); pauseBattle(); cleanupSet(effectNodes); if (visibilityBound) deps.document.removeEventListener('visibilitychange', onVisibility); visibilityBound = false; if (context) { try { context.close().catch(() => {}); } catch {} } context = master = musicBus = effectsBus = null; battleAudio = null; unlocked = false; disposed = true; return status(); }
  return { configure, unlock, setScene, play, dispose, status };
});
