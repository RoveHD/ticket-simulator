'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ABILITIES, abilityView, activateAbility, consumeAbility, archiveAbilityReward, validAbilityPersistence } = require('../server/abilities');
const { companionState, rewardForArchive } = require('../server/companions');
const { progression } = require('../server/progression');
const { ranked } = require('../server/ranked');
const { CHARACTERS, validCompanionReward } = require('../server/characters');
const { SCENARIOS } = require('../server/difficulty');
const { createApp } = require('../server');
const { smokeAI } = require('./desktop-scenarios.cjs');

function example(characterId, { mode = 'career', scenarioId = 'dns-resolution', level = 6, summary = {} } = {}) {
  const ticket = { number: mode === 'career' ? '1001' : 'S01', minute: 0, scenarioId };
  const session = { id: 'example', mode, level, companionId: characterId, plan: [ticket], messages: [], current: { elapsed: 0,
    status: 'active', queue: [{ number: ticket.number, status: 'open' }], hidden: { tickets: [{ number: ticket.number, referenceMinutes: 15 }] } } };
  const state = { archives: [], session };
  const active = activateAbility(state, characterId);
  const current = { ...session.current, status: 'completed', elapsed: 10,
    summary: { solved: true, solvedCount: 1, score: 95, wrongChanges: 0, unnecessaryChecks: 0, ...summary },
    queue: [{ number: ticket.number, status: 'solved' }] };
  const consumed = consumeAbility(active.session, current);
  const archive = { id: 'example', mode, level, elapsed: 10, reference: 15, summary: current.summary,
    completedTickets: [ticket], abilityRewards: consumed.rewards };
  archive.companionReward = rewardForArchive(archive, characterId);
  return { state, active, current, consumed, archive };
}

async function fixture(t, { ai = smokeAI } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-abilities-'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keine echten Befehle. Ursachen bleiben unverändert.');
  let app, base, token;
  async function open() {
    app = createApp({ root, ai, random: () => .5, authCheck: async () => ({ available: true, reason: 'Test' }) });
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    ({ token } = await (await fetch(`${base}/api/bootstrap`)).json());
  }
  async function request(route, input) {
    const response = await fetch(`${base}/api/${route}`, { method: input === undefined ? 'GET' : 'POST',
      headers: { 'X-Sim-Token': token, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    return { status: response.status, data: await response.json() };
  }
  const file = path.join(root, '.sim', 'ui-state.json');
  await open();
  t.after(async () => {
    await app.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, file, request, saved: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    restart: async () => { await app.close(); await open(); },
    choose: async id => {
      assert.equal((await request('cosmetics', { kind: 'portrait', id: `portrait-${id}-base` })).status, 200);
      return request('start', { mode: 'career', level: 1 });
    } };
}

test('all nine characters have distinct abilities with deterministic earned rewards and unchanged RR', () => {
  assert.equal(Object.keys(ABILITIES).length, CHARACTERS.length);
  assert.equal(new Set(Object.values(ABILITIES).map(item => item.id)).size, CHARACTERS.length);
  const hard = SCENARIOS.find(item => item.level >= 4);
  for (const character of CHARACTERS) {
    const scenarioId = character.id === 'raven' ? 'certificate-service' : character.id === 'dragon-frost' ? hard.id : 'dns-resolution';
    const { archive, consumed } = example(character.id, { scenarioId });
    const ability = ABILITIES[character.id];
    assert.equal(consumed.pending, null);
    assert.equal(consumed.rewards.length, 1);
    assert.equal(archiveAbilityReward(archive).xp, ability.xp, character.id);
    assert.equal(archive.companionReward.abilityXp, ability.companionXp, character.id);
    assert.ok(validCompanionReward(archive.companionReward));
    const unbuffed = { ...archive, abilityRewards: [] };
    unbuffed.companionReward = rewardForArchive(unbuffed, character.id);
    assert.equal(progression([archive]).xp - progression([unbuffed]).xp, ability.xp);
    assert.deepEqual(ranked([archive]), ranked([unbuffed]));
    assert.deepEqual(progression([archive]), progression(JSON.parse(JSON.stringify([archive]))));
    assert.equal(progression([archive, archive]).xp, progression([archive]).xp);
  }
});

test('conditions require actual structured proof and a consumed failed condition grants no bonus', () => {
  for (const id of ['snake', 'wolf-night']) {
    const { archive, consumed } = example(id, { summary: { wrongChanges: 1 } });
    assert.equal(consumed.pending, null);
    assert.equal(consumed.rewards[0].conditionMet, false);
    assert.match(consumed.message, /Bedingung nicht erfüllt/);
    assert.equal(archiveAbilityReward(archive).xp + archive.companionReward.abilityXp, 0);
    const missing = example(id, { summary: { unnecessaryChecks: undefined } });
    assert.equal(missing.consumed.rewards[0].conditionMet, false);
  }
  const quick = example('fox');
  const slow = { ...quick.current, elapsed: 16 };
  assert.equal(consumeAbility(quick.active.session, slow).rewards[0].conditionMet, false);
  assert.equal(example('raven').consumed.rewards[0].conditionMet, false);
  assert.equal(example('dragon-frost', { scenarioId: 'dns-resolution', level: 6 }).consumed.rewards[0].conditionMet, false);
  const { archive } = example('dragon');
  archive.completedTickets = [];
  assert.equal(archiveAbilityReward(archive).xp, 0);
});

test('closed tickets cannot trigger a new bonus and each solved ticket can only earn once', () => {
  const { active, current, consumed } = example('wolf', { mode: 'speedrun' });
  const completed = { ...active, session: { ...active.session, current, abilityRewards: consumed.rewards, abilityPending: null } };
  const rearmed = activateAbility(completed, 'wolf');
  assert.equal(consumeAbility(rearmed.session, current).rewards.length, 1);
  const replay = { ...current, queue: [{ number: 'S01', status: 'open' }] };
  assert.equal(consumeAbility({ ...rearmed.session, current: replay }, current).rewards.length, 1);
  const failed = { ...current, queue: [{ number: 'S01', status: 'abandoned' }] };
  const abandoned = consumeAbility(active.session, failed);
  assert.equal(abandoned.pending, null);
  assert.equal(abandoned.rewards.length, 0);
});

test('companion archive cap includes ability bonuses and still validates at 120 solved tickets', () => {
  const tickets = Array.from({ length: 120 }, (_, index) => ({ number: `S${index}`, scenarioId: 'dhcp-scope' }));
  const archive = { id: 'cap', mode: 'speedrun', level: 4, summary: { solvedCount: 120 }, completedTickets: tickets,
    abilityRewards: [{ version: 1, characterId: 'wolf', abilityId: ABILITIES.wolf.id, ticketNumber: 'S0', conditionMet: true, xp: 0, companionXp: 100 }] };
  const reward = rewardForArchive(archive, 'wolf');
  assert.equal(reward.xp, 18000);
  assert.equal(reward.abilityXp, 0);
  assert.ok(validCompanionReward(reward));
});

test('ability API enforces active ownership, blocks stacking and persists cooldown across sessions and restart', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('ability', {})).status, 409);
  const start = await f.choose('wolf');
  assert.equal(start.status, 200);
  assert.equal(start.data.game.companion.ability.canActivate, true);
  assert.equal((await f.request('ability', { characterId: 'chimera', xp: 999999 })).status, 400);
  const initial = f.saved();
  const activated = await f.request('ability', {});
  assert.equal(activated.status, 200);
  assert.equal(activated.data.game.companion.ability.active, true);
  assert.equal(activated.data.game.companion.ability.remainingMinutes, 40);
  assert.equal(activated.data.session.elapsed, 0);
  assert.equal(activated.data.session.messages.length, start.data.session.messages.length + 1);
  assert.deepEqual(f.saved().session.current, initial.session.current);
  assert.equal((await f.request('ability', {})).status, 409);
  const solved = await f.request('message', { message: 'Abschluss prüfen' });
  assert.equal(solved.status, 200);
  assert.equal(solved.data.session.companionReward.abilityXp, 100);
  assert.equal(solved.data.session.abilityReward.companionXp, 100);
  assert.equal(solved.data.game.companion.ability.remainingMinutes, 30);
  assert.equal(solved.data.game.companion.ability.active, false);
  const snapshot = f.saved();
  await f.restart();
  const reloaded = await f.request('state');
  assert.equal(reloaded.data.game.companion.ability.remainingMinutes, 30);
  assert.equal(reloaded.data.game.companion.current.xp, solved.data.game.companion.current.xp);
  assert.deepEqual(f.saved(), snapshot);
  assert.equal((await f.request('start', { mode: 'career', level: 1 })).status, 200);
  assert.equal((await f.request('ability', {})).status, 409);
  for (let i = 0; i < 3; i++) assert.equal((await f.request('message', { message: 'Prüfen' })).status, 200);
  const ready = await f.request('state');
  assert.equal(ready.data.game.companion.ability.remainingMinutes, 0);
  assert.equal(ready.data.game.companion.ability.canActivate, true);
  const attempts = await Promise.all([f.request('ability', {}), f.request('ability', {})]);
  assert.deepEqual(attempts.map(item => item.status).sort(), [200, 409]);
  assert.equal((await f.request('reset', { confirmation: 'RESET' })).status, 200);
  assert.equal(f.saved().abilityState, undefined);
});

test('waiting and failed AI turns never reduce cooldown or spend an active buff', async t => {
  let failNext = false, failPrompt = '';
  const f = await fixture(t, { ai: input => {
    failPrompt = input.prompt;
    if (failNext) throw new Error('Intended test failure');
    return smokeAI(input);
  } });
  assert.equal((await f.request('cosmetics', { kind: 'portrait', id: 'portrait-wolf-base' })).status, 200);
  assert.equal((await f.request('start', { mode: 'speedrun', duration: 60, level: 1 })).status, 200);
  assert.equal((await f.request('ability', {})).status, 200);
  const pending = fs.readFileSync(f.file, 'utf8');
  failNext = true;
  assert.equal((await f.request('message', { message: 'Prüfen' })).status, 502);
  assert.equal(fs.readFileSync(f.file, 'utf8'), pending);
  assert.match(failPrompt, /keine Hilfe und keine Arbeits- oder Wartezeit/);
  failNext = false;
  const solved = await f.request('message', { message: 'Abschluss prüfen' });
  assert.equal(solved.status, 200);
  assert.equal(solved.data.session.canWaitForArrival, true);
  const beforeWait = f.saved();
  const waited = await f.request('message', { message: 'Warten' });
  assert.equal(waited.status, 200);
  assert.ok(waited.data.session.elapsed > solved.data.session.elapsed);
  assert.deepEqual(f.saved().abilityState, beforeWait.abilityState);
  assert.equal(waited.data.game.companion.ability.remainingMinutes, 30);
});

test('failed atomic saves leave activation and cooldown unspent; client requests cannot select a locked character', async t => {
  const f = await fixture(t);
  await f.choose('dragon');
  assert.equal((await f.request('cosmetics', { kind: 'portrait', id: 'portrait-chimera-base' })).status, 400);
  const before = fs.readFileSync(f.file, 'utf8');
  const original = fs.renameSync;
  try {
    fs.renameSync = (source, destination) => {
      if (destination === f.file) throw new Error('Intentional unavailable storage');
      return original(source, destination);
    };
    assert.equal((await f.request('ability', {})).status, 500);
  } finally { fs.renameSync = original; }
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  const state = (await f.request('state')).data;
  assert.equal(state.game.companion.ability.active, false);
  assert.equal(state.game.companion.ability.remainingMinutes, 0);
  assert.equal(state.game.companion.ability.canActivate, true);
  assert.equal((await f.request('ability', {})).status, 200);
});

test('legacy saves default ready, malformed persisted cooldowns fail validation and secret ability stays hidden', () => {
  assert.equal(validAbilityPersistence({ session: null }), true);
  assert.equal(validAbilityPersistence({ abilityState: { clock: -1, readyAt: {} } }), false);
  assert.equal(validAbilityPersistence({ abilityState: { clock: 0, readyAt: { dragon: Infinity } } }), false);
  const { state } = example('snake');
  assert.equal(abilityView(state, 'snake', { selected: true, unlocked: true }).remainingMinutes, 0);
  const oldSession = { ...state, session: { ...state.session, companionId: undefined } };
  assert.equal(abilityView(oldSession, 'snake', { selected: true, unlocked: true }).canActivate, true);
  const game = progression([]);
  const companion = companionState({ archives: [] }, game);
  assert.equal(companion.characters.find(item => item.id === 'chimera').ability, undefined);
  for (const id of ['snake', 'wolf-night', 'fox']) {
    const speedrun = example(id, { mode: 'speedrun' });
    const view = abilityView(speedrun.state, id, { selected: true, unlocked: true });
    assert.equal(view.canActivate, false);
    assert.match(view.blockedReason, /Karrierefalls/);
  }
});
