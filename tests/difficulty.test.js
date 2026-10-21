'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { plan, difficultyFor, promptFor } = require('../server/simulation');
const { SCENARIOS } = require('../server/difficulty');

test('six public difficulty profiles are distinct and contain no scenario cause', () => {
  const profiles = Array.from({ length: 6 }, (_, index) => difficultyFor(index + 1));
  assert.deepEqual(profiles.map(profile => profile.level), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(profiles.map(profile => profile.title)).size, 6);
  for (const profile of profiles) {
    assert.deepEqual(Object.keys(profile).sort(), ['challenge', 'level', 'scope', 'summary', 'title']);
    assert.ok(profile.summary && profile.scope && profile.challenge);
  }
  for (let level = 1; level <= 6; level++) assert.equal(SCENARIOS.filter(item => item.level === level).length, level < 4 ? 12 : 14);
});

test('plans bind varied scenarios to requested level and avoid recent cases when alternatives exist', () => {
  let value = 0;
  const random = () => (value = (value + .173) % 1);
  const rows = plan('speedrun', 120, 1001, random, 4);
  assert.ok(rows.length > 1);
  assert.ok(rows.every(row => SCENARIOS.some(item => item.id === row.scenarioId && item.level === 4 && item.category === row.category)));
  assert.equal(new Set(rows.map(row => row.number)).size, rows.length);
  assert.ok(rows.every((row, index) => index === 0 || row.minute > rows[index - 1].minute));
  const recent = SCENARIOS.filter(item => item.level === 2).slice(0, 5).map(item => item.id);
  const career = plan('career', null, 1002, () => .2, 2, recent);
  assert.equal(career.length, 1);
  assert.ok(!recent.includes(career[0].scenarioId));
  assert.equal(career[0].number, '1002');
});

test('arrival density increases with level and old four-argument API remains usable', () => {
  const baseline = plan('speedrun', 120, 1001, () => .5);
  const advanced = plan('speedrun', 120, 1001, () => .5, 6);
  assert.ok(advanced.length > baseline.length);
  assert.equal(plan('career', null, 42, () => .5)[0].number, '42');
});

test('new speedrun plans bound idle gaps even when the random source draws its maximum', () => {
  for (const duration of [60, 120, 240]) for (const level of [1, 2, 3, 4, 5, 6]) {
    const rows = plan('speedrun', duration, 1001, () => .999999999, level);
    assert.ok(rows.length >= 3, `${duration} minutes, level ${level}`);
    assert.ok(rows.every((row, index) => index === 0 || row.minute - rows[index - 1].minute <= Math.min(30, duration / 3)));
    assert.ok(rows.every(row => row.minute < duration));
  }
});

test('prompt includes binding profile and scenario context without making briefing the cause', () => {
  const prompt = promptFor({ rules: 'rules', session: { level: 6, mode: 'career', plan: [{ number: '1001', scenarioId: 'critical-name-path', category: 'DNS', briefing: 'Kritischer Dienstpfad.' }] },
    previous: null, message: 'Start', history: [], environment: '', baseline: {} });
  assert.match(prompt, /Level 6 – Infrastruktur-Experte/);
  assert.match(prompt, /scenarioId/);
  assert.match(prompt, /Briefing ist keine festgelegte Ursache/);
  assert.match(prompt, /genau EINE Hauptursache/);
});

test('advanced Linux cases cover services, permissions, identity, networking and safe recovery', () => {
  const linux = SCENARIOS.filter(item => item.id.startsWith('linux-'));
  assert.equal(linux.length, 10);
  assert.deepEqual([...new Set(linux.map(item => item.level))], [4, 5, 6]);
  assert.equal(new Set(SCENARIOS.map(item => item.id)).size, SCENARIOS.length);
  for (const level of [4, 5, 6]) assert.match(difficultyFor(level).scope, /Linux/);
  for (const id of ['linux-systemd-chain', 'linux-file-acl', 'linux-pam-directory', 'linux-policy-routing', 'linux-ha-quorum', 'linux-storage-recovery']) {
    const scenario = linux.find(item => item.id === id);
    assert.ok(scenario && scenario.briefing.length > 100);
    const prompt = promptFor({ rules: 'rules', session: { level: scenario.level, mode: 'career', plan: [{ ...scenario, number: '1001' }] },
      previous: null, message: 'Start', history: [], environment: '', baseline: {} });
    assert.match(prompt, /Linux/);
    assert.ok(prompt.includes(scenario.id));
    assert.match(prompt, /Rückfall/);
    assert.match(prompt, /genau EINE Hauptursache/);
  }
});
