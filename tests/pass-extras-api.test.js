'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createApp } = require('../server');
const { EXTRA_KINDS, BONUS_CATALOG } = require('../server/pass-extras');
const NOW = '2026-10-21T12:00:00.000Z';
const career = i => ({ id: `pass-api-${i}`, mode: 'career', level: 5, elapsed: 10, reference: 15,
  ticket: { number: String(1001 + i), title: 'Isolierter Pass-Test' },
  completedAt: '2026-10-20T10:00:00.000Z', scenarioIds: ['site-vpn-dns'],
  summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } });

async function fixture(t, archives = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-pass-extras-'));
  fs.mkdirSync(path.join(root, '.sim'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Nur Simulation.');
  fs.writeFileSync(path.join(root, '.sim/ui-state.json'), JSON.stringify({ version: 1, model: 'gpt-6-luna',
    rewardCatalogVersion: 2, masteryCatalogVersion: 2, companionLevelVersion: 2,
    session: null, archives, companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' } }));
  let app, base, token, clock = NOW;
  async function boot() {
    app = createApp({ root, now: () => clock, arcaneRandomInt: () => 0, authCheck: async () => ({ available: false }) });
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
  return { root, request, setClock(value) { clock = value; }, async restart() { await app.close(); await boot(); } };
}

test('all extra slots are host-owned, reject locked/forged items and safely allow neutral defaults', async t => {
  const f = await fixture(t), initial = (await f.request('/api/state')).data;
  for (const kind of EXTRA_KINDS) {
    assert.equal(initial.game.cosmetics[kind], null);
    assert.equal((await f.request('/api/cosmetics', { kind, id: `pass-${kind}-1` })).status, 400);
    assert.equal((await f.request('/api/cosmetics', { kind, id: null })).status, 200);
  }
  for (const input of [{ kind: 'currency', id: 'pass-dust-1' }, { kind: 'title', id: null },
    { kind: 'portrait', id: null }, { kind: 'scene', id: 1 }, { kind: '__proto__', id: 'pass-scene-1' }]) {
    assert.equal((await f.request('/api/cosmetics', input)).status, 400);
  }
  assert.equal((await f.request('/api/cosmetics', { kind: 'scene', id: null }, { 'X-Sim-Token': 'bad' })).status, 403);
  assert.equal((await f.request('/api/state')).data.game.arcane.balance, 300);
});

test('all twenty cosmetics equip, persist across restart, and unequip without losing ownership', async t => {
  const f = await fixture(t, Array.from({ length: 250 }, (_, i) => career(i)));
  const initial = await f.request('/api/state');
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  const before = initial.data;
  for (const bonus of BONUS_CATALOG.filter(reward => EXTRA_KINDS.includes(reward.kind))) {
    const result = await f.request('/api/cosmetics', { kind: bonus.kind, id: bonus.id });
    assert.equal(result.status, 200);
    assert.equal(result.data.game.cosmetics[bonus.kind], bonus.id);
  }
  await f.restart();
  let game = (await f.request('/api/state')).data.game;
  for (const kind of EXTRA_KINDS) assert.equal(game.cosmetics[kind], `pass-${kind}-4`);
  assert.equal(game.arcane.passEarned, 1750);
  assert.equal(game.arcane.balance, before.game.arcane.balance);
  const file = path.join(f.root, '.sim/ui-state.json'), saved = fs.readFileSync(file, 'utf8');
  assert.equal((await f.request('/api/cosmetics', { kind: 'aura', id: 'pass-scene-1' })).status, 400);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  for (const kind of EXTRA_KINDS) assert.equal((await f.request('/api/cosmetics', { kind, id: null })).status, 200);
  await f.restart(); game = (await f.request('/api/state')).data.game;
  for (const kind of EXTRA_KINDS) assert.equal(game.cosmetics[kind], null);
  assert.equal(game.inventory.filter(reward => EXTRA_KINDS.includes(reward.kind)).length, 20);
});

test('pass dust is spendable once, keeps spin retry receipts and reset clears all extra progress', async t => {
  const f = await fixture(t, Array.from({ length: 250 }, (_, i) => career(i)));
  const before = (await f.request('/api/state')).data.game.arcane;
  assert.equal(before.passEarned, 1750);
  const input = { requestId: 'pass-api-single-spin', expectedSpins: 0 };
  const once = await f.request('/api/arcane/spin', input);
  assert.equal(once.status, 200);
  assert.equal(once.data.receipt.balance, before.balance - 75);
  const twice = await f.request('/api/arcane/spin', input);
  assert.equal(twice.data.replayed, true);
  assert.equal(twice.data.state.game.arcane.balance, once.data.receipt.balance);
  await f.restart();
  assert.equal((await f.request('/api/state')).data.game.arcane.balance, once.data.receipt.balance);
  await f.request('/api/cosmetics', { kind: 'scene', id: 'pass-scene-4' });
  const reset = await f.request('/api/reset', { confirmation: 'RESET' });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.game.arcane.passEarned, 0);
  assert.equal(reset.data.game.arcane.balance, 300);
  assert.equal(reset.data.game.cosmetics.scene, null);
  assert.equal(reset.data.game.inventory.filter(reward => EXTRA_KINDS.includes(reward.kind)).length, 0);
  await f.restart();
  assert.equal((await f.request('/api/state')).data.game.arcane.passEarned, 0);
});

test('failed cosmetic persistence rolls back the slot without touching wallet or inventory', async t => {
  const f = await fixture(t, Array.from({ length: 250 }, (_, i) => career(i)));
  const before = (await f.request('/api/state')).data.game;
  const file = path.join(f.root, '.sim/ui-state.json'), backup = file + '.backup';
  fs.renameSync(file, backup); fs.mkdirSync(file);
  try {
    assert.equal((await f.request('/api/cosmetics', { kind: 'scene', id: 'pass-scene-1' })).status, 500);
    const after = (await f.request('/api/state')).data.game;
    assert.deepEqual(after.cosmetics, before.cosmetics);
    assert.deepEqual(after.arcane, before.arcane);
    assert.deepEqual(after.inventory, before.inventory);
  } finally { fs.rmdirSync(file); fs.renameSync(backup, file); }
});

test('pass wallet and inventory invalidate together when future completion periods become current', async t => {
  const archives = Array.from({ length: 3 }, (_, i) => ({ ...career(i), completedAt: '2026-10-21T13:00:00.000Z' }));
  const f = await fixture(t, archives);
  const before = (await f.request('/api/state')).data.game;
  assert.equal(before.battlepass.level, 8);
  assert.equal(before.arcane.passEarned, 200);
  assert.ok(!before.inventory.some(reward => reward.id === 'pass-dust-9'));
  f.setClock('2026-10-21T13:00:00.000Z');
  const after = (await f.request('/api/state')).data.game;
  assert.equal(after.battlepass.level, 9);
  assert.equal(after.arcane.passEarned, 250);
  assert.equal(after.arcane.balance, before.arcane.balance + 50);
  assert.ok(after.inventory.some(reward => reward.id === 'pass-dust-9'));
  assert.equal((await f.request('/api/state')).data.game.arcane.balance, after.arcane.balance);
  const played = await f.request('/api/arcane/spin', { requestId: 'future-pass-spin', expectedSpins: 0 });
  assert.equal(played.status, 200);
  assert.equal(played.data.receipt.balance, after.arcane.balance - 75, 'spin uses the same host clock and pass entitlement as the view');
});
