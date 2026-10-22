'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createApp } = require('../server');
const { SWITCH_XP } = require('../server/companions');
const { SEGMENTS } = require('../server/arcane');
const NOW = '2026-10-21T12:00:00.000Z';
const career = i => ({ id: `arcane-api-fund-${i}`, mode: 'career', level: 5, elapsed: 10, reference: 15,
  ticket: { number: String(1001 + i) }, scenarioIds: ['site-vpn-dns'],
  summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } });

async function fixture(t, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-arcane-xp-api-'));
  fs.mkdirSync(path.join(root, '.sim'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Nur simulierte Aktionen.');
  const file = path.join(root, '.sim/ui-state.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, model: 'gpt-6-luna', rewardCatalogVersion: 2,
    masteryCatalogVersion: 2, companionLevelVersion: 2, archives: [], session: null,
    companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, ...extra }));
  let app, base, token, bucket = 87, draws = 0;
  async function boot() {
    app = createApp({ root, now: () => NOW, arcaneRandomInt() { draws++; return bucket; },
      authCheck: async () => ({ available: true }), ai: require('./desktop-scenarios.cjs').smokeAI });
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = 'http://127.0.0.1:' + app.server.address().port;
    token = (await (await fetch(base + '/api/bootstrap')).json()).token;
  }
  await boot();
  async function request(route, input, headers = {}) {
    const response = await fetch(base + route, { method: input === undefined ? 'GET' : 'POST',
      headers: { 'X-Sim-Token': token, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
    return { status: response.status, data: await response.json() };
  }
  t.after(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, file, request, setRoll(value) { bucket = value; }, get draws() { return draws; },
    async restart() { await app.close(); await boot(); } };
}

test('all five exclusive wheel looks enter real inventory, equip through ownership checks and persist', async t => {
  const f = await fixture(t, { archives: Array.from({ length: 50 }, (_, i) => career(i)) });
  let count = 0;
  for (const [bucket, kind] of [[72, 'scene'], [75, 'aura'], [78, 'trail'], [81, 'banner'], [84, 'finisher']]) {
    f.setRoll(bucket);
    const won = await f.request('/api/arcane/spin', { requestId: `exclusive-spin-${count}`, expectedSpins: count++ });
    assert.equal(won.status, 200);
    const reward = won.data.state.game.inventory.find(item => item.id === won.data.receipt.cosmeticId);
    assert.equal(reward.kind, kind);
    assert.equal(reward.variant, 5);
    const equipped = await f.request('/api/cosmetics', { kind, id: reward.id });
    assert.equal(equipped.status, 200);
    assert.equal(equipped.data.game.cosmetics[kind], reward.id);
  }
  const before = (await f.request('/api/state')).data.game.cosmetics;
  await f.restart();
  assert.deepEqual((await f.request('/api/state')).data.game.cosmetics, before);
});

test('pass and companion packets commit exactly once across retries, refresh and restart; reset clears them', async t => {
  const f = await fixture(t);
  f.setRoll(95);
  for (let i = 0; i < 2; i++) {
    const result = await f.request('/api/arcane/spin', { requestId: `pass-packet-${i}`, expectedSpins: i });
    assert.equal(result.status, 200);
    assert.equal(result.data.receipt.createdAt, NOW);
    assert.deepEqual(result.data.receipt.grant, { kind: 'passXp', amount: 250 });
  }
  let game = (await f.request('/api/state')).data.game;
  assert.equal(game.battlepass.xp, 500);
  assert.equal(game.arcane.balance, 150);
  assert.equal(game.arcane.passEarned, 50);
  f.setRoll(87);
  const input = { requestId: 'companion-packet-2', expectedSpins: 2 };
  const result = await f.request('/api/arcane/spin', input);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.receipt.grant, { kind: 'companionXp', amount: 150, characterId: 'snake' });
  assert.equal(result.data.state.game.companion.current.xp, 150);
  assert.equal(result.data.state.game.arcane.balance, 50);
  const draws = f.draws;
  const retry = await f.request('/api/arcane/spin', input);
  assert.equal(retry.data.replayed, true);
  assert.equal(f.draws, draws);
  await f.restart(); game = (await f.request('/api/state')).data.game;
  assert.equal(game.companion.current.xp, 150);
  assert.equal(game.battlepass.xp, 500);
  assert.equal(game.arcane.balance, 50);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).archives.length, 0);
  const reset = await f.request('/api/reset', { confirmation: 'RESET' });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.game.battlepass.xp, 0);
  assert.equal(reset.data.game.arcane.bonusPassXp, 0);
  assert.deepEqual(reset.data.game.arcane.bonusCompanionXp, {});
  assert.equal(reset.data.game.arcane.balance, 300);
});

test('a failed XP save rolls back wallet, packet totals and companion XP; forged/unauthorized requests draw nothing', async t => {
  const f = await fixture(t), initial = (await f.request('/api/state')).data.game;
  const input = { requestId: 'failed-companion-packet', expectedSpins: 0 };
  const old = fs.readFileSync(f.file, 'utf8');
  assert.equal((await f.request('/api/arcane/spin', { ...input, grant: { kind: 'passXp', amount: 999999 } })).status, 400);
  assert.equal((await f.request('/api/arcane/spin', input, { 'X-Sim-Token': 'wrong' })).status, 403);
  assert.equal(f.draws, 0);
  assert.equal(fs.readFileSync(f.file, 'utf8'), old);
  const backup = f.file + '.backup'; fs.renameSync(f.file, backup); fs.mkdirSync(f.file);
  try {
    assert.equal((await f.request('/api/arcane/spin', input)).status, 500);
    const after = (await f.request('/api/state')).data.game;
    assert.deepEqual(after.arcane, initial.arcane);
    assert.deepEqual(after.companion, initial.companion);
    assert.equal(after.battlepass.xp, 0);
  } finally { fs.rmdirSync(f.file); fs.renameSync(backup, f.file); }
});

test('XP earned during an active ticket preserves switching locks and is not granted again by the ticket report', async t => {
  const f = await fixture(t, { companionXpOffsets: { snake: SWITCH_XP - 150 } });
  assert.equal((await f.request('/api/start', { mode: 'career', level: 1 })).status, 200);
  const input = { requestId: 'active-ticket-xp-spin', expectedSpins: 0 };
  const spun = await f.request('/api/arcane/spin', input);
  assert.equal(spun.status, 200);
  assert.equal(spun.data.state.game.companion.current.level, 20);
  assert.equal(spun.data.state.game.companion.canSwitch, false);
  assert.equal((await f.request('/api/cosmetics', { kind: 'portrait', id: 'portrait-wolf-base' })).status, 409);
  const done = await f.request('/api/message', { message: 'Aufgeben' });
  assert.equal(done.status, 200);
  assert.equal(done.data.session.companionReward.xp, 0);
  assert.equal(done.data.session.companionReward.levelBefore, 20);
  assert.equal(done.data.game.companion.current.xp, SWITCH_XP);
  const switched = await f.request('/api/cosmetics', { kind: 'portrait', id: 'portrait-wolf-base' });
  assert.equal(switched.status, 200);
  assert.equal(switched.data.game.companion.current.xp, 0);
  const retried = await f.request('/api/arcane/spin', input);
  assert.equal(retried.data.replayed, true);
  assert.equal(retried.data.receipt.grant.characterId, 'snake');
  assert.equal(retried.data.state.game.companion.current.xp, 0);
  assert.equal(retried.data.state.game.companion.characters.find(character => character.id === 'snake').xp, SWITCH_XP);
});

test('no companion blocks spins before random selection; a complete pass changes only the packet grant, never the selected segment', async t => {
  const fresh = await fixture(t, { companionChosen: false, cosmetics: {} });
  const noChoice = await fresh.request('/api/arcane/spin', { requestId: 'no-companion-spin', expectedSpins: 0 });
  assert.equal(noChoice.status, 409);
  assert.equal(fresh.draws, 0);
  assert.equal((await fresh.request('/api/state')).data.game.arcane.canSpin, false);
  const full = await fixture(t, { archives: Array.from({ length: 50 }, (_, i) => career(i)) });
  full.setRoll(99);
  assert.equal((await full.request('/api/state')).data.game.battlepass.level, 40);
  const result = await full.request('/api/arcane/spin', { requestId: 'full-pass-fallback', expectedSpins: 0 });
  assert.equal(result.status, 200);
  assert.equal(result.data.receipt.segmentIndex, SEGMENTS.length - 1);
  assert.deepEqual(result.data.receipt.grant, { kind: 'companionXp', amount: 150, characterId: 'snake' });
  assert.equal(result.data.state.game.companion.current.xp, 150);
  assert.equal(result.data.state.game.arcane.bonusPassXp, 0);
});
