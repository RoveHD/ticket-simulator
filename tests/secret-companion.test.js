'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { chimeraUnlocked } = require('../server/secret-companion');
const { progression } = require('../server/progression');
const { companionState, SWITCH_XP, rewardForArchive } = require('../server/companions');
const { secretArchives } = require('./fixtures/secret-companion.cjs');

const domains = ['dns', 'dhcp', 'backup', 'identity', 'network', 'security', 'cloud', 'virtualization', 'storage', 'endpoint', 'monitoring'];
const masteries = domains.map(id => ({ id, lordUnlocked: true }));
function career(id, overrides = {}) {
  return { id, mode: 'career', level: 4, elapsed: 10, reference: 10, ticket: { number: id },
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0, strengths: '', gaps: '', arrived: 1, solvedCount: 1, slaViolations: 0 }, ...overrides };
}
function speedrun(overrides = {}) {
  return { id: 'shift', mode: 'speedrun', level: 6, duration: 60,
    summary: { arrived: 6, solvedCount: 6, score: 100, wrongChanges: 0, unnecessaryChecks: 0, solved: true, strengths: '', gaps: '', slaViolations: 0 },
    completedTickets: Array.from({ length: 6 }, (_, i) => ({ number: `S0${i + 1}`, scenarioId: 'dns-resolution' })), ...overrides };
}
test('secret character stays sanitized and earns no XP while locked', () => {
  const game = progression([]);
  const character = game.characters.find(item => item.id === 'chimera');
  assert.deepEqual(character, { id: 'chimera', secret: true, name: '???', unlocked: false, unlockLevel: null,
    baseImage: null, lordImage: null, rarity: 'mythic', affinityIds: [], affinities: [] });
  assert.ok(!game.inventory.some(item => item.character === 'chimera'));
  const companion = companionState({ archives: [{ id: 'bad', mode: 'career', companionReward: { version: 1, characterId: 'chimera', xp: 5700 } }] }, game);
  assert.equal(companion.characters.find(item => item.id === 'chimera').xp, 0);
  assert.equal(companion.latestReward, null);
  const fallback = companionState({ archives: [] }, { inventory: [] }).characters.find(item => item.id === 'chimera');
  assert.equal(fallback.name, '???');
  assert.equal(fallback.baseImage, null);
  assert.equal(fallback.lordImage, null);
});

test('all gates require valid deduplicated evidence and persist through later bad records', () => {
  const good = secretArchives();
  assert.equal(chimeraUnlocked(good, masteries), true);
  assert.equal(chimeraUnlocked(good, masteries.slice(1)), false);
  assert.equal(chimeraUnlocked(good.filter(item => item.id !== 'xp-wolf'), masteries), false);
  assert.equal(chimeraUnlocked(good.filter(item => item.id !== 'shift'), masteries), false);
  assert.equal(chimeraUnlocked(good.slice(0, 3).concat(good.slice(4, 12)), masteries), false);
  assert.equal(chimeraUnlocked(good.map(item => item.id === 'xp-dragon' ? { ...item, companionReward: { version: 1, characterId: 'dragon', xp: '5700' } } : item), masteries), false);
  assert.equal(chimeraUnlocked([...good, { ...good[3] }], masteries), true);
  assert.equal(chimeraUnlocked([...good, career('later-fail', { summary: { solved: false } })], masteries), true);
  assert.equal(chimeraUnlocked([...good, speedrun({ id: 'bad-shift', summary: { arrived: 6, solvedCount: 5, wrongChanges: 0, unnecessaryChecks: 0 } })], masteries), true);
  const brokenStreak = [...good, career('break', { summary: { solved: false } }), ...Array.from({ length: 8 }, (_, i) => career(`after-${i}`))];
  assert.equal(chimeraUnlocked(brokenStreak, masteries), true);
});

test('unqualified career archives interrupt the sequence; speedruns do not', () => {
  const nineWithBreak = [...secretArchives().filter(item => item.id.startsWith('xp-')), ...Array.from({ length: 5 }, (_, i) => career(`first-${i}`)),
    career('bad', { reference: 0 }), ...Array.from({ length: 4 }, (_, i) => career(`last-${i}`)), speedrun()];
  assert.equal(chimeraUnlocked(nineWithBreak, masteries), false);
  const between = [...secretArchives().filter(item => item.id.startsWith('xp-')), career('a'), career('b'), speedrun(), ...Array.from({ length: 7 }, (_, i) => career(`c-${i}`))];
  assert.equal(chimeraUnlocked(between, masteries), true);
});

test('each career threshold and career streak length is independently enforced', () => {
  const badCases = [
    { summary: { solved: true, score: 94, wrongChanges: 0, unnecessaryChecks: 0 } },
    { summary: { solved: true, score: 95, wrongChanges: 1, unnecessaryChecks: 0 } },
    { summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 1 } },
    { elapsed: 11 },
    { level: 3 },
  ];
  for (const failure of badCases) {
    const archives = secretArchives().filter(item => !item.id.startsWith('mastery-'));
    archives[3] = career('career-0', failure);
    assert.equal(chimeraUnlocked(archives, masteries), false, JSON.stringify(failure));
  }
  const eight = secretArchives().filter(item => !item.id.startsWith('mastery-') && item.id !== 'career-8');
  assert.equal(chimeraUnlocked(eight, masteries), false);
});

test('speedrun threshold and completed ticket evidence are independently enforced', () => {
  const failures = [
    { level: 5 }, { duration: 59 },
    { summary: { arrived: 5, solvedCount: 5, wrongChanges: 0, unnecessaryChecks: 0 } },
    { summary: { arrived: 6, solvedCount: 6 } },
    { completedTickets: undefined },
    { completedTickets: Array.from({ length: 6 }, (_, i) => ({ number: `S0${i + 1}`, scenarioId: 'unknown-scenario' })) },
    { completedTickets: Array.from({ length: 6 }, (_, i) => ({ number: i < 2 ? 'S01' : `S0${i + 1}`, scenarioId: 'dns-resolution' })) },
    { completedTickets: Array.from({ length: 5 }, (_, i) => ({ number: `S0${i + 1}`, scenarioId: 'dns-resolution' })).concat({ number: 'S06', scenarioId: 'unknown-scenario' }) },
  ];
  for (const failure of failures) {
    const archives = secretArchives();
    const index = archives.findIndex(item => item.id === 'shift');
    archives[index] = speedrun({ ...failure, id: 'shift' });
    assert.equal(chimeraUnlocked(archives, masteries), false, JSON.stringify(failure));
  }
});

test('duplicate archive IDs cannot pool saved companion XP', () => {
  const archives = secretArchives();
  archives[0] = { ...archives[0], companionReward: { version: 1, characterId: 'snake', xp: 9000 } };
  archives.splice(1, 0, { ...archives[0], companionReward: { version: 1, characterId: 'snake', xp: 9000 } });
  assert.equal(chimeraUnlocked(archives, masteries), false);
});

test('unlocked character receives base, Lord and every eligible individual frame; XP keeps growing', () => {
  const archives = secretArchives({ astral: true });
  const ordinary = progression([]);
  const expansion = progression(archives);
  const secret = expansion.characters.find(item => item.id === 'chimera');
  assert.equal(secret.name, 'Nyxar');
  assert.equal(secret.unlocked, true);
  assert.deepEqual(companionState({ archives }, expansion).characters.find(item => item.id === 'chimera').affinityIds, [...domains, 'linux', 'hardware', 'hardware-advice']);
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-base'));
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-lord'));
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-lord-silver'));
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-lord-gold'));
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-lord-eternal'));
  assert.ok(expansion.inventory.some(item => item.id === 'portrait-chimera-lord-astral'));
  const reward = rewardForArchive({ id: 'new', mode: 'career', summary: { solved: true, solvedCount: 1 }, completedTickets: [{ number: 'x', scenarioId: 'dns-resolution' }] }, 'chimera', archives);
  assert.ok(reward);
  const state = companionState({ archives: [...archives, { id: 'xp-chimera', mode: 'career', companionReward: { version: 1, characterId: 'chimera', xp: 1000 } }] }, expansion);
  assert.equal(state.characters.find(item => item.id === 'chimera').xp, 2500 * 150 + 1000);
  assert.equal(ordinary.characters.find(item => item.id === 'chimera').name, '???');
});
