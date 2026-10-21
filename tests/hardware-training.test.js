'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIOS } = require('../server/difficulty');
const { variationsFor } = require('../server/case-variations');
const { plan, promptFor } = require('../server/simulation');
const { progression } = require('../server/progression');
const { rewardForArchive } = require('../server/companions');
const { TECHNOLOGY_ADVICE } = require('../server/technology-advice');

const NOW = Date.parse('2026-10-21T12:00:00Z');
function career(id, scenarioId, level = 4, characterId = 'wolf') {
  return { id, mode: 'career', level, elapsed: 15, reference: 20, completedAt: '2026-10-21T10:00:00Z',
    scenarioIds: [scenarioId], completedTickets: [{ number: '1001', scenarioId }],
    companionReward: { version: 1, characterId, xp: 100 },
    summary: { solved: true, score: 90, unnecessaryChecks: 0, wrongChanges: 0, solvedCount: 1 } };
}
const mastery = (game, id) => game.masteries.find(item => item.id === id);
function prompt(scenarioId) {
  const scenario = SCENARIOS.find(item => item.id === scenarioId);
  return promptFor({ rules: '', session: { mode: 'career', level: scenario.level,
    plan: [{ ...scenario, scenarioId: scenario.id, number: '1001', caseVariant: variationsFor(scenario)[0] }] },
    previous: null, history: [], message: 'Start', environment: '', baseline: {} });
}

test('hardware repair and advice families are selectable at every difficulty in career and speedrun', () => {
  for (let level = 1; level <= 6; level++) {
    const families = SCENARIOS.filter(item => item.level === level);
    for (const advice of [false, true]) {
      const family = families.find(item => item.id.startsWith('hardware-') && item.id.startsWith('hardware-advice-') === advice);
      assert.ok(family);
      // All other families are recent: the new family must participate in the actual planner.
      const recent = families.filter(item => item !== family).map(item => item.id);
      for (const mode of ['career', 'speedrun']) {
        const row = plan(mode, 60, 1001, () => .5, level, recent)[0];
        assert.equal(row.scenarioId, family.id);
        assert.equal(row.category, family.category);
        assert.ok(variationsFor(family).some(item => item.fingerprint === row.caseVariant.fingerprint));
      }
      const variants = variationsFor(family);
      assert.equal(new Set(variants.map(item => item.cause)).size, 6);
      assert.ok(variants.every(item => !/Kennwort|Gruppenberechtigung|Sitzungen/.test(item.trigger + item.symptom)));
    }
  }
});

test('Linux mastery retroactively reads known solved families without mutating archives or inventing personal credit', () => {
  const old = career('old-linux', 'linux-systemd-chain');
  delete old.completedTickets;
  delete old.companionReward;
  const snapshot = JSON.stringify(old);
  const game = progression([old, old, {
    ...career('failed', 'linux-file-acl', 4, 'snake'), summary: { solved: false, score: 0 } }], NOW);
  assert.equal(mastery(game, 'linux').solved, 1);
  assert.equal(mastery(game, 'linux').hardSolved, 1);
  assert.equal(mastery(game, 'monitoring').solved, 1);
  assert.ok(Object.values(game.companionMasteries).every(rows => rows.find(item => item.id === 'linux').solved === 0));
  assert.equal(JSON.stringify(old), snapshot);
});

test('repair, advice and Linux earn separate mastery and only the recorded companion gets personal progress', () => {
  const cases = [career('repair', 'hardware-server-repair', 4, 'dragon'),
    career('advice', 'hardware-advice-workstation', 3, 'snake'), career('linux', 'linux-systemd-chain')];
  const game = progression(cases, NOW);
  for (const [id, character, hard] of [['hardware', 'dragon', 1], ['hardware-advice', 'snake', 0], ['linux', 'wolf', 1]]) {
    const domain = mastery(game, id);
    assert.equal(domain.solved, 1);
    assert.equal(domain.hardSolved, hard);
    assert.ok(domain.description && domain.titleName);
    assert.ok(game.challenges.permanent.some(item => item.id === `permanent-topic-${id}-1` && item.unlocked));
    assert.equal(game.companionMasteries[character].find(item => item.id === id).solved, 1);
    assert.ok(Object.entries(game.companionMasteries).filter(([animal]) => animal !== character)
      .every(([, rows]) => rows.find(item => item.id === id).solved === 0));
  }
  assert.equal(rewardForArchive(cases[0], 'dragon').xp, 150);
  assert.equal(rewardForArchive(cases[1], 'snake').xp, 150);
  assert.equal(rewardForArchive(cases[2], 'wolf').xp, 150);
  assert.equal(rewardForArchive(cases[2], 'dragon').xp, 100);
  // A Linux ticket matching several affinities still gives only one bonus.
  assert.equal(rewardForArchive(career('ha', 'linux-ha-quorum', 6), 'wolf').bonusXp, 50);
});

test('new domains never credit prose, unknown IDs or unsolved speedrun arrivals', () => {
  const game = progression([{ id: 'shift', mode: 'speedrun', level: 6,
    scenarioIds: ['hardware-critical-repair', 'linux-ha-quorum', 'hardware-advice-critical'],
    completedTickets: [{ number: 'S01', scenarioId: 'hardware-advice-critical' }],
    summary: { solved: true, solvedCount: 1, score: 90 }, report: 'Linux Hardware repariert' },
  career('unknown', 'made-up')], NOW);
  assert.equal(mastery(game, 'hardware-advice').solved, 1);
  assert.equal(mastery(game, 'hardware-advice').hardSolved, 1);
  assert.equal(mastery(game, 'hardware').solved, 0);
  assert.equal(mastery(game, 'linux').solved, 0);
});

test('advice prompt freezes comparable EUR offers, requires reasoned rejection and allows a verified no-purchase decision', () => {
  const text = prompt('hardware-advice-critical');
  for (const pattern of [/mindestens drei konkrete Angebote/, /simulierte Trainingspreise in EUR/,
    /netto oder brutto/, /Umsatzsteuersatz/, /Stückpreis × Menge/, /kWh\/Jahr × EUR\/kWh × Jahre/,
    /Angebote nicht nachträglich/, /mindestens eines muss wegen exakt der vorgegebenen Hauptursache ungeeignet sein/,
    /Aufschub oder Nichtkauf/, /begründet abgelehnten Alternative/, /dokumentierter Rückmeldung/,
    /Keine pauschalen Markenabwertungen/, /Keine automatische Empfehlung/, /keinen erfundenen pauschalen Score/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /- HARDWAREDEFEKTE:/);
});

test('repair prompt requires a physical cause, safe handling and checked restoration; unrelated cases stay focused', () => {
  const text = prompt('hardware-server-repair');
  for (const pattern of [/physische Hauptursache/, /ESD/, /Hot-Swap/, /niemals intern öffnen/,
    /nicht blind initialisieren/, /Seriennummer und Slot/, /ohne geprüfte Wiederherstellung nicht als gelöst/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /- HARDWAREBERATUNG \/ VERKAUF:/);
  assert.doesNotMatch(prompt('dns-resolution'), /- HARDWARE(?:DEFEKTE|BERATUNG)/);
});

test('consumer technology families are selectable, have their own fault modes and credit the existing advice mastery', () => {
  assert.equal(new Set(TECHNOLOGY_ADVICE.map(item => item.id)).size, 12);
  for (const product of TECHNOLOGY_ADVICE) {
    const id = `hardware-advice-${product.id}`;
    const scenario = SCENARIOS.find(item => item.id === id);
    assert.ok(scenario, product.name);
    const otherFamilies = SCENARIOS.filter(item => item.level === scenario.level && item.id !== id).map(item => item.id);
    for (const mode of ['career', 'speedrun']) {
      const row = plan(mode, 60, 1001, () => .5, scenario.level, otherFamilies)[0];
      assert.equal(row.scenarioId, id);
      assert.ok(product.causes.includes(row.caseVariant.cause));
    }
    assert.equal(new Set(variationsFor(scenario).map(item => item.cause)).size, 6);
    const archive = career(id, id, scenario.level, 'snake');
    const game = progression([archive], NOW);
    assert.equal(mastery(game, 'hardware-advice').solved, 1);
    assert.equal(mastery(game, 'hardware-advice').hardSolved, scenario.level >= 4 ? 1 : 0);
    assert.equal(mastery(game, 'hardware').solved, 0);
    assert.equal(game.companionMasteries.snake.find(item => item.id === 'hardware-advice').solved, 1);
    assert.equal(rewardForArchive(archive, 'snake').xp, 150);
  }
});

test('technology prompts require appropriate device criteria without turning consumer advice into server incidents', () => {
  for (const product of TECHNOLOGY_ADVICE) {
    const text = prompt(`hardware-advice-${product.id}`);
    assert.ok(text.includes(product.criteria));
    assert.match(text, /Privatkunden, Haushalte, Vereine/);
    assert.match(text, /nicht zum Server/);
    assert.match(text, /simulierte Trainingspreise in EUR/);
    const deviceRules = text.split('\n').filter(line => line.startsWith('- PRODUKTBEZOGENE BERATUNG'));
    assert.equal(deviceRules.length, 1);
    assert.ok(deviceRules[0].startsWith(`- PRODUKTBEZOGENE BERATUNG ${product.name}:`));
  }
  assert.match(prompt('hardware-advice-television'), /native Auflösung und Bildwiederholrate/);
  assert.match(prompt('hardware-advice-mobile'), /Sicherheitsupdates ab Angebotsdatum/);
  assert.match(prompt('hardware-advice-home-network'), /Bruttoraten sind kein erreichbarer Internetdurchsatz/);
  assert.match(prompt('hardware-advice-mobile'), /Tarifbindung/);
  assert.doesNotMatch(prompt('hardware-workstation'), /- BREITE TECHNIKBERATUNG/);
});
