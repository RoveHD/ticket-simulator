'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { progression } = require('../server/progression');

const career = (id, summary) => ({ id, mode: 'career', summary, level: 3, elapsed: 10 });
const speedrun = (id, solvedCount, score = 0) => ({ id, mode: 'speedrun', summary: { solvedCount, score, solved: solvedCount > 0 }, level: 3, elapsed: 10 });

test('leere Archive starten ohne XP und mit Fortschritt auf dem ersten Rang', () => {
  const result = progression([]);
  assert.equal(result.xp, 0);
  assert.deepEqual(result.rank, { name: 'Neustart', index: 0, start: 0, next: 300, nextName: 'Einsatzbereit', progress: 0 });
  assert.equal(result.solved, 0);
  assert.equal(result.streak, 0);
  assert.equal(result.latest, null);
  assert.equal(result.missions.length, 4);
  assert.equal(result.ranked.level, 1);
  assert.equal(result.ranked.totalRr, 0);
});

test('ungelöster Karrierefall gibt keine XP oder Mission frei', () => {
  const result = progression([career('a', { solved: false, score: 80, wrongChanges: 0, unnecessaryChecks: 0 })]);
  assert.equal(result.xp, 0);
  assert.equal(result.solved, 0);
  assert.equal(result.latest.xp, 0);
  assert.deepEqual(result.latest.unlocked, []);
  assert.equal(result.missions[0].current, 0);
});

test('XP-Rangschwellen und Maximalrang sind korrekt', () => {
  for (const [points, name, index] of [[300, 'Einsatzbereit', 1], [800, 'Problemlöser', 2], [1600, 'Teamstütze', 3], [3000, 'Betriebsprofi', 4], [5000, 'Leitstelle', 5]]) {
    // Each completed shift gives 100 XP per ticket; the first also unlocks 150 XP.
    const count = points === 300 ? 2 : Math.ceil((points - 150) / 100);
    const archives = Array.from({ length: count }, (_, i) => speedrun(`s${points}-${i}`, 1));
    const result = progression(archives);
    assert.equal(result.rank.name, name);
    assert.equal(result.rank.index, index);
    assert.equal(result.rank.progress, points === 5000 ? 100 : Math.floor((result.xp - result.rank.start) * 100 / (result.rank.next - result.rank.start)));
  }
  const max = progression([speedrun('max', 50)]).rank;
  assert.equal(max.next, null);
  assert.equal(max.nextName, null);
});

test('Missionsboni werden beim ersten Erreichen einmalig vergeben', () => {
  const archives = [
    career('1', { solved: true, score: 50, wrongChanges: 0, unnecessaryChecks: 0 }),
    career('2', { solved: true, score: 50, wrongChanges: 0, unnecessaryChecks: 0 }),
    career('3', { solved: true, score: 50, wrongChanges: 0, unnecessaryChecks: 0 }),
    career('4', { solved: true, score: 50, wrongChanges: 0, unnecessaryChecks: 0 }),
    career('5', { solved: true, score: 50, wrongChanges: 0, unnecessaryChecks: 0 }),
  ];
  const result = progression(archives);
  assert.equal(result.xp, 5 * 225 + 100 + 200 + 300);
  assert.deepEqual(result.latest.unlocked.map(m => m.id), ['reliable']);
  assert.equal(result.latest.bonusXp, 300);
  assert.equal(result.missions.slice(0, 3).every(m => m.unlocked), true);
  assert.equal(result.missions[3].unlocked, false);
  const appended = progression([...archives, career('6', { solved: true, score: 0, wrongChanges: 1, unnecessaryChecks: 2 })]);
  assert.equal(appended.latest.bonusXp, 0);
  assert.deepEqual(appended.latest.unlocked, []);
});

test('Speedruns zählen gelöste Tickets, erhalten keine Scoreboni und ignorieren die Karriere-Serie', () => {
  const result = progression([
    career('c1', { solved: true, score: 75, wrongChanges: 1, unnecessaryChecks: 0 }),
    speedrun('s1', 2, 100),
    career('c2', { solved: true, score: 40, wrongChanges: 0, unnecessaryChecks: 0 }),
  ]);
  assert.equal(result.xp, 250 + 200 + 205 + 250);
  assert.equal(result.solved, 4);
  assert.equal(result.streak, 2);
  assert.equal(result.latest.baseXp, 205);
  assert.equal(result.latest.bonusXp, 0);
  const run = progression([speedrun('only-run', 2, 147)]);
  assert.equal(run.xp, 200 + 150);
  assert.equal(run.latest.baseXp, 200);
  assert.equal(run.latest.bonusXp, 150);
  assert.equal(run.latest.score, 147);
});

test('Reload ist deterministisch und doppelte IDs werden nicht doppelt gezählt', () => {
  const archives = [
    career('same', { solved: true, score: 80, wrongChanges: 0, unnecessaryChecks: 0 }),
    career('same', { solved: true, score: 100, wrongChanges: 0, unnecessaryChecks: 0 }),
    speedrun('run', 2, 90),
  ];
  assert.deepEqual(progression(archives), progression(JSON.parse(JSON.stringify(archives))));
  const result = progression(archives);
  assert.equal(result.xp, 285 + 200 + 150 + 100);
  assert.equal(result.solved, 3);
  assert.equal(result.latest.id, 'run');
});

