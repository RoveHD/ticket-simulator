'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { progression } = require('../server/progression');
const { companionState, rewardForArchive, earnedXp, legacyLevelOffsets, SWITCH_XP } = require('../server/companions');
const { xpAtLevel, levelAt, MAX_XP } = require('../server/companion-levels');
const { secretArchives } = require('./fixtures/secret-companion.cjs');
const NOW = new Date('2026-10-21T12:00:00Z');

function ticket(id, characterId = 'snake', hard = false) {
  const scenarioId = hard ? 'site-vpn-dns' : 'dns-resolution';
  return { id, mode: 'career', level: hard ? 5 : 3, scenarioIds: [scenarioId],
    completedTickets: [{ number: id, scenarioId }],
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 },
    companionReward: { version: 1, characterId, xp: 150 } };
}
const mastery = (game, id) => game.companionMasteries[id].find(item => item.id === 'dns');

test('only the attributed companion earns its Lord and Astral forms; account titles stay shared', () => {
  for (const [count, hard, frame] of [[50, 10, ''], [2500, 1000, '-astral']]) {
    const archives = Array.from({ length: count }, (_, i) => ticket(`snake-${i}`, 'snake', i < hard));
    const game = progression(archives, NOW);
    assert.equal(mastery(game, 'snake').solved, count);
    assert.equal(mastery(game, 'snake').hardSolved, hard);
    assert.equal(mastery(game, 'snake').character, 'snake');
    assert.equal(mastery(game, 'wolf').solved, 0);
    assert.ok(game.inventory.some(item => item.id === `portrait-snake-lord${frame}`));
    assert.ok(!game.inventory.some(item => item.id === `portrait-wolf-lord${frame}`));
    assert.ok(game.inventory.some(item => item.id === 'title-lord-dns'));
    assert.ok(game.inventory.some(item => item.id === 'badge-lord-dns'));
    assert.equal(game.companionMasteries.chimera, undefined);
    const other = progression(archives.map(item => ({ ...item, companionReward: { ...item.companionReward, characterId: 'wolf' } })), NOW);
    assert.deepEqual(game.masteries, other.masteries);
    assert.deepEqual(game.inventory.filter(item => item.kind !== 'portrait'), other.inventory.filter(item => item.kind !== 'portrait'));
  }
});

test('individual mastery excludes missing, unknown or invalid awards, duplicate archives and failed tickets', () => {
  const valid = ticket('valid');
  const entries = [valid, valid, { ...ticket('missing'), companionReward: undefined }, ticket('unknown', 'unlisted'),
    { ...ticket('bad-version'), companionReward: { version: 2, characterId: 'snake', xp: 150 } },
    { ...ticket('bad-xp'), companionReward: { version: 1, characterId: 'snake', xp: '150' } },
    { ...ticket('failed'), summary: { solved: false } },
    { ...ticket('fallback'), completedTickets: undefined },
    { ...ticket('empty-proof'), completedTickets: [] }];
  const game = progression(entries, NOW);
  assert.equal(mastery(game, 'snake').solved, 2);
  assert.equal(mastery(game, 'wolf').solved, 0);
  assert.ok(!Object.hasOwn(game.companionMasteries, 'unlisted'));
  assert.deepEqual(game, progression(JSON.parse(JSON.stringify(entries)), NOW));
});

test('speedrun individual mastery uses actual solved metadata and never credits arrival plans', () => {
  const run = { id: 'run', mode: 'speedrun', level: 5, summary: { solvedCount: 2 },
    scenarioIds: ['backup-window', 'site-vpn-dns'], companionReward: { version: 1, characterId: 'wolf', xp: 200 },
    completedTickets: [{ number: 'S01', scenarioId: 'site-vpn-dns' }, { number: 'S01', scenarioId: 'site-vpn-dns' },
      { number: 'S02', scenarioId: 'backup-window' }, { number: 'S03', scenarioId: 'site-vpn-dns' }] };
  const game = progression([run], NOW);
  assert.equal(mastery(game, 'wolf').solved, 1);
  assert.equal(mastery(game, 'wolf').hardSolved, 1);
  assert.equal(mastery(game, 'snake').solved, 0);
  assert.equal(mastery(progression([{ ...run, completedTickets: undefined }], NOW), 'wolf').solved, 0);
});

test('individual unlock notifications carry the actual character and occur once at the threshold', () => {
  const archives = Array.from({ length: 49 }, (_, i) => ticket(`snake-${i}`, 'snake', i < 9));
  const game = progression([...archives, ticket('threshold', 'snake', true)], NOW);
  const gain = game.latest.companionMasteryGains.find(item => item.id === 'dns');
  assert.equal(gain.characterId, 'snake');
  assert.equal(gain.characterName, 'Schlange');
  assert.equal(gain.lordUnlocked, true);
  assert.equal(gain.solved, 1);
  assert.equal(gain.hardSolved, 1);
  assert.ok(!game.latest.newRewards.some(item => item.kind === 'portrait' && item.character !== 'snake' && item.masteryId === 'dns'));
  assert.equal(progression([...archives, ticket('threshold', 'snake', true), ticket('following')], NOW)
    .latest.companionMasteryGains.find(item => item.id === 'dns').lordUnlocked, false);
});

test('individual forms still require base ownership, while locked secret progress stays private', () => {
  const archives = Array.from({ length: 50 }, (_, i) => ({ ...ticket(`frost-${i}`, 'dragon-frost', i < 10),
    completedAt: undefined, summary: { solved: true, score: 0, wrongChanges: 1, unnecessaryChecks: 1 } }));
  const locked = progression(archives, NOW);
  assert.equal(mastery(locked, 'dragon-frost').lordUnlocked, true);
  assert.equal(locked.characters.find(item => item.id === 'dragon-frost').unlocked, false);
  assert.ok(!locked.inventory.some(item => item.id === 'portrait-dragon-frost-lord'));
  const hidden = progression(archives.map(item => ({ ...item, companionReward: { ...item.companionReward, characterId: 'chimera' } })), NOW);
  assert.equal(hidden.companionMasteries.chimera, undefined);
  assert.ok(!hidden.latest.companionMasteryGains.some(item => item.characterId === 'chimera'));
  const secret = progression(secretArchives({ astral: true }), NOW);
  assert.equal(mastery(secret, 'chimera').astralUnlocked, true);
  assert.equal(mastery(secret, 'snake').solved, SWITCH_XP / 150);
  assert.equal(mastery(secret, 'snake').hardSolved, 0);
});

test('the growing XP curve has exact boundaries and keeps levels above twenty and one hundred', () => {
  assert.equal(xpAtLevel(2), 600);
  assert.equal(xpAtLevel(10), 16200);
  assert.equal(SWITCH_XP, 62700);
  for (const level of [2, 10, 20, 21, 100, 101, 1000]) {
    assert.equal(levelAt(xpAtLevel(level)), level);
    assert.equal(levelAt(xpAtLevel(level) - 1), level - 1);
  }
  const archives = [], targetXp = xpAtLevel(101) + 150;
  for (let xp = 0; xp < targetXp; xp += 18000) archives.push({ id: `xp-${xp}`, mode: 'speedrun',
    companionReward: { version: 1, characterId: 'snake', xp: Math.min(18000, targetXp - xp) } });
  const state = { archives, cosmetics: { portrait: 'portrait-snake-base' }, companionChosen: true };
  const game = progression(archives, NOW), result = companionState(state, game);
  assert.equal(result.current.level, 101);
  assert.equal(result.current.xp, targetXp);
  assert.equal(result.current.levelStartXp, xpAtLevel(101));
  assert.equal(result.current.nextXp, xpAtLevel(102));
  assert.equal(result.current.remainingXp, xpAtLevel(102) - targetXp);
  assert.equal(result.current.maxed, false);
  assert.equal(result.canSwitch, true);
  assert.deepEqual(companionState(JSON.parse(JSON.stringify(state)), game), result);
  assert.deepEqual(companionState({ ...state, archives: [...archives, ...archives] }, game), result);
  assert.equal(companionState({ ...state, session: { current: { status: 'active' } } }, game).canSwitch, false);
  const reward = rewardForArchive(ticket('next'), 'snake', archives);
  assert.equal(reward.appliedXp, 150);
  assert.equal(reward.levelAfter, 101);
  assert.equal(earnedXp([...archives, { ...ticket('bound'), companionReward: { version: 1, characterId: 'snake', xp: 18000 } }],
    { snake: MAX_XP - 100 }).snake, MAX_XP);
});

test('legacy level offsets preserve only evidenced characters and never invent individual mastery', () => {
  const archives = [{ id: 'old', mode: 'career', companionReward: { version: 1, characterId: 'snake', xp: 5700 } },
    { id: 'partial', mode: 'career', companionReward: { version: 1, characterId: 'wolf', xp: 150 } },
    { id: 'unknown', mode: 'career', companionReward: { version: 1, characterId: 'bad', xp: 5700 } }];
  const offsets = legacyLevelOffsets([...archives, ...archives]);
  assert.deepEqual(offsets, { snake: 57000, wolf: 150 });
  const game = progression(archives, NOW, { companionXpOffsets: offsets });
  const result = companionState({ archives, companionXpOffsets: offsets, cosmetics: { portrait: 'portrait-snake-base' } }, game);
  assert.equal(result.current.level, 20);
  assert.equal(result.current.xp, SWITCH_XP);
  assert.equal(result.characters.find(item => item.id === 'wolf').level, 1);
  assert.equal(result.characters.find(item => item.id === 'wolf').progress, 50);
  assert.equal(mastery(game, 'snake').solved, 0);
  assert.equal(rewardForArchive(ticket('new'), 'snake', archives, offsets).appliedXp, 150);
});
