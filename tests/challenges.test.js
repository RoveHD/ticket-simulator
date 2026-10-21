'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { progression } = require('../server/progression');
const { SCENARIOS } = require('../server/difficulty');
const { CHARACTERS } = require('../server/characters');
const NOW = new Date('2026-10-21T12:00:00Z');

function career(id, options = {}) {
  return { id, mode: 'career', level: 3, companionReward: { version: 1, characterId: 'snake', xp: 150 }, scenarioIds: ['dns-resolution'], elapsed: 10, reference: 15,
    completedAt: '2026-10-21T09:00:00Z', summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 }, ...options };
}
function speedrun(id, options = {}) {
  return { id, mode: 'speedrun', level: 4, scenarioIds: ['dns-resolution', 'backup-window', 'dhcp-scope'],
    completedAt: '2026-10-21T09:00:00Z', summary: { solvedCount: 2, score: 10000, wrongChanges: 0, unnecessaryChecks: 0 }, ...options };
}
const permanent = (result, id) => result.challenges.permanent.find(m => m.id === `permanent-${id}`);
const mastery = (result, id) => result.masteries.find(m => m.id === id);
const permanentXp = result => result.challenges.permanent.filter(m => m.unlocked).reduce((sum, m) => sum + m.reward, 0);
const timedXp = result => ['daily', 'weekly'].reduce((sum, kind) => sum + result.challenges[kind].missions.filter(m => m.unlocked).reduce((total, m) => total + m.reward, 0), 0);

test('large independent challenge catalogue, complete reward schema and original 415 XP remain compatible', () => {
  const result = progression([career('first')], NOW);
  assert.equal(result.xp, 415);
  assert.equal(result.latest.xp, 415);
  assert.equal(result.missions.length, 4);
  assert.equal(result.challenges.daily.missions.length, 6);
  assert.equal(result.challenges.weekly.missions.length, 8);
  assert.ok(result.challenges.permanent.length >= 80);
  assert.equal(result.masteries.length, 14);
  assert.equal(result.battlepass.tiers.length, 40);
  assert.equal(new Set(result.battlepass.tiers.map(t => t.reward.id)).size, 40);
  for (const mission of [...result.challenges.permanent, ...result.challenges.daily.missions, ...result.challenges.weekly.missions]) {
    assert.ok(mission.id && mission.title && mission.description);
    assert.ok(mission.current <= mission.target && mission.target > 0 && mission.reward > 0);
    assert.equal(mission.unlocked, mission.current === mission.target);
  }
  for (const { level, requiredXp, reward } of result.battlepass.tiers) {
    assert.equal(requiredXp, level * 500);
    assert.ok(reward.id && reward.name);
    assert.ok(['title', 'badge', 'portrait'].includes(reward.kind));
    assert.ok(['common', 'rare', 'epic', 'legendary', 'mythic'].includes(reward.rarity));
    assert.notEqual(reward.variant, 'lord');
  }
  assert.ok(result.inventory.some(r => r.id === 'title-rookie'));
  for (const character of ['snake', 'wolf', 'dragon']) assert.ok(result.inventory.some(r => r.id === `portrait-${character}-base`));
});

test('UTC midnight and Monday reset correctly across week, year and DST boundaries', () => {
  const before = progression([], new Date('2027-01-03T23:59:59.999Z'));
  assert.equal(before.challenges.timezone, 'UTC');
  assert.equal(before.challenges.daily.key, '2027-01-03');
  assert.equal(before.challenges.weekly.key, '2026-12-28');
  assert.equal(before.challenges.weekly.endsAt, '2027-01-04T00:00:00.000Z');
  const after = progression([], new Date('2027-01-04T00:00:00Z'));
  assert.equal(after.challenges.daily.key, '2027-01-04');
  assert.equal(after.challenges.weekly.key, '2027-01-04');
  assert.equal(after.challenges.weekly.endsAt, '2027-01-11T00:00:00.000Z');
  assert.deepEqual(after, progression([], new Date('2027-01-04T00:00:00Z')));
  assert.notDeepEqual(before.challenges.daily.missions.map(m => m.title), after.challenges.daily.missions.map(m => m.title));
  const dst = progression([], new Date('2026-10-25T01:30:00Z'));
  assert.equal(dst.challenges.daily.endsAt, '2026-10-26T00:00:00.000Z');
});

test('historical timed rewards survive resets/reload while duplicate IDs cannot grant them twice', () => {
  const archives = Array.from({ length: 12 }, (_, i) => career(`day1-${i}`, { scenarioIds: [SCENARIOS[i].id], level: SCENARIOS[i].level }));
  archives.push(speedrun('shift1'));
  const initial = progression(archives, NOW);
  assert.equal(initial.battlepass.xp, permanentXp(initial) + timedXp(initial));
  assert.ok(timedXp(initial) > 0);
  const nextWeek = progression(archives, new Date('2026-11-02T12:00:00Z'));
  assert.ok([...nextWeek.challenges.daily.missions, ...nextWeek.challenges.weekly.missions].every(m => m.current === 0));
  assert.equal(nextWeek.battlepass.xp, initial.battlepass.xp);
  assert.deepEqual(nextWeek, progression(JSON.parse(JSON.stringify([...archives, ...archives])), new Date('2026-11-02T12:00:00Z')));
  const secondDay = archives.map(a => ({ ...a, id: `${a.id}-new`, completedAt: '2026-11-02T09:00:00Z' }));
  const later = progression([...archives, ...secondDay], new Date('2026-11-02T12:00:00Z'));
  assert.equal(later.battlepass.xp - permanentXp(later), timedXp(initial) + timedXp(later));
});

test('missing, invalid and future completion timestamps never earn timed credit or invented dates', () => {
  const archives = [career('missing', { completedAt: undefined }), career('invalid', { completedAt: 'not-a-date' }),
    career('future', { completedAt: '2026-10-21T12:00:01Z' }), career('null', { completedAt: null }),
    career('bare-year', { completedAt: '2026' }), career('local-time', { completedAt: '2026-10-21T09:00:00' }),
    career('impossible-day', { completedAt: '2026-02-30T09:00:00Z' }), career('hour24', { completedAt: '2026-10-20T24:00:00Z' })];
  const result = progression(archives, NOW);
  assert.equal(result.battlepass.xp, permanentXp(result));
  assert.ok([...result.challenges.daily.missions, ...result.challenges.weekly.missions].every(m => m.current === 0));
  assert.equal(mastery(result, 'dns').solved, 8);
  assert.throws(() => progression([], 'invalid'), /Ungültiger/);
});

test('validated completed tickets drive speedrun topics, never arrival plans or score multipliers', () => {
  const old = progression([speedrun('old')], NOW);
  assert.equal(old.solved, 2);
  assert.ok(old.masteries.every(m => m.solved === 0));
  assert.equal(permanent(old, 'score100-1').current, 0);
  assert.equal(permanent(old, 'clean-1').current, 0);
  assert.equal(permanent(old, 'speedrun-5').current, 2);
  const result = progression([speedrun('new', { completedTickets: [
    { number: 'S01', scenarioId: 'backup-window', category: 'DNS' },
    { number: 'S01', scenarioId: 'dns-resolution' },
    { number: 'S02', scenarioId: 'unknown', category: 'DHCP' },
    { number: 'S03', scenarioId: 'dns-resolution' },
  ] })], NOW);
  assert.equal(mastery(result, 'backup').solved, 1);
  assert.equal(mastery(result, 'dns').solved, 0);
  assert.equal(mastery(result, 'dhcp').solved, 0);
  assert.equal(result.latest.baseXp, 200);
  assert.equal(permanent(result, 'score100-1').current, 0);
});

test('legacy career topics count once, failed and unknown cases do not manufacture mastery', () => {
  const result = progression([career('known'), career('unknown', { scenarioIds: ['made-up'], report: 'DNS DHCP Backup' }),
    career('failed', { summary: { solved: false, score: 100 }, scenarioIds: ['backup-window'] }),
    career('multi', { scenarioIds: ['dns-resolution', 'backup-window'] })], NOW);
  assert.equal(mastery(result, 'dns').solved, 2);
  assert.equal(mastery(result, 'backup').solved, 0);
  assert.equal(permanent(result, 'streak-2').current, 2);
  assert.equal(result.streak, 1);
});

test('Lord requires both fifty domain solutions and ten level-four-plus cases', () => {
  const manyEasy = Array.from({ length: 70 }, (_, i) => career(`easy-${i}`));
  const easy = progression(manyEasy, NOW);
  assert.equal(mastery(easy, 'dns').lordUnlocked, false);
  assert.ok(easy.battlepass.level > 0);
  assert.ok(easy.inventory.every(r => r.variant !== 'lord'));
  const nineHard = Array.from({ length: 9 }, (_, i) => career(`hard-${i}`, { level: 5, scenarioIds: ['site-vpn-dns'] }));
  const almost = progression([...manyEasy, ...nineHard], NOW);
  assert.equal(mastery(almost, 'dns').hardSolved, 9);
  assert.equal(mastery(almost, 'dns').lordUnlocked, false);
  const all = [...manyEasy, ...nineHard, career('tenth', { level: 6, scenarioIds: ['critical-name-path'] })];
  const lord = progression(all, NOW);
  assert.equal(mastery(lord, 'dns').rank, 'Lord');
  assert.equal(mastery(lord, 'dns').level, 7);
  assert.equal(mastery(lord, 'dns').lordUnlocked, true);
  assert.equal(mastery(lord, 'backup').lordUnlocked, false);
  for (const animal of ['snake', 'wolf', 'dragon']) assert.equal(lord.inventory.some(r => r.id === `portrait-${animal}-lord` && r.rarity === 'mythic'), animal === 'snake');
  assert.ok(lord.latest.masteryGains.some(g => g.id === 'dns' && g.solved === 1 && g.xp === 150 && g.lordUnlocked));
  assert.equal(lord.latest.newRewards.filter(r => r.masteryId === 'dns').length, 2);
  assert.equal(lord.latest.passXp, lord.battlepass.xp - almost.battlepass.xp);
  assert.deepEqual(lord, progression(JSON.parse(JSON.stringify(all)), NOW));
});

test('mastery gate also rejects too few overall domain cases despite enough difficult solutions', () => {
  const result = progression(Array.from({ length: 10 }, (_, i) => career(`hard-${i}`, { level: 5, scenarioIds: ['site-vpn-dns'] })), NOW);
  assert.equal(mastery(result, 'dns').hardSolved, 10);
  assert.equal(mastery(result, 'dns').lordUnlocked, false);
});

test('permanent milestone awards are once-only and missing quality data cannot earn quality rewards', () => {
  const a = career('a', { summary: { solved: true, score: 0 }, elapsed: undefined, reference: undefined });
  const result = progression([a], NOW);
  assert.equal(permanent(result, 'clean-1').unlocked, false);
  assert.equal(permanent(result, 'quick-1').unlocked, false);
  assert.deepEqual(result, progression([a, a], NOW));
  const b = progression([a, career('b', { summary: { solved: false, score: 0 } })], NOW);
  assert.equal(b.latest.passXp, 0);
  assert.equal(b.battlepass.xp, result.battlepass.xp);
});

test('battlepass caps at forty tiers and unlocked rewards retain unique names and identities', () => {
  const archives = Array.from({ length: 550 }, (_, i) => {
    const scenario = SCENARIOS[i % SCENARIOS.length];
    return career(`all-${i}`, { level: scenario.level, scenarioIds: [scenario.id], summary: { solved: true, score: 100, wrongChanges: 0, unnecessaryChecks: 0 } });
  });
  const result = progression(archives, NOW);
  assert.ok(result.battlepass.xp >= 20000);
  assert.equal(result.battlepass.level, 40);
  assert.equal(result.battlepass.next, null);
  assert.equal(result.battlepass.progress, 100);
  assert.ok(result.battlepass.tiers.every(t => t.unlocked));
  assert.equal(new Set(result.inventory.map(r => r.id)).size, result.inventory.length);
  assert.equal(new Set(result.battlepass.tiers.map(t => t.reward.name)).size, 40);
  for (const mastery of result.masteries) assert.ok(['snake', 'wolf', 'dragon'].includes(mastery.character));
});

test('a streak milestone stays earned after a later failure and a timezone offset uses its UTC period', () => {
  const archives = [career('a', { completedAt: '2026-10-22T00:30:00+02:00' }), career('b'),
    career('failure', { summary: { solved: false, score: 0, wrongChanges: 0, unnecessaryChecks: 0 } })];
  const result = progression(archives, new Date('2026-10-21T23:00:00Z'));
  assert.equal(permanent(result, 'streak-2').unlocked, true);
  assert.equal(result.streak, 0);
  const nextDay = progression(archives, new Date('2026-10-22T01:00:00Z'));
  assert.equal(nextDay.battlepass.xp, result.battlepass.xp);
  assert.ok(nextDay.challenges.daily.missions.every(m => m.current === 0));
});

test('every mastery has an authored difficult scenario and an achievable Lord gate', () => {
  const domains = progression([], NOW).masteries;
  for (const domain of domains) {
    const difficult = SCENARIOS.filter(s => s.level >= 4).find(scenario => {
      const result = progression([career(`probe-${scenario.id}`, { level: scenario.level, scenarioIds: [scenario.id] })], NOW);
      return mastery(result, domain.id).hardSolved === 1;
    });
    assert.ok(difficult, `${domain.id} needs a known level-4+ family`);
    const archives = Array.from({ length: 50 }, (_, i) => career(`${domain.id}-${i}`, { level: difficult.level, scenarioIds: [difficult.id],
      completedTickets: [{ number: i + 1001, scenarioId: difficult.id, category: difficult.category }] }));
    const result = progression(archives, NOW);
    assert.equal(mastery(result, domain.id).solved, 50, domain.id);
    assert.equal(mastery(result, domain.id).hardSolved, 50, domain.id);
    assert.equal(mastery(result, domain.id).lordUnlocked, true, domain.id);
    assert.ok(result.inventory.some(r => r.id === `portrait-snake-lord`), domain.id);
  }
});

test('new DHCP and client families award their actual difficulty and only their authored topics', () => {
  for (const [scenarioId, domainId] of [['dhcp-failover', 'dhcp'], ['endpoint-management-chain', 'endpoint']]) {
    const scenario = SCENARIOS.find(s => s.id === scenarioId);
    assert.equal(scenario.level, 4);
    const result = progression([career(scenarioId, { level: scenario.level, scenarioIds: [scenario.id] })], NOW);
    assert.equal(mastery(result, domainId).solved, 1);
    assert.equal(mastery(result, domainId).hardSolved, 1);
    assert.equal(permanent(result, 'level4-1').unlocked, true);
    assert.equal(permanent(result, 'level5-1').unlocked, false);
    assert.equal(mastery(result, 'dns').solved, 0);
  }
  const inflated = progression([career('inflated', { level: 6 })], NOW);
  assert.equal(mastery(inflated, 'dns').solved, 1);
  assert.equal(mastery(inflated, 'dns').hardSolved, 0);
  const downgraded = progression([career('downgraded', { level: 2, scenarioIds: ['dhcp-failover'] })], NOW);
  assert.equal(mastery(downgraded, 'dhcp').hardSolved, 0);
});

test('host-clock corrections do not reorder earned streaks or retract pass rewards', () => {
  const archives = [career('a', { completedAt: '2026-10-21T09:00:00Z' }), career('b', { completedAt: '2026-10-21T10:00:00Z' })];
  const initial = progression(archives, NOW);
  archives.push(career('later-failure-with-clock-correction', { completedAt: '2026-10-21T09:30:00Z', summary: { solved: false, score: 0 } }));
  const after = progression(archives, NOW);
  assert.equal(permanent(after, 'streak-2').unlocked, true);
  assert.equal(after.battlepass.xp, initial.battlepass.xp);
  assert.equal(after.latest.passXp, 0);
  assert.deepEqual(after, progression(JSON.parse(JSON.stringify(archives)), NOW));
  const nextWeek = progression(archives, new Date('2026-11-02T12:00:00Z'));
  assert.equal(nextWeek.battlepass.xp, after.battlepass.xp);
});

test('character catalogue exposes the existing animal paths while keeping the secret entry masked', () => {
  const result = progression([], NOW);
  assert.equal(CHARACTERS.length, 9);
  assert.equal(new Set(CHARACTERS.map(character => character.id)).size, 9);
  assert.equal(result.characters.length, 9);
  for (const character of result.characters) {
    if (character.id === 'chimera') {
      assert.equal(character.name, '???');
      assert.equal(character.unlocked, false);
      assert.equal(character.baseImage, null);
      assert.ok(!result.inventory.some(reward => reward.character === 'chimera'));
      continue;
    }
    assert.equal(character.baseImage, `/characters/${character.id}.png`);
    assert.equal(character.lordImage, `/characters/${character.id}-lord.png`);
    assert.equal(character.unlocked, character.unlockLevel === 0);
    assert.equal(result.inventory.some(reward => reward.id === `portrait-${character.id}-base`), character.unlocked);
    assert.ok(!result.inventory.some(reward => reward.id.startsWith(`portrait-${character.id}-lord-`)));
  }
  for (const [id, rarity, level] of [['snake-coral', 'rare', 6], ['fox', 'rare', 10], ['wolf-night', 'epic', 18], ['raven', 'epic', 26], ['dragon-frost', 'legendary', 34]]) {
    const definition = CHARACTERS.find(character => character.id === id);
    assert.equal(definition.rarity, rarity);
    assert.equal(definition.unlockLevel, level);
    const tier = result.battlepass.tiers.find(item => item.level === level);
    assert.equal(tier.reward.id, `portrait-${id}-base`);
    assert.equal(tier.reward.kind, 'portrait');
    assert.equal(tier.reward.character, id);
    assert.equal(tier.reward.variant, 'base');
    assert.equal(tier.reward.rarity, rarity);
    assert.equal(tier.unlocked, false);
  }
  assert.equal(result.battlepass.tiers.filter(tier => tier.reward.frame || ['bronze', 'silver', 'gold', 'lord'].includes(tier.reward.variant)).length, 0);
  assert.equal(result.battlepass.tiers.length, 40);
  assert.equal(new Set(result.battlepass.tiers.map(t => t.reward.id)).size, 40);
  for (const level of [4, 8, 12, 16, 20, 24, 28, 32, 36]) {
    const replacement = result.battlepass.tiers[level - 1].reward;
    assert.ok(['title', 'badge'].includes(replacement.kind));
    assert.ok(replacement.name && !/rahmen/i.test(replacement.name));
  }
});

test('account Lord never grants forms to later animal unlocks', () => {
  const archives = Array.from({ length: 50 }, (_, i) => career(`lord-first-${i}`, { level: i < 10 ? 5 : 3,
    scenarioIds: [i < 10 ? 'site-vpn-dns' : 'dns-resolution'], completedAt: undefined, elapsed: 100,
    summary: { solved: true, score: 0, wrongChanges: 1, unnecessaryChecks: 1 } }));
  let previous = progression(archives, NOW);
  assert.equal(mastery(previous, 'dns').lordUnlocked, true);
  for (const id of ['raven', 'dragon-frost']) {
    assert.equal(previous.characters.find(character => character.id === id).unlocked, false);
    assert.ok(!previous.inventory.some(reward => reward.id === `portrait-${id}-lord`));
  }
  const lateUnlocks = new Set();
  for (let i = 0; i < 60 && !previous.characters.filter(character => character.id !== 'chimera').every(character => character.unlocked); i++) {
    archives.push(career(`quality-${i}`, { level: 1, scenarioIds: ['workstation-profile'], summary: { solved: true, score: 100, wrongChanges: 0, unnecessaryChecks: 0 } }));
    const current = progression(archives, NOW);
    for (const character of current.characters) {
      const wasUnlocked = previous.characters.find(item => item.id === character.id).unlocked;
      if (character.unlocked && !wasUnlocked) {
        lateUnlocks.add(character.id);
        assert.ok(current.latest.newRewards.some(reward => reward.id === `portrait-${character.id}-base`));
        assert.ok(!current.latest.newRewards.some(reward => reward.id === `portrait-${character.id}-lord`));
      }
      assert.equal(current.inventory.some(reward => reward.id === `portrait-${character.id}-lord`), character.id === 'snake');
    }
    assert.equal(mastery(current, 'dns').solved, 50);
    previous = current;
  }
  assert.ok(lateUnlocks.has('raven'));
  assert.ok(lateUnlocks.has('dragon-frost'));
  assert.ok(previous.characters.filter(character => character.id !== 'chimera').every(character => character.unlocked));
  assert.deepEqual(previous, progression(JSON.parse(JSON.stringify(archives)), NOW));
});

function dnsHistory(total, hard) {
  return Array.from({ length: total }, (_, i) => career(`prestige-${i}`, { level: i < hard ? 5 : 3,
    scenarioIds: [i < hard ? 'site-vpn-dns' : 'dns-resolution'], completedAt: undefined, elapsed: 100,
    summary: { solved: true, score: 0, wrongChanges: 1, unnecessaryChecks: 1 } }));
}
function hardDns(id) {
  return career(id, { level: 5, scenarioIds: ['site-vpn-dns'], completedAt: undefined, elapsed: 100,
    summary: { solved: true, score: 0, wrongChanges: 1, unnecessaryChecks: 1 } });
}

test('silver and ultimate gold prestige require both exact domain thresholds', () => {
  for (const [total, hard, prestige, level] of [[99, 25, 'lord', 7], [100, 24, 'lord', 7], [100, 25, 'silver', 8],
    [199, 60, 'silver', 8], [200, 59, 'silver', 8], [200, 60, 'gold', 9]]) {
    const result = progression(dnsHistory(total, hard), NOW);
    const domain = mastery(result, 'dns');
    assert.equal(domain.prestige, prestige, `${total}/${hard}`);
    assert.equal(domain.level, level);
    assert.equal(domain.rank, prestige === 'gold' ? 'Ultimativer Gold-Lord' : prestige === 'silver' ? 'Silber-Lord' : 'Lord');
    assert.equal(domain.lordUnlocked, true);
    assert.equal(domain.silverUnlocked, prestige === 'silver' || prestige === 'gold');
    assert.equal(domain.goldUnlocked, prestige === 'gold');
    assert.deepEqual(domain.prestigeRequirements, { silver: { solved: 100, hardSolved: 25 }, gold: { solved: 200, hardSolved: 60 }, eternal: { solved: 1000, hardSolved: 400 }, astral: { solved: 2500, hardSolved: 1000 } });
    const badges = result.inventory.filter(item => item.kind === 'badge' && item.masteryId === 'dns');
    assert.equal(badges.length, prestige === 'gold' ? 3 : prestige === 'silver' ? 2 : 1);
    for (const tier of ['lord', 'silver', 'gold']) {
      const badge = badges.find(item => item.masteryTier === tier);
      assert.equal(Boolean(badge), tier === 'lord' || domain[`${tier}Unlocked`]);
      if (badge) {
        assert.equal(badge.id, `badge-lord-dns${tier === 'lord' ? '' : `-${tier}`}`);
        assert.equal(badge.rarity, 'mythic');
        if (tier !== 'lord') assert.equal(badge.frame, tier);
      }
    }
    for (const character of result.characters) {
      for (const frame of ['silver', 'gold', 'eternal']) {
        const reward = result.inventory.find(item => item.id === `portrait-${character.id}-lord-${frame}`);
        assert.equal(Boolean(reward), character.id === 'snake' && domain[`${frame}Unlocked`]);
        if (reward) {
          assert.equal(reward.frame, frame);
          assert.equal(reward.variant, 'lord');
          assert.equal(reward.rarity, 'mythic');
        }
      }
    }
  }
});

test('prestige progress measures the interval toward the next pair of requirements', () => {
  for (const [total, hard, prestige, nextPrestige, expected] of [[25, 5, 'none', 'lord', 50],
    [50, 10, 'lord', 'silver', 0], [75, 18, 'lord', 'silver', 50], [100, 25, 'silver', 'gold', 0],
    [150, 43, 'silver', 'gold', 50], [200, 60, 'gold', 'eternal', 0], [600, 230, 'gold', 'eternal', 50],
    [1000, 400, 'eternal', 'astral', 0], [1750, 700, 'eternal', 'astral', 50], [2500, 1000, 'astral', null, 100]]) {
    const domain = mastery(progression(dnsHistory(total, hard), NOW), 'dns');
    assert.equal(domain.prestige, prestige);
    assert.equal(domain.nextPrestige, nextPrestige);
    assert.equal(domain.prestigeProgress, expected);
    if (prestige !== 'none') { assert.equal(domain.progress, expected); assert.equal(domain.next, null); }
  }
});

test('Ewiger Lord requires 1000 resolved domain cases and 400 on level 4+, then grants only a portrait frame', () => {
  for (const [total, hard, unlocked] of [[999, 400, false], [1000, 399, false], [1000, 400, true]]) {
    const result = progression(dnsHistory(total, hard), NOW);
    const domain = mastery(result, 'dns');
    assert.equal(domain.eternalUnlocked, unlocked, `${total}/${hard}`);
    assert.equal(domain.level, unlocked ? 10 : 9);
    assert.equal(domain.rank, unlocked ? 'Ewiger Lord' : 'Ultimativer Gold-Lord');
    assert.equal(result.inventory.filter(item => item.kind === 'badge' && item.masteryId === 'dns').length, 3);
    for (const character of result.characters) {
      assert.equal(result.inventory.some(item => item.id === `portrait-${character.id}-lord-eternal`), character.id === 'snake' && unlocked);
    }
  }

  const archives = dnsHistory(999, 399);
  const before = progression(archives, NOW);
  archives.push(hardDns('trigger-eternal'));
  const after = progression(archives, NOW);
  const gain = after.latest.masteryGains.find(item => item.id === 'dns');
  assert.equal(gain.eternalUnlocked, true);
  assert.equal(gain.prestige, 'eternal');
  assert.equal(after.xp - before.xp, 100);
  assert.equal(mastery(after, 'dns').xp - mastery(before, 'dns').xp, 150);
  assert.equal(after.latest.newRewards.filter(item => item.companionForm && item.frame === 'eternal').length,
    1);
  const following = progression([...archives, hardDns('following-eternal')], NOW);
  assert.equal(following.latest.masteryGains.find(item => item.id === 'dns')?.eternalUnlocked, false);
  assert.ok(!following.latest.newRewards.some(item => item.companionForm && item.frame === 'eternal'));
});

test('Astral-Lord requires 2500 resolved domain cases and 1000 on level 4+, then grants only a portrait frame', () => {
  for (const [total, hard, unlocked] of [[2499, 1000, false], [2500, 999, false], [2500, 1000, true]]) {
    const result = progression(dnsHistory(total, hard), NOW);
    const domain = mastery(result, 'dns');
    assert.equal(domain.astralUnlocked, unlocked, `${total}/${hard}`);
    assert.equal(domain.level, unlocked ? 11 : 10);
    assert.equal(domain.rank, unlocked ? 'Astral-Lord' : 'Ewiger Lord');
    assert.equal(result.inventory.filter(item => item.kind === 'badge' && item.masteryId === 'dns').length, 3);
    for (const character of result.characters) {
      assert.equal(result.inventory.some(item => item.id === `portrait-${character.id}-lord-astral`), character.id === 'snake' && unlocked);
    }
  }

  const archives = dnsHistory(2499, 999);
  const before = progression(archives, NOW);
  archives.push(hardDns('trigger-astral'));
  const after = progression(archives, NOW);
  const gain = after.latest.masteryGains.find(item => item.id === 'dns');
  assert.equal(gain.astralUnlocked, true);
  assert.equal(gain.prestige, 'astral');
  assert.equal(after.xp - before.xp, 100);
  assert.equal(mastery(after, 'dns').xp - mastery(before, 'dns').xp, 150);
  assert.equal(after.latest.newRewards.filter(item => item.companionForm && item.frame === 'astral').length,
    1);
  const following = progression([...archives, hardDns('following-astral')], NOW);
  assert.equal(following.latest.masteryGains.find(item => item.id === 'dns')?.astralUnlocked, false);
  assert.ok(!following.latest.newRewards.some(item => item.companionForm && item.frame === 'astral'));
});

test('prestige rewards preserve old Lord inventory, report fresh unlocks once and add no extra XP', () => {
  for (const [total, hard, frame] of [[99, 24, 'silver'], [199, 59, 'gold']]) {
    const archives = dnsHistory(total, hard);
    const before = progression(archives, NOW);
    archives.push(hardDns(`trigger-${frame}`));
    const after = progression(archives, NOW);
    assert.equal(after.latest.passXp, permanentXp(after) - permanentXp(before));
    assert.equal(after.xp - before.xp, 100);
    assert.equal(mastery(after, 'dns').xp - mastery(before, 'dns').xp, 150);
    for (const reward of before.inventory.filter(item => item.masteryId === 'dns')) {
      assert.deepEqual(after.inventory.find(item => item.id === reward.id), reward);
    }
    const gain = after.latest.masteryGains.find(item => item.id === 'dns');
    assert.equal(gain.prestige, frame);
    assert.equal(gain[`${frame}Unlocked`], true);
    assert.equal(gain.lordUnlocked, false);
    assert.equal(gain.levelUp, true);
    assert.equal(after.latest.newRewards.filter(item => item.masteryId === 'dns' && item.frame === frame).length, 1);
    assert.deepEqual(after, progression([...archives, ...archives], NOW));
    assert.deepEqual(after, progression(JSON.parse(JSON.stringify(archives)), NOW));
    const following = progression([...archives, hardDns(`following-${frame}`)], NOW);
    const nextGain = following.latest.masteryGains.find(item => item.id === 'dns');
    assert.equal(nextGain.silverUnlocked, false);
    assert.equal(nextGain.goldUnlocked, false);
    assert.ok(!following.latest.newRewards.some(item => item.masteryId === 'dns' && item.frame === frame));
  }
});

test('a late animal unlock receives no account Lord frames without individual mastery', () => {
  const archives = dnsHistory(200, 60);
  let previous = progression(archives, NOW);
  assert.equal(mastery(previous, 'dns').prestige, 'gold');
  assert.equal(previous.characters.find(item => item.id === 'dragon-frost').unlocked, false);
  assert.ok(!previous.inventory.some(item => item.id.startsWith('portrait-dragon-frost-lord')));
  for (let i = 0; i < 40 && !previous.characters.find(item => item.id === 'dragon-frost').unlocked; i++) {
    archives.push(career(`gold-quality-${i}`, { level: 1, scenarioIds: ['workstation-profile'], summary: { solved: true, score: 100, wrongChanges: 0, unnecessaryChecks: 0 } }));
    const current = progression(archives, NOW);
    if (current.characters.find(item => item.id === 'dragon-frost').unlocked) {
      for (const suffix of ['', '-silver', '-gold']) {
        assert.ok(!current.latest.newRewards.some(item => item.id === `portrait-dragon-frost-lord${suffix}`));
      }
      assert.equal(mastery(current, 'dns').solved, 200);
    }
    previous = current;
  }
  assert.equal(previous.characters.find(item => item.id === 'dragon-frost').unlocked, true);
  assert.deepEqual(previous, progression(JSON.parse(JSON.stringify(archives)), NOW));
});
