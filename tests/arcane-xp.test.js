'use strict';

const test = require('node:test'), assert = require('node:assert/strict');
const { SEGMENTS, spin, arcaneView, arcaneRewards, validArcanePersistence } = require('../server/arcane');
const { progression } = require('../server/progression');
const { companionState, rewardForArchive, SWITCH_XP } = require('../server/companions');
const NOW = '2026-10-21T12:00:00.000Z';
const selected = (extra = {}) => ({ archives: [], companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, ...extra });
const roll = (state, bucket, id = `xp-spin-${state.arcane?.spins || 0}`) => spin(state,
  { requestId: id, expectedSpins: state.arcane?.spins || 0 }, { randomInt: () => bucket, now: NOW });
const career = i => ({ id: `xp-fund-${i}`, mode: 'career', level: 5, elapsed: 10, reference: 15, scenarioIds: ['site-vpn-dns'],
  summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } });

test('the new wheel retains the first eight prizes and exposes five exclusive cosmetic types and two XP packets', () => {
  assert.equal(SEGMENTS.length, 15);
  assert.equal(SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0), 100);
  assert.deepEqual(SEGMENTS.slice(0, 5).map(segment => segment.dust), [25, 50, 100, 200, 400]);
  assert.deepEqual(SEGMENTS.slice(5, 8).map(segment => segment.cosmeticId), ['badge-arcane-oracle', 'badge-arcane-singularity', 'title-arcane-sovereign']);
  const variants = [];
  for (const bucket of [72, 75, 78, 81, 84]) {
    const result = roll(selected(), bucket);
    const reward = arcaneRewards(result.nextState)[0];
    assert.equal(reward.variant, 5);
    assert.equal(reward.rarity, 'mythic');
    variants.push(reward.kind);
    const duplicate = roll(result.nextState, bucket);
    assert.equal(duplicate.receipt.duplicate, true);
    assert.equal(duplicate.receipt.dustAwarded, 150);
    assert.equal(arcaneRewards(duplicate.nextState).length, 1);
  }
  assert.deepEqual(variants, ['scene', 'aura', 'trail', 'banner', 'finisher']);
  assert.deepEqual(SEGMENTS[13].grant, { kind: 'companionXp', amount: 150 });
  assert.deepEqual(SEGMENTS[14].grant, { kind: 'passXp', amount: 250 });
});

test('companion XP is bound to the selected animal at spin time and does not fabricate solved cases or ranks', () => {
  const state = selected(), before = JSON.stringify(state);
  const result = roll(state, 87), saved = JSON.parse(JSON.stringify(result.nextState));
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(result.receipt.grant, { kind: 'companionXp', amount: 150, characterId: 'snake' });
  assert.equal(result.receipt.createdAt, NOW);
  assert.equal(result.receipt.balance, 200);
  assert.deepEqual(saved.arcane.companionXp, { snake: 150 });
  assert.equal(saved.archives.length, 0);
  let game = progression(saved.archives, NOW, saved), companion = companionState(saved, game);
  assert.equal(companion.current.xp, 150);
  assert.equal(game.solved, 0);
  assert.equal(game.ranked.totalRr, 0);
  assert.equal(game.latest, null);
  assert.ok(game.masteries.every(mastery => mastery.solved === 0));
  saved.cosmetics.portrait = 'portrait-wolf-base';
  companion = companionState(saved, game);
  assert.equal(companion.current.xp, 0);
  assert.equal(companion.characters.find(character => character.id === 'snake').xp, 150);
  const retry = spin(saved, { requestId: 'xp-spin-0', expectedSpins: 0 });
  assert.equal(retry.replayed, true);
  assert.deepEqual(retry.receipt.grant, { kind: 'companionXp', amount: 150, characterId: 'snake' });
  assert.equal(retry.nextState.arcane.companionXp.snake, 150);
  const publicView = arcaneView(saved, { now: NOW });
  publicView.recent[0].grant.amount = 99999;
  retry.receipt.grant.characterId = 'wolf';
  assert.equal(saved.arcane.receipts[0].grant.amount, 150);
  assert.equal(saved.arcane.receipts[0].grant.characterId, 'snake');
});

test('pass packets persist once, unlock pass dust in the same transaction and convert usefully after the final pass tier', () => {
  const first = roll(selected(), 95);
  assert.deepEqual(first.receipt.grant, { kind: 'passXp', amount: 250 });
  const second = roll(first.nextState, 95);
  const game = progression(second.nextState.archives, NOW, second.nextState);
  assert.equal(game.battlepass.xp, 500);
  assert.equal(game.battlepass.bonusXp, 500);
  assert.equal(game.battlepass.level, 1);
  assert.ok(game.inventory.some(reward => reward.id === 'pass-dust-1'));
  assert.equal(second.receipt.balance, 150, '300 starter - 2*100 cost + 50 unlocked pass dust');
  assert.equal(arcaneView(second.nextState, { now: NOW }).balance, 150);
  assert.equal(arcaneView(second.nextState, { now: NOW }).passEarned, 50);
  const retry = spin(JSON.parse(JSON.stringify(second.nextState)), { requestId: 'xp-spin-1', expectedSpins: 1 });
  assert.equal(retry.nextState.arcane.passXp, 500);
  assert.equal(retry.receipt.balance, 150);
  const full = selected({ archives: Array.from({ length: 250 }, (_, i) => career(i)) });
  assert.equal(progression(full.archives, NOW, full).battlepass.level, 40);
  const fallback = roll(full, 95);
  assert.equal(fallback.receipt.segmentIndex, 14);
  assert.deepEqual(fallback.receipt.grant, { kind: 'companionXp', amount: 150, characterId: 'snake' });
  assert.equal(fallback.nextState.arcane.passXp, 0);
  assert.equal(fallback.nextState.arcane.companionXp.snake, 150);
  assert.ok(validArcanePersistence(fallback.nextState));
});

test('original version-one receipt history migrates without changing prizes, retry receipts or existing balances', () => {
  const receipts = [], owned = [];
  let won = 0;
  for (let index = 0; index < 8; index++) {
    const segment = SEGMENTS[index]; won += segment.dust || 0;
    if (segment.cosmeticId) owned.push(segment.cosmeticId);
    receipts.push({ requestId: `legacy-receipt-${index}`, spin: index + 1, segmentIndex: index,
      dustAwarded: segment.dust || 0, cosmeticId: segment.cosmeticId || null, duplicate: false,
      balance: 300 + won - (index + 1) * 100, createdAt: NOW });
  }
  const source = selected({ arcane: { version: 1, spins: 8, spent: 800, won, owned, receipts } });
  assert.ok(validArcanePersistence(source));
  const original = JSON.stringify(source), before = arcaneView(source, { now: NOW });
  assert.equal(before.balance, 275);
  const retry = spin(source, { requestId: receipts[5].requestId, expectedSpins: 5 });
  assert.equal(retry.nextState, source);
  assert.deepEqual(retry.receipt, receipts[5]);
  const migrated = roll(source, 95);
  assert.equal(JSON.stringify(source), original);
  assert.equal(migrated.nextState.arcane.version, 2);
  assert.deepEqual(migrated.nextState.arcane.receipts.slice(0, 8), receipts);
  assert.equal(migrated.nextState.arcane.passXp, 250);
  assert.equal(migrated.receipt.balance, before.balance - 100);
  assert.ok(validArcanePersistence(migrated.nextState));
  assert.equal(validArcanePersistence({ ...source, arcane: { ...source.arcane, passXp: 250 } }), false);
});

test('XP totals survive bounded receipt eviction and forged grant shapes/totals are rejected', () => {
  let state = selected({ archives: Array.from({ length: 250 }, (_, i) => career(i)) });
  for (let i = 0; i < 60; i++) state = roll(state, 87).nextState;
  assert.equal(state.arcane.receipts.length, 50);
  assert.equal(state.arcane.companionXp.snake, 9000);
  assert.equal(companionState(state, progression(state.archives, NOW, state)).current.xp, 9000);
  assert.ok(validArcanePersistence(state));
  const single = roll(selected(), 87).nextState;
  for (const patch of [
    { passXp: 250 }, { companionXp: { snake: 151 } }, { companionXp: { wolf: 150 } },
    { receipts: [{ ...single.arcane.receipts[0], grant: { kind: 'companionXp', amount: 150, characterId: 'unknown' } }] },
    { receipts: [{ ...single.arcane.receipts[0], grant: { kind: 'passXp', amount: 250 } }] },
    { receipts: [{ ...single.arcane.receipts[0], grant: { kind: 'companionXp', amount: 300, characterId: 'snake' } }] },
    { receipts: [{ ...single.arcane.receipts[0], grant: { kind: 'companionXp', amount: 150, characterId: 'snake', extra: true } }] },
  ]) assert.equal(validArcanePersistence({ ...single, arcane: { ...single.arcane, ...patch } }), false);
});

test('no-companion spins fail before random draw, and reaching switch level by XP preserves active-session locks and report accounting', () => {
  let draws = 0;
  const state = { archives: [], companionChosen: false };
  assert.equal(arcaneView(state).canSpin, false);
  assert.match(arcaneView(state).spinBlockedReason, /Begleiter/);
  assert.throws(() => spin(state, { requestId: 'unselected-spin', expectedSpins: 0 }, { randomInt() { draws++; return 87; } }), error => error.status === 409);
  assert.equal(draws, 0);
  const source = selected({ companionXpOffsets: { snake: SWITCH_XP - 150 }, session: { current: { status: 'active' } } });
  const won = roll(source, 87).nextState, game = progression(won.archives, NOW, won);
  const companion = companionState(won, game);
  assert.equal(companion.current.level, 20);
  assert.equal(companion.canSwitch, false);
  const archive = { id: 'next-ticket', mode: 'career', summary: { solved: true }, completedTickets: [{ number: '1001', level: 3, scenarioId: 'site-vpn-dns' }] };
  const reward = rewardForArchive(archive, 'snake', won.archives, won.companionXpOffsets, won.arcane);
  assert.equal(reward.levelBefore, 20);
  assert.equal(reward.appliedXp, reward.xp);
  assert.equal(reward.xp, 150);
});

test('legitimate wheel XP fills the secret companion level gate without creating mastery or case evidence', () => {
  const archives = require('./fixtures/secret-companion.cjs').secretArchives().map(archive => archive.id === 'xp-snake-3'
    ? { ...archive, companionReward: { ...archive.companionReward, xp: archive.companionReward.xp - 150 } } : archive);
  const source = selected({ archives });
  const before = progression(archives, NOW, source);
  assert.equal(before.characters.find(character => character.id === 'chimera').unlocked, false);
  assert.equal(companionState(source, before).current.xp, SWITCH_XP - 150);
  const won = roll(source, 87).nextState;
  const after = progression(won.archives, NOW, won);
  assert.equal(after.characters.find(character => character.id === 'chimera').unlocked, true);
  assert.equal(companionState(won, after).current.level, 20);
  assert.equal(after.solved, before.solved);
  assert.deepEqual(after.masteries, before.masteries);
  assert.equal(won.archives.length, archives.length);
});
