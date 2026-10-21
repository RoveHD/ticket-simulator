'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { companionState, rewardForArchive, SWITCH_XP } = require('../server/companions');
const { progression } = require('../server/progression');

function archive(id, scenarioId = 'dns-resolution', overrides = {}) {
  return { id, mode: 'career', level: 3, summary: { solved: true, solvedCount: 1 },
    completedTickets: [{ number: '1001', scenarioId }], ...overrides };
}
function stateFor(archives = [], selected = 'snake') {
  return { archives, companionChosen: true, cosmetics: { portrait: `portrait-${selected}-base` }, session: null };
}

test('new companions start at level one and only explicit choices select an active animal', () => {
  const state = { archives: [] }, game = progression([]);
  const result = companionState(state, game);
  assert.equal(result.activeId, null);
  assert.equal(result.current, null);
  assert.equal(result.canSwitch, true);
  assert.equal(result.maxLevel, null);
  assert.equal(result.switchLevel, 20);
  assert.equal(result.bonusPercent, 50);
  assert.ok(result.characters.every(character => character.xp === 0 && character.level === 1));
  assert.ok(result.characters.find(character => character.id === 'snake').affinities.includes('DNS'));
  assert.equal(result.characters.find(character => character.id === 'dragon-frost').unlocked, false);
  state.cosmetics = { portrait: 'portrait-wolf-base' };
  assert.equal(companionState(state, game).activeId, 'wolf');
  state.companionChosen = false;
  assert.equal(companionState(state, game).activeId, null);
});

test('each solved case gives base XP and a matching topic adds exactly one fifty-percent bonus', () => {
  const dns = archive('dns');
  assert.deepEqual([rewardForArchive(dns, 'snake').baseXp, rewardForArchive(dns, 'snake').bonusXp], [100, 50]);
  assert.equal(rewardForArchive(dns, 'wolf').xp, 100);
  assert.equal(rewardForArchive(dns, 'snake-coral').xp, 150);
  assert.equal(rewardForArchive(archive('multiple-topics', 'gpo-application'), 'snake').bonusXp, 50);
  assert.equal(rewardForArchive(archive('unknown-topic', 'made-up'), 'snake').xp, 100);
  assert.equal(rewardForArchive({ ...dns, summary: { solved: false, solvedCount: 0 } }, 'snake').xp, 0);
  assert.equal(rewardForArchive(dns, null), null);
});

test('all eight companions receive the same bonus for their own domains and expose stable domain IDs', () => {
  const cases = [
    ['snake', 'dns-resolution', 'backup-window', 'dns'],
    ['wolf', 'dhcp-scope', 'backup-window', 'dhcp'],
    ['dragon', 'backup-window', 'dns-resolution', 'backup'],
    ['snake-coral', 'dns-resolution', 'backup-window', 'dns'],
    ['fox', 'ad-lockout', 'dns-resolution', 'identity'],
    ['wolf-night', 'dhcp-scope', 'backup-window', 'dhcp'],
    ['raven', 'certificate-service', 'dns-resolution', 'security'],
    ['dragon-frost', 'backup-window', 'dns-resolution', 'backup'],
  ];
  const characters = companionState({ archives: [] }, progression([])).characters;
  for (const [id, matching, different, domain] of cases) {
    const matchingReward = rewardForArchive(archive('matching', matching), id);
    assert.deepEqual([matchingReward.baseXp, matchingReward.bonusXp, matchingReward.xp], [100, 50, 150], id);
    assert.equal(rewardForArchive(archive('different', different), id).xp, 100, id);
    assert.ok(characters.find(c => c.id === id).affinityIds.includes(domain), id);
  }
});

test('speedrun reward uses only actual unique solved ticket metadata, not the arrival plan', () => {
  const run = { id: 'run', mode: 'speedrun', summary: { solvedCount: 3 }, completedTickets: [
    { number: 'S01', scenarioId: 'dns-resolution' },
    { number: 'S02', scenarioId: 'gpo-application' },
    { number: 'S02', scenarioId: 'gpo-application' },
    { number: 'S03', scenarioId: 'backup-window' },
  ], scenarioIds: ['dns-resolution', 'gpo-application', 'backup-window', 'dhcp-scope'] };
  const reward = rewardForArchive(run, 'snake');
  assert.equal(reward.solvedCount, 3);
  assert.equal(reward.baseXp, 300);
  assert.equal(reward.bonusXp, 100);
  assert.equal(reward.xp, 400);
  assert.equal(rewardForArchive({ ...run, summary: { solvedCount: 1 } }, 'snake').xp, 150);
  assert.equal(rewardForArchive({ ...run, completedTickets: undefined }, 'snake').xp, 0);
});

test('XP comes only from saved awards, survives reload and never changes old archives retroactively', () => {
  const old = archive('old');
  const rewarded = archive('new');
  rewarded.companionReward = rewardForArchive(rewarded, 'snake', [old]);
  const state = stateFor([old, rewarded]);
  const original = JSON.stringify(state);
  const first = companionState(state, progression(state.archives));
  const reloaded = companionState(JSON.parse(original), progression(state.archives));
  assert.equal(first.current.xp, 150);
  assert.equal(first.current.progress, 25);
  assert.equal(first.current.remainingXp, 450);
  assert.equal(first.current.nextXp, 600);
  assert.equal(first.canSwitch, false);
  assert.deepEqual(first, reloaded);
  assert.equal(JSON.stringify(state), original);
  assert.equal(companionState({ ...state, archives: [old, rewarded, rewarded] }, progression(state.archives)).current.xp, 150);
});

test('level twenty unlocks switching outside active sessions while XP keeps growing', () => {
  const archives = [];
  for (let i = 0; i < SWITCH_XP / 150; i++) {
    const entry = archive(`case-${i}`);
    entry.companionReward = rewardForArchive(entry, 'snake', archives);
    archives.push(entry);
  }
  const state = stateFor(archives);
  const result = companionState(state, progression(archives));
  assert.equal(result.current.xp, SWITCH_XP);
  assert.equal(result.current.level, 20);
  assert.equal(result.current.maxed, false);
  assert.equal(result.current.switchUnlocked, true);
  assert.equal(result.current.progress, 0);
  assert.equal(result.current.remainingXp, 6300);
  assert.equal(result.canSwitch, true);
  assert.equal(rewardForArchive(archive('overflow'), 'snake', archives).appliedXp, 150);
  state.session = { current: { status: 'active' } };
  assert.equal(companionState(state, progression(archives)).canSwitch, false);
  assert.equal(companionState(state, progression(archives)).switchReason, 'Beende zuerst deinen laufenden Einsatz.');
  state.session = null;
  state.cosmetics.portrait = 'portrait-wolf-base';
  const switched = companionState(state, progression(archives));
  assert.equal(switched.current.level, 1);
  assert.equal(switched.current.xp, 0);
  assert.equal(switched.characters.find(character => character.id === 'snake').level, 20);
});
