'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GameAudio = require('../ui/audio.js');

function harness({ supported = true, hidden = false, media = false } = {}) {
  const timers = new Map(); let timerId = 0, created = 0;
  const document = { visibilityState: hidden ? 'hidden' : 'visible', listeners: new Map(), addEventListener(n, fn) { this.listeners.set(n, fn); }, removeEventListener(n) { this.listeners.delete(n); }, change(value) { this.visibilityState = value; this.listeners.get('visibilitychange')?.(); } };
  const context = {
    state: 'suspended', currentTime: 0, destination: {}, oscillators: [], gains: [],
    createGain() { const g = { gain: param(), connect() {}, disconnect() {} }; this.gains.push(g); return g; },
    createOscillator() { const o = { frequency: param(), detune: param(), connect() {}, disconnect() {}, start(when) { this.startWhen = when; }, stop(when) { this.stopWhen = when; if (when === undefined) { this.stopped = true; this.onended?.(); } } }; this.oscillators.push(o); return o; },
    resume() { this.state = 'running'; return Promise.resolve(); }, suspend() { this.state = 'suspended'; return Promise.resolve(); }, close() { this.state = 'closed'; return Promise.resolve(); }
  };
  const audios = [];
  const createAudio = typeof media === 'function' ? src => { const a = media(src); audios.push(a); return a; } : media ? src => { const a = { src, loop: false, preload: '', volume: 1, paused: true, playCalls: 0, pauseCalls: 0, play() { this.playCalls++; this.paused = false; return Promise.resolve(); }, pause() { this.pauseCalls++; this.paused = true; } }; audios.push(a); return a; } : undefined;
  const api = GameAudio.createForTest({ AudioContext: supported ? function FakeAudioContext() {} : undefined, createContext: supported ? () => { created++; return context; } : undefined, createAudio, document, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
  return { api, context, timers, document, audios, get created() { return created; }, tick() { const [id, fn] = timers.entries().next().value || []; if (id) { timers.delete(id); fn(); } } };
}
function param() { return { value: 0, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } }; }

test('configuration is safe before gesture; unlock builds one context and schedules one lookahead timer', async () => {
  const h = harness();
  assert.equal(h.api.configure({ musicVolume: 4 }).musicVolume, 1);
  assert.equal(h.created, 0);
  assert.equal(h.api.status().supported, true);
  await h.api.unlock();
  assert.equal(h.created, 1);
  assert.equal(h.api.status().unlocked, true);
  assert.equal(h.timers.size, 1);
  h.tick();
  assert.equal(h.timers.size, 1);
  assert.ok(h.context.oscillators.length >= 4);
  h.api.setScene('play');
  assert.equal(h.timers.size, 1);
  h.api.setScene('play');
  assert.equal(h.timers.size, 1);
  h.api.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.api.status().unlocked, false);
});

test('mute stops music and suspends; unmute resumes only after unlock', async () => {
  const h = harness();
  h.api.configure({ muted: true });
  assert.equal(h.created, 0);
  await h.api.unlock();
  assert.equal(h.api.status().muted, true);
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.state, 'suspended');
  h.api.configure({ muted: false });
  await Promise.resolve();
  assert.equal(h.context.state, 'running');
  assert.equal(h.timers.size, 1);
  h.api.configure({ musicEnabled: false });
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.oscillators.every(o => o.stopped), true);
});

test('hidden tab pauses and visibility resumes only an already unlocked context', async () => {
  const h = harness({ hidden: true });
  await h.api.unlock();
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.state, 'suspended');
  h.document.change('visible');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.context.state, 'running');
  assert.equal(h.timers.size, 1);
  h.document.change('hidden');
  assert.equal(h.timers.size, 0);
  assert.equal(h.context.state, 'suspended');
  h.api.dispose();
  assert.equal(h.document.listeners.size, 0);
});

test('unsupported audio stays a safe no-op and reports capability', async () => {
  const h = harness({ supported: false });
  assert.equal((await h.api.unlock()).supported, false);
  assert.equal(h.api.play('click'), false);
  assert.equal(h.api.status().scene, 'menu');
  assert.doesNotThrow(() => h.api.configure({ effectsVolume: -2 }));
  assert.equal(h.api.status().effectsVolume, 0);
});

test('effects require unlock and enabled state, and use their own gain bus', async () => {
  const h = harness();
  assert.equal(h.api.play('click'), false);
  await h.api.unlock();
  assert.equal(h.api.play('click'), true);
  const count = h.context.oscillators.length;
  h.api.configure({ effectsEnabled: false });
  assert.equal(h.api.play('arrival'), false);
  assert.equal(h.context.oscillators.length, count);
});

test('muting or disabling effects immediately stops active effect oscillators and zeros their bus', async () => {
  const h = harness();
  await h.api.unlock();
  assert.equal(h.api.play('arrival'), true);
  const effects = h.context.oscillators.slice(-2);
  assert.ok(effects.every(o => o.stopWhen !== undefined && !o.stopped));
  h.api.configure({ effectsEnabled: false });
  assert.equal(effects.every(o => o.stopped), true);
  assert.equal(h.context.gains[2].gain.value, 0);
  h.api.configure({ effectsEnabled: true });
  assert.equal(h.api.play('click'), true);
  const latest = h.context.oscillators.at(-1);
  assert.notEqual(latest.stopped, true);
  h.api.configure({ muted: true });
  assert.equal(latest.stopped, true);
  assert.equal(h.context.gains[2].gain.value, 0);
});

test('same effect type has a short spam cooldown', async () => {
  const h = harness();
  await h.api.unlock();
  assert.equal(h.api.play('click'), true);
  assert.equal(h.api.play('click'), false);
  h.context.currentTime = 0.05;
  assert.equal(h.api.play('click'), true);
});

test('funk track schedules a syncopated groove, bright lead, and an eight-bar loop at 114 BPM', async () => {
  const h = harness();
  await h.api.unlock();
  // Advance simulated audio time while driving the single lookahead timer.
  for (let i = 0; i < 370; i++) { h.context.currentTime += 0.05; h.tick(); }
  const notes = h.context.oscillators.map(o => ({ frequency: o.frequency.value, at: o.startWhen }));
  const leadStarts = notes.filter(n => Math.abs(n.frequency - 523.25) < 0.5).map(n => n.at).sort((a,b) => a-b);
  assert.ok(leadStarts.length >= 2, 'opening marimba note repeats after the loop');
  const loopSeconds = 8 * 4 * 60 / 114;
  assert.ok(Math.abs((leadStarts.at(-1) - leadStarts[0]) - loopSeconds) < 0.03, 'opening marimba phrase repeats after eight bars');
  assert.ok(notes.some(n => n.frequency > 6000), 'offbeat closed hats are scheduled');
  assert.ok(notes.some(n => n.frequency > 60 && n.frequency < 70), 'low syncopated bass notes are scheduled');
  assert.ok(notes.some(n => n.frequency > 500 && n.frequency < 1200), 'bright melodic notes are scheduled');
  h.api.dispose();
});

test('battle track switches away from funk and applies volume and scene level', async () => {
  const h = harness({ media: true });
  await h.api.unlock();
  const synthBefore = h.context.oscillators.length;
  h.api.configure({ musicTrack: 'battle', musicVolume: 0.8 });
  await Promise.resolve();
  assert.equal(h.audios.length, 1);
  const audio = h.audios[0];
  assert.equal(audio.src, '/music/pixel-rush.ogg');
  assert.equal(audio.loop, true);
  assert.equal(audio.volume, 0.8);
  assert.equal(audio.paused, false);
  assert.equal(h.context.oscillators.slice(0, synthBefore).every(o => o.stopped), true);
  h.api.setScene('play');
  assert.equal(audio.volume, 0.8 * 0.72);
  assert.equal(audio.playCalls, 1);
});

test('battle audio pauses when hidden or muted, resumes only after unlock, and stops on dispose', async () => {
  const h = harness({ media: true });
  h.api.configure({ musicTrack: 'battle' });
  assert.equal(h.audios.length, 0);
  await h.api.unlock();
  const audio = h.audios[0];
  assert.equal(audio.paused, false);
  h.document.change('hidden');
  assert.equal(audio.paused, true);
  h.document.change('visible');
  await Promise.resolve(); await Promise.resolve();
  assert.equal(audio.paused, false);
  h.api.configure({ muted: true });
  assert.equal(audio.paused, true);
  h.api.configure({ muted: false });
  await Promise.resolve();
  assert.equal(audio.paused, false);
  h.api.dispose();
  assert.equal(audio.paused, true);
});

test('battle playback rejection is surfaced without claiming music is running', async () => {
  const h = harness({ media: () => ({ src: '', loop: false, preload: '', volume: 1, paused: true, play() { this.paused = true; return Promise.reject(new Error('file unavailable')); }, pause() { this.paused = true; } }) });
  h.api.configure({ musicTrack: 'battle', effectsEnabled: false });
  await h.api.unlock();
  await Promise.resolve(); await Promise.resolve();
  assert.match(h.api.status().musicError, /file unavailable/);
  assert.equal(h.api.status().running, false);
});
