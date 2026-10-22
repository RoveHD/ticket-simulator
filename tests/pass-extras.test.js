'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { progression } = require('../server/progression');
const { BONUS_CATALOG, EXTRA_KINDS, bonusForTier, passDustAtLevel } = require('../server/pass-extras');
const { arcaneView, spin, validArcanePersistence } = require('../server/arcane');
const NOW = '2026-10-21T12:00:00.000Z';
const career = i => ({ id: `bonus-case-${i}`, mode: 'career', level: 5, elapsed: 10, reference: 15,
  completedAt: '2026-10-20T10:00:00.000Z', scenarioIds: ['site-vpn-dns'],
  summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } });

test('every old pass tier keeps its primary reward and gains exactly one unique extra', () => {
  const pass = progression([], NOW).battlepass;
  assert.equal(pass.rewardCount, 80);
  assert.equal(pass.tiers.length, 40);
  assert.equal(BONUS_CATALOG.length, 40);
  assert.equal(new Set(pass.tiers.flatMap(tier => tier.rewards.map(reward => reward.id))).size, 80);
  for (const tier of pass.tiers) {
    assert.equal(tier.requiredXp, tier.level * 500);
    assert.equal(tier.unlocked, false);
    assert.deepEqual(tier.rewards[0], tier.reward);
    assert.deepEqual(tier.rewards[1], bonusForTier(tier.level));
    assert.equal(tier.rewards.length, 2);
    assert.equal(tier.rewards[1].kind === 'currency', tier.level % 2 === 1);
  }
  for (const kind of EXTRA_KINDS) {
    const rewards = BONUS_CATALOG.filter(reward => reward.kind === kind);
    assert.equal(rewards.length, 4);
    assert.deepEqual(rewards.map(reward => reward.variant), [1, 2, 3, 4]);
    for (const reward of rewards) assert.equal(reward.id, `pass-${kind}-${reward.variant}`);
  }
  assert.equal(bonusForTier(0), null);
  const copy = bonusForTier(2); copy.name = 'tampered';
  assert.equal(bonusForTier(2).name, 'Neonhafen');
});

test('extra inventory follows the same real pass thresholds and old completions grant extras retroactively', () => {
  const archives = Array.from({ length: 250 }, (_, i) => career(i));
  const before = JSON.stringify(archives), game = progression(archives, NOW);
  assert.equal(game.battlepass.level, 40);
  for (const bonus of BONUS_CATALOG) assert.deepEqual(game.inventory.find(reward => reward.id === bonus.id), bonus);
  const small = progression([career(0)], NOW);
  for (const bonus of BONUS_CATALOG) assert.equal(small.inventory.some(reward => reward.id === bonus.id), small.battlepass.level >= bonus.level);
  assert.equal(JSON.stringify(archives), before);
  assert.deepEqual(progression(JSON.parse(before), NOW), game);
  assert.deepEqual(progression([...archives, archives[0]], NOW), game, 'duplicate archive IDs cannot grant pass rewards again');
});

test('pass packages total 1750 dust and are a derived entitlement rather than repeated credits', () => {
  assert.equal(passDustAtLevel(0), 0);
  assert.equal(passDustAtLevel(1), 50);
  assert.equal(passDustAtLevel(2), 50);
  assert.equal(passDustAtLevel(3), 100);
  assert.equal(passDustAtLevel(40), 1750);
  assert.equal(passDustAtLevel(999), 1750);
  assert.equal(passDustAtLevel(NaN), 0);
  const archives = Array.from({ length: 250 }, (_, i) => career(i)), source = { archives, companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' } };
  const view = arcaneView(source, { now: NOW });
  assert.equal(view.passEarned, 1750);
  assert.equal(view.earned, 12500);
  assert.equal(view.balance, 300 + 12500 + 1750);
  assert.deepEqual(arcaneView(JSON.parse(JSON.stringify(source)), { now: NOW }), view);
  assert.deepEqual(arcaneView({ ...source, archives: [...archives, archives[0]] }, { now: NOW }), view);
  const input = { requestId: 'pass-bonus-spin-1', expectedSpins: 0 };
  const played = spin(source, input, { now: () => NOW, randomInt: () => 0 });
  assert.equal(played.receipt.balance, view.balance - 100 + 25);
  assert.equal(arcaneView(played.nextState, { now: NOW }).passEarned, 1750);
  const retry = spin(JSON.parse(JSON.stringify(played.nextState)), input, { randomInt() { throw Error('retry cannot draw'); } });
  assert.equal(retry.replayed, true);
  assert.equal(retry.receipt.balance, played.receipt.balance);
  assert.equal(arcaneView(retry.nextState, { now: NOW }).balance, played.receipt.balance);
  assert.ok(validArcanePersistence(played.nextState));
});

test('legacy valid spin ledgers keep receipts intact when additional pass dust becomes available', () => {
  const old = { archives: [], companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, arcane: { version: 1, spins: 1, spent: 100, won: 25, owned: [], receipts: [
    { requestId: 'legacy-ledger-spin', spin: 1, segmentIndex: 0, dustAwarded: 25, cosmeticId: null, duplicate: false, balance: 225, createdAt: NOW },
  ] } };
  const originalLedger = JSON.stringify(old.arcane);
  const state = { ...old, archives: Array.from({ length: 250 }, (_, i) => career(i)) };
  assert.ok(validArcanePersistence(state));
  assert.equal(arcaneView(state, { now: NOW }).balance, 300 + 12500 + 1750 - 100 + 25);
  assert.equal(JSON.stringify(state.arcane), originalLedger);
  assert.equal(state.arcane.receipts[0].balance, 225, 'historical receipt is not retroactively rewritten');
});
