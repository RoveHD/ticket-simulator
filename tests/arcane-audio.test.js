'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const GameAudio = require('../ui/audio.js');

function harness(hidden = false) {
  const doc = { visibilityState: hidden ? 'hidden' : 'visible', handlers: {}, addEventListener(n, fn) { this.handlers[n] = fn; }, removeEventListener(n) { delete this.handlers[n]; } };
  const context = {
    state: 'suspended', currentTime: 0, destination: {}, oscillators: [],
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; },
    createOscillator() { const o = { frequency: param(), detune: param(), connect() {}, disconnect() {}, start(t) { this.at = t; }, stop(t) { this.stopAt = t; if (t === undefined) { this.stopped = true; this.onended?.(); } } }; this.oscillators.push(o); return o; },
    resume() { this.state = 'running'; return Promise.resolve(); }, suspend() { this.state = 'suspended'; return Promise.resolve(); }, close() { this.state = 'closed'; return Promise.resolve(); }
  };
  const api = GameAudio.createForTest({ createContext: () => context, AudioContext: function FakeAudioContext() {}, document: doc, setTimeout: () => 1, clearTimeout() {} });
  return { api, context, doc };
}
function param() { return { value: 0, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } }; }

test('all arcane event names synthesize through the existing effects bus; unknown names are ignored', async () => {
  const h = harness(); await h.api.unlock();
  const names = ['navigate','equip','spell','spin','tick','jackpot'];
  for (const name of names) {
    h.context.currentTime += 1;
    const before = h.context.oscillators.length;
    assert.equal(h.api.play(name), true, name);
    assert.ok(h.context.oscillators.length > before, name);
  }
  assert.equal(h.api.play('casino-win'), false);
  h.api.dispose();
});

test('spin effect can be stopped immediately and hidden tabs reject effect playback', async () => {
  const h = harness(); await h.api.unlock();
  assert.equal(h.api.play('spin'), true);
  const spin = h.context.oscillators.slice(-2);
  assert.equal(h.api.stopEffect('spin'), true);
  assert.ok(spin.every(o => o.stopped));
  assert.equal(h.api.stopEffect('spin'), false);
  h.doc.visibilityState = 'hidden';
  assert.equal(h.api.play('jackpot'), false);
  h.api.dispose();
});

test('overlapping spin plays share a stoppable group and stopping cancels every voice', async () => {
  const h = harness(); await h.api.unlock();
  const firstAt = h.context.currentTime;
  assert.equal(h.api.play('spin'), true);
  const first = h.context.oscillators.slice(-2);
  h.context.currentTime = firstAt + 0.6;
  assert.equal(h.api.play('spin'), true);
  const allVoices = h.context.oscillators.slice(-4);
  assert.equal(h.api.stopEffect('spin'), true);
  assert.ok(allVoices.every(o => o.stopped), 'both overlapping spin motifs should stop');
  h.api.dispose();
});

test('scheduled fundamental durations match the arcane event envelope timings', async () => {
  const h = harness(); await h.api.unlock();
  const durations = { navigate: 0.12, equip: 0.42, spell: 0.62, spin: 1.05, tick: 0.055, jackpot: 0.9 };
  for (const [name, expected] of Object.entries(durations)) {
    h.context.currentTime += 1;
    const start = h.context.currentTime;
    assert.equal(h.api.play(name), true);
    const fundamental = h.context.oscillators.at(-(['equip','spell','spin','jackpot'].includes(name) ? 2 : 1));
    assert.ok(Math.abs(fundamental.stopAt - start - expected - 0.12) < 1e-9, `${name} duration`);
  }
  h.api.dispose();
});

test('active effect nodes never exceed the 32-node safety budget', async () => {
  const h = harness(); await h.api.unlock();
  const start = h.context.oscillators.length;
  const names = ['click','arrival','success','error','levelup','navigate','equip','spell','spin','tick','jackpot'];
  for (let i = 0; i < 8; i++) {
    h.context.currentTime += 1;
    for (const name of names) {
      assert.equal(h.api.play(name), true);
      const activeOscillators = h.context.oscillators.slice(start).filter(o => !o.stopped);
      assert.ok(activeOscillators.length <= 16, `active oscillators: ${activeOscillators.length}`);
    }
  }
  h.api.dispose();
});

test('arcane effects obey mute, effects toggle, cooldown, and disposal', async () => {
  const h = harness(); await h.api.unlock();
  assert.equal(h.api.play('jackpot'), true);
  const played = h.context.oscillators.slice(-2);
  assert.equal(h.api.play('jackpot'), false);
  assert.ok(played.every(o => o.stopAt !== undefined));
  h.api.configure({ effectsEnabled: false });
  assert.ok(played.every(o => o.stopped));
  assert.equal(h.api.play('spell'), false);
  h.api.configure({ effectsEnabled: true }); h.context.currentTime += 1;
  assert.equal(h.api.play('spell'), true);
  const spell = h.context.oscillators.slice(-2);
  h.api.dispose();
  assert.ok(spell.every(o => o.stopped));
  assert.equal(h.api.play('click'), false);
});

test('spam cooldown keeps repeated wheel ticks from creating unbounded nodes', async () => {
  const h = harness(); await h.api.unlock();
  assert.equal(h.api.play('tick'), true);
  const count = h.context.oscillators.length;
  for (let i = 0; i < 100; i++) assert.equal(h.api.play('tick'), false);
  assert.equal(h.context.oscillators.length, count);
  h.api.dispose();
});
