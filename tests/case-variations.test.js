'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCENARIOS } = require('../server/difficulty');
const { variationsFor } = require('../server/case-variations');
const { plan, promptFor } = require('../server/simulation');

test('every scenario family has many technically coherent distinct variants', () => {
  for (let level = 1; level <= 6; level++) {
    const families = SCENARIOS.filter(row => row.level === level);
    assert.ok(families.length >= 8);
    for (const family of families) {
      const variants = variationsFor(family);
      assert.ok(new Set(variants.map(row => row.cause)).size >= 6, `${family.id} needs six authored causes`);
      assert.ok(variants.length >= 280, `${family.id} should have at least 280 combinations`);
      assert.equal(new Set(variants.map(row => row.fingerprint)).size, variants.length);
      for (const variant of variants) {
        assert.equal(variant.family, family.id);
        assert.ok(variant.cause && variant.trigger && variant.symptom && variant.scope);
      }
    }
  }
});

test('exhausting a preferred family does not cause replay while another family is fresh', () => {
  const families = SCENARIOS.filter(row => row.level === 2);
  const depleted = families[0];
  const used = variationsFor(depleted).map(row => row.fingerprint);
  const row = plan('career', null, 101, () => 0, 2, [depleted.id], used)[0];
  assert.notEqual(row.scenarioId, depleted.id);
  assert.equal(row.caseVariant.repeated, undefined);
  assert.ok(!used.includes(row.caseVariant.fingerprint));
});

test('catalog exhaustion uses stable fingerprints and marks controlled repeats', () => {
  const levelThree = SCENARIOS.filter(row => row.level === 3);
  const catalog = levelThree.flatMap(family => variationsFor(family).map(row => row.fingerprint));
  const rows = plan('speedrun', 120, 1, () => .37, 3, [], catalog);
  assert.ok(rows.length > 1);
  assert.ok(rows.every(row => row.caseVariant.repeated === true && row.caseVariant.cycle === 2));
  assert.ok(rows.every(row => catalog.includes(row.caseVariant.fingerprint)));
  assert.equal(new Set(rows.map(row => row.caseVariant.fingerprint)).size, rows.length);
});

test('seeded plans are deterministic and full history excludes used fingerprints', () => {
  function seeded(seed) { return () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; }; }
  const a = plan('career', null, 1001, seeded(73), 4);
  const b = plan('career', null, 1001, seeded(73), 4);
  assert.deepEqual(a, b);
  const used = a.map(row => row.caseVariant.fingerprint);
  const next = plan('career', null, 1002, seeded(73), 4, [], used);
  assert.ok(!used.includes(next[0].caseVariant.fingerprint));
  assert.notEqual(a[0].caseVariant.fingerprint, next[0].caseVariant.fingerprint);
});

test('persistent history prevents repeats across at least 500 career tickets', () => {
  const history = [];
  const seen = new Set();
  let seed = 21;
  const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 500; i++) {
    const row = plan('career', null, String(2000 + i), random, 3, [], history)[0];
    assert.ok(!seen.has(row.caseVariant.fingerprint), `repeat at ticket ${i}`);
    seen.add(row.caseVariant.fingerprint);
    history.push(row.caseVariant.fingerprint);
  }
});

test('speedrun plans keep distinct fingerprints and preserve scenario family identity', () => {
  const rows = plan('speedrun', 120, 1, () => .41, 5);
  assert.ok(rows.length > 1);
  assert.equal(new Set(rows.map(row => row.caseVariant.fingerprint)).size, rows.length);
  assert.ok(rows.every(row => SCENARIOS.some(s => s.id === row.scenarioId && s.level === 5)));
});

test('prompt treats case variant as internal binding data and maintains environment continuity', () => {
  const row = plan('career', null, 1001, () => .3, 3)[0];
  const prompt = promptFor({ rules: 'rules', session: { level: 3, mode: 'career', plan: [row] }, previous: null,
    message: 'Start', history: [], environment: 'Feste Umgebung', baseline: {} });
  assert.match(prompt, /exakt dessen cause als Hauptursache/);
  assert.match(prompt, /niemals im öffentlichen Ticket/);
  assert.match(prompt, /Feste Umgebung/);
  assert.ok(prompt.includes(row.caseVariant.cause));
  assert.match(prompt, /diese internen Variantenangaben niemals im öffentlichen Ticket/);
});
