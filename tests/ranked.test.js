'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ranked, rankView, MAX_TOTAL_RR, DIVISIONS_PER_RANK, RANKED_RULES_VERSION } = require('../server/ranked');
const { progression } = require('../server/progression');
const { topicsFor } = require('../server/challenges');

function career(id, options = {}) {
  return { id, mode: 'career', level: 1, elapsed: 10, reference: 10, rankedRulesVersion: 1, ...options,
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0, ...options.summary } };
}
function climb(target, version = 1) {
  const archives = [];
  const total = state => version >= 3 ? state.totalRr : state.totalRr === MAX_TOTAL_RR ? 600 : state.tierIndex * 100 + state.rr;
  while (total(ranked(archives)) < target) {
    archives.push(career(`win-${archives.length}`, { level: ranked(archives).level, rankedRulesVersion: version, summary: { score: 100 } }));
    assert.ok(archives.length <= 400);
  }
  return archives;
}

test('ranked begins at support / 0 RR and cannot be raised by experience or settings', () => {
  const state = ranked([]);
  assert.equal(state.level, 1);
  assert.equal(state.name, 'IT-Support 1');
  assert.equal(state.baseName, 'IT-Support');
  assert.equal(state.division, 1);
  assert.equal(state.rr, 0);
  assert.equal(state.latest, null);
  assert.equal(state.ranks.length, 18);
  assert.equal(DIVISIONS_PER_RANK, 3);
  const game = progression([{ id: 'xp', mode: 'speedrun', level: 6, summary: { solved: true, solvedCount: 80, score: 8000 } }]);
  assert.equal(game.rank.index, 5);
  assert.equal(game.ranked.index, 0);
  assert.equal(game.ranked.totalRr, 0);
});

test('excellent solutions gain modest RR; a short streak cannot skip ranks', () => {
  const one = ranked([career('one')]);
  assert.equal(one.totalRr, 15);
  assert.equal(one.latest.delta, 15);
  const three = ranked(['one', 'two', 'three'].map(id => career(id)));
  assert.equal(three.totalRr, 45);
  assert.equal(three.level, 1);
  assert.equal(ranked([career('perfect', { summary: { score: 100 } })]).latest.delta, 18);
  assert.equal(ranked([career('medium', { summary: { score: 75 } })]).latest.delta, 0);
});

test('active work beyond reference, needless checks and risky changes reduce RR independently', () => {
  const base = climb(100);
  const level = ranked(base).level;
  const good = ranked([...base, career('good', { level })]);
  const slow = ranked([...base, career('slow', { level, elapsed: 21 })]);
  const unnecessary = ranked([...base, career('needless', { level, summary: { unnecessaryChecks: 4 } })]);
  const wrong = ranked([...base, career('wrong', { level, summary: { wrongChanges: 3 } })]);
  assert.equal(good.latest.rawDelta, 12);
  assert.equal(slow.latest.rawDelta, -8);
  assert.equal(unnecessary.latest.rawDelta, 2);
  assert.equal(wrong.latest.rawDelta, -7);
  assert.ok(slow.latest.reasons.some(reason => reason.points === -16));
  assert.ok(unnecessary.latest.reasons.some(reason => reason.points === -8));
  assert.ok(wrong.latest.reasons.some(reason => reason.points === -15));
  const waiting = ranked([...base, career('waiting', { level, elapsed: 10, waiting: 500 })]);
  assert.equal(waiting.latest.delta, good.latest.delta, 'unavoidable waiting is not active work');
});

test('giving up loses RR and drops a rank immediately at its boundary', () => {
  const archives = climb(100);
  const before = ranked(archives);
  assert.equal(before.level, 2);
  const after = ranked([...archives, career('loss', { level: before.level, rankedRulesVersion: RANKED_RULES_VERSION, summary: { solved: false, score: 90 } })]);
  assert.equal(after.latest.rawDelta, -19);
  assert.equal(after.totalRr, before.totalRr - 19);
  assert.equal(after.level, 1);
  assert.equal(after.latest.rankDown, true);
  assert.equal(after.latest.before.level, 2);
  assert.equal(after.latest.after.level, 1);
  assert.equal(after.division, 3);
  assert.equal(after.rr, after.totalRr % 100);
});

test('promotion requires 100 RR and higher ranks need consistently stronger performances', () => {
  const promoted = ranked(climb(100));
  assert.equal(promoted.latest.rankUp, true);
  assert.equal(promoted.level, 2);
  assert.equal(promoted.index, 3);
  assert.equal(promoted.division, 1);
  assert.equal(promoted.nextRank, 5);
  const high = climb(500);
  const strong = ranked([...high, career('strong-high', { level: 6, summary: { score: 100 } })]);
  const mediocre = ranked([...high, career('mediocre-high', { level: 6, elapsed: 13, summary: { score: 85 } })]);
  assert.equal(strong.latest.rawDelta, 7);
  assert.equal(mediocre.latest.rawDelta, -16);
  assert.equal(mediocre.latest.rankDown, true);
});

test('rank ceiling, floor and per-match loss cap cannot overflow', () => {
  const ceiling = ranked(climb(600));
  assert.equal(ceiling.level, 6);
  assert.equal(ceiling.rr, 100);
  assert.equal(ceiling.nextRank, null);
  assert.equal(ceiling.totalRr, MAX_TOTAL_RR);
  const maxAgain = ranked([...climb(600), career('capped', { level: 6, summary: { score: 100 } })]);
  assert.equal(maxAgain.latest.delta, 0);
  assert.equal(maxAgain.latest.rawDelta, 7);
  const low = ranked([career('floor', { elapsed: 1000, summary: { solved: false, score: 0, wrongChanges: 100, unnecessaryChecks: 100 } })]);
  assert.equal(low.totalRr, 0);
  assert.equal(low.latest.delta, 0);
  assert.equal(low.latest.rawDelta, -30);
  assert.equal(low.latest.reasons.reduce((sum, reason) => sum + reason.points, 0), 0);
  assert.equal(rankView(Infinity).totalRr, 0);
});

test('training and speedruns cannot farm or lower a competitive rank', () => {
  const base = climb(200), before = ranked(base);
  const training = career('too-easy', { level: 1, summary: { score: 100 } });
  const run = { id: 'run', mode: 'speedrun', level: 6, summary: { solved: true, score: 10000, solvedCount: 100 } };
  const after = ranked([...base, training, run]);
  assert.equal(after.totalRr, before.totalRr);
  assert.equal(after.games, before.games);
  assert.equal(after.latest.id, training.id);
  assert.equal(after.latest.training, true);
  assert.equal(after.latest.delta, 0);
});

test('old archives replay deterministically, keep saved facts and do not count duplicate IDs', () => {
  const archive = career('legacy', { level: 3 });
  delete archive.reference;
  const original = JSON.stringify(archive);
  const once = ranked([archive]);
  assert.equal(once.totalRr, 7);
  assert.equal(JSON.stringify(archive), original);
  assert.deepEqual(ranked([archive, { ...archive, reference: 10 }]), once);
  assert.deepEqual(ranked(JSON.parse(JSON.stringify([archive]))), once);
  assert.equal(ranked([career('missing-proof', { summary: { wrongChanges: undefined } })]).latest.delta, 3);
  assert.equal(ranked([{ id: 'invalid', mode: 'career', level: 1, summary: { solved: true, score: NaN } }]).latest, null);
});

test('current rules ease the first three ranks and retain the high-rank curve', () => {
  const maxGains = [], losses = [], lossCaps = [];
  for (let index = 0; index < 6; index++) {
    const archives = climb(index * 100), before = ranked(archives);
    assert.equal(before.index, index * 3);
    const win = ranked([...archives, career(`curve-win-${index}`, { level: index + 1, rankedRulesVersion: RANKED_RULES_VERSION, summary: { score: 100 } })]);
    const loss = ranked([...archives, career(`curve-loss-${index}`, { level: index + 1, rankedRulesVersion: RANKED_RULES_VERSION, summary: { solved: false, score: 0 } })]);
    maxGains.push(win.latest.rawDelta);
    losses.push(loss.latest.rawDelta);
    lossCaps.push(before.rules.maxLoss);
    const entryBonus = [15, 12, 8][index] || 0;
    const lossMultiplier = index < 3 ? [.4, .65, 1][index] : 1.25 ** index;
    assert.equal(before.rules.maxGain, Math.floor((18 + entryBonus) / 1.18 ** index));
    assert.equal(before.rules.maxLoss, Math.round(30 * lossMultiplier));
    assert.equal(before.rules.curve.gainDivisor, 1.18 ** index);
    assert.equal(before.rules.curve.lossMultiplier, lossMultiplier);
    assert.equal(before.rules.perRank[index].level, index + 1);
    assert.equal(before.rules.perRank[index].maxLoss, before.rules.maxLoss);
    if (index > 0) {
      assert.ok(maxGains[index] < maxGains[index - 1]);
      assert.ok(losses[index] < losses[index - 1]);
      assert.ok(lossCaps[index] > lossCaps[index - 1]);
      if (lossMultiplier !== 1) assert.ok(loss.latest.reasons.some(reason => reason.label.includes(index < 3 ? 'Reduzierte Abzüge im Einstieg' : 'Exponentieller Rangfaktor für Abzüge')));
    }
  }
  assert.deepEqual(maxGains, [33, 25, 18, 10, 9, 7]);
  assert.deepEqual(losses, [-12, -19, -28, -55, -69, -86]);
  assert.deepEqual(lossCaps, [12, 20, 30, 59, 73, 92]);
});

test('new support cases reward useful learning progress and reach support division two in four strong solutions', () => {
  const current = (id, options = {}) => career(id, { ...options, rankedRulesVersion: RANKED_RULES_VERSION });
  assert.equal(ranked([current('strong')]).latest.delta, 30);
  assert.equal(ranked([current('perfect', { summary: { score: 100 } })]).latest.delta, 33);
  assert.equal(ranked([current('good', { summary: { score: 80 } })]).latest.delta, 18);
  assert.equal(ranked([current('learning', { summary: { score: 75 } })]).latest.delta, 15);
  assert.ok(ranked([current('pass', { summary: { score: 70 } })]).latest.delta > 0);
  assert.equal(ranked([current('poor', { summary: { score: 60 } })]).latest.rawDelta, -4);
  const archives = ['one', 'two', 'three'].map(id => current(id));
  assert.equal(ranked(archives).level, 1);
  assert.equal(ranked([...archives, current('four')]).level, 1);
  assert.equal(ranked([...archives, current('four')]).division, 2);
  assert.equal(ranked([...archives, current('four')]).totalRr, 120);
});

test('all eighteen division boundaries retain six technical difficulty levels', () => {
  const baseNames = ranked([]).rules.perRank.map(item => item.name);
  const names = new Set();
  for (let index = 0; index < 18; index++) {
    const current = rankView(index * 100);
    const tierIndex = Math.floor(index / 3), division = index % 3 + 1;
    assert.equal(current.index, index);
    assert.equal(current.rankIndex, index);
    assert.equal(current.tierIndex, tierIndex);
    assert.equal(current.level, tierIndex + 1);
    assert.equal(current.division, division);
    assert.equal(current.baseName, baseNames[tierIndex]);
    assert.equal(current.name, `${baseNames[tierIndex]} ${division}`);
    assert.equal(current.rr, 0);
    assert.equal(rankView(index * 100 + 99).index, index);
    assert.equal(rankView(index * 100 + 99).rr, 99);
    if (index) assert.equal(rankView(index * 100 - 1).index, index - 1);
    if (index < 17) {
      assert.equal(current.nextName, rankView((index + 1) * 100).name);
      assert.equal(current.nextRank, index + 2);
    } else {
      assert.equal(current.nextName, null);
      assert.equal(current.nextRank, null);
    }
    names.add(current.name);
  }
  assert.equal(names.size, 18);
  assert.equal(rankView(1800).name, 'Infrastruktur-Experte 3');
  assert.equal(rankView(1800).rr, 100);
  assert.deepEqual(rankView(99999), rankView(1800));
  assert.deepEqual(rankView(-1), rankView(0));
});

test('new careers climb all eighteen divisions without shortening the six-rank path', () => {
  const archives = [], reached = new Set([0]);
  let current = ranked(archives);
  while (current.totalRr < MAX_TOTAL_RR) {
    const before = current;
    archives.push(career(`division-${archives.length}`, { level: current.level, rankedRulesVersion: RANKED_RULES_VERSION, summary: { score: 100 } }));
    current = ranked(archives);
    assert.ok(archives.length < 400);
    assert.ok(current.index === before.index || current.index === before.index + 1);
    assert.equal(current.latest.before.totalRr, before.totalRr);
    assert.equal(current.latest.after.totalRr, current.totalRr);
    assert.equal(current.latest.delta, current.totalRr - before.totalRr);
    assert.equal(current.latest.reasons.reduce((sum, item) => sum + item.points, 0), current.latest.delta);
    assert.equal(current.rules.divisionsPerRank, 3);
    assert.equal(current.rules.rrPerRank, 100);
    assert.equal(current.rules.curve.gainDivisor, 1.18 ** current.tierIndex);
    reached.add(current.index);
  }
  assert.equal(reached.size, 18);
  assert.equal(current.name, 'Infrastruktur-Experte 3');
  assert.equal(current.level, 6);
  assert.equal(current.rr, 100);
  const capped = ranked([...archives, career('capped-v3', { level: 6, rankedRulesVersion: RANKED_RULES_VERSION, summary: { score: 100 } })]);
  assert.equal(capped.latest.rawDelta, 7);
  assert.equal(capped.latest.delta, 0);
});

test('a division demotion does not change technical difficulty within its main rank', () => {
  const archives = climb(100, RANKED_RULES_VERSION);
  const before = ranked(archives);
  assert.equal(before.name, 'IT-Support 2');
  const loss = career('division-loss', { rankedRulesVersion: RANKED_RULES_VERSION, elapsed: 100, summary: { solved: false, score: 0, wrongChanges: 100 } });
  const after = ranked([...archives, loss, { ...loss, id: 'division-loss-2' }, { ...loss, id: 'division-loss-3' }]);
  assert.equal(after.name, 'IT-Support 1');
  assert.equal(after.latest.rankDown, true);
  assert.equal(after.latest.before.level, 1);
  assert.equal(after.latest.after.level, 1);
  assert.equal(after.latest.delta, -12);
});

test('version two saves preserve their earned main rank and local RR exactly once', () => {
  const archives = ['one', 'two', 'three', 'four'].map(id => career(`v2-${id}`, { level: 1, rankedRulesVersion: 2 }));
  const original = JSON.stringify(archives);
  const migrated = ranked(archives);
  assert.equal(migrated.name, 'Fortgeschrittener IT-Support 1');
  assert.equal(migrated.rr, 20);
  assert.equal(migrated.totalRr, 320);
  assert.equal(migrated.latest.rawDelta, 30, 'the recorded v2 performance keeps its original balancing');
  assert.equal(migrated.latest.migrationAdjustment, 200);
  assert.equal(migrated.latest.delta, 230);
  assert.equal(migrated.latest.after.totalRr - migrated.latest.before.totalRr, migrated.latest.delta);
  assert.equal(migrated.latest.reasons.reduce((sum, item) => sum + item.points, 0), migrated.latest.delta);
  assert.ok(migrated.latest.reasons.some(item => item.label.includes('Übernahme bereits erreichter Ränge')));
  assert.deepEqual(ranked(JSON.parse(original)), migrated);
  const fresh = career('v3-first', { level: 2, rankedRulesVersion: RANKED_RULES_VERSION });
  const next = ranked([...archives, fresh]);
  assert.equal(next.latest.before.totalRr, 320);
  assert.equal(next.totalRr, 342);
  assert.equal(next.latest.delta, 22);
  assert.equal(next.latest.migrationAdjustment, undefined);
  assert.ok(next.latest.reasons.every(item => !item.label.includes('Übernahme')));
  assert.deepEqual(ranked(JSON.parse(JSON.stringify([...archives, fresh]))), next);
  assert.equal(JSON.stringify(archives), original);
});

test('mixed historical and current rules never revert the new division coordinate system', () => {
  const archives = climb(100, 2);
  const migrated = ranked(archives);
  const fresh = career('current-first', { level: 2, rankedRulesVersion: RANKED_RULES_VERSION });
  const current = ranked([...archives, fresh]);
  const oldRule = career('historical-rule-after-current', { level: 2, rankedRulesVersion: 2 });
  const after = ranked([...archives, fresh, oldRule]);
  assert.equal(current.latest.before.totalRr, migrated.totalRr);
  assert.equal(after.latest.before.totalRr, current.totalRr);
  assert.equal(after.totalRr, current.totalRr + 22);
  assert.deepEqual(ranked([...archives, fresh, oldRule, { ...fresh }]), after);
  const training = career('easier-current-case', { level: 1, rankedRulesVersion: RANKED_RULES_VERSION, summary: { score: 100 } });
  const run = { id: 'speedrun-after-current', mode: 'speedrun', level: 6, summary: { solved: true, score: 10000 } };
  const ignored = ranked([...archives, fresh, oldRule, training, run]);
  assert.equal(ignored.totalRr, after.totalRr);
  assert.equal(ignored.latest.training, true);
  assert.equal(ignored.latest.delta, 0);
  assert.equal(ignored.games, after.games);
});

test('new cases keep speed, efficiency and safety consequences with exact visible reason totals', () => {
  for (let index = 0; index < 6; index++) {
    const archives = climb(index * 100);
    const evaluate = (id, options) => ranked([...archives, career(id, { ...options, level: index + 1, rankedRulesVersion: RANKED_RULES_VERSION })]);
    const clean = evaluate('clean', { summary: { score: 95 } });
    for (const [id, options] of [
      ['slow', { elapsed: 21 }], ['unnecessary', { summary: { unnecessaryChecks: 4 } }],
      ['unsafe', { summary: { wrongChanges: 3 } }],
      ['failed', { summary: { solved: false, score: 0 } }],
      ['capped', { elapsed: 100, summary: { solved: false, score: 0, unnecessaryChecks: 100, wrongChanges: 100 } }],
    ]) {
      const result = evaluate(id, options);
      assert.ok(result.latest.rawDelta < clean.latest.rawDelta);
      assert.ok(result.latest.rawDelta >= -clean.rules.perRank[index].maxLoss);
      assert.equal(result.latest.reasons.reduce((sum, reason) => sum + reason.points, 0), result.latest.delta);
    }
    assert.equal(evaluate('waiting', { waiting: 500 }).latest.delta, clean.latest.delta);
  }
});

test('unversioned archives keep their original RR while subsequent completions use the new rules', () => {
  const old = career('old'); delete old.rankedRulesVersion;
  const oldJson = JSON.stringify(old);
  assert.equal(ranked([old]).totalRr, 15);
  const fresh = career('new', { rankedRulesVersion: RANKED_RULES_VERSION });
  const mixed = ranked([old, fresh]);
  assert.equal(mixed.totalRr, 45);
  assert.equal(mixed.latest.before.totalRr, 15);
  assert.equal(mixed.latest.delta, 30);
  assert.equal(JSON.stringify(old), oldJson);
  assert.deepEqual(ranked(JSON.parse(JSON.stringify([old, fresh]))), mixed);
  const missingProof = career('missing-proof-new', { rankedRulesVersion: RANKED_RULES_VERSION, summary: { wrongChanges: undefined } });
  assert.equal(ranked([missingProof]).latest.delta, 3, 'entry bonus cannot bypass missing proof limits');
});

test('exponential penalties preserve exact reason totals through rounding, rank boundaries and caps', () => {
  for (let index = 0; index < 6; index++) {
    const archives = climb(index * 100);
    for (const [id, options] of [
      ['win', { summary: { score: 100 } }],
      ['slow', { elapsed: 16, summary: { score: 95, unnecessaryChecks: 2, wrongChanges: 1 } }],
      ['loss', { summary: { solved: false, score: 0 } }],
      ['cap', { elapsed: 100, summary: { solved: false, score: 0, unnecessaryChecks: 100, wrongChanges: 100 } }],
    ]) {
      const archive = career(`sum-${index}-${id}`, { ...options, level: index + 1 });
      const result = ranked([...archives, archive]);
      assert.equal(result.latest.reasons.reduce((sum, reason) => sum + reason.points, 0), result.latest.delta);
      assert.deepEqual(result, ranked(JSON.parse(JSON.stringify([...archives, archive]))));
      assert.ok(result.latest.rawDelta >= -Math.round(30 * 1.25 ** index));
    }
  }
});

test('missing historical proof limits gains without manufacturing exponentially scaled losses', () => {
  const archives = climb(500);
  const withoutTime = career('old-high', { level: 6 });
  delete withoutTime.reference;
  const result = ranked([...archives, withoutTime]);
  assert.equal(result.latest.rawDelta, Math.floor(7 / 1.18 ** 5));
  const withoutQuality = career('old-quality-high', { level: 6, summary: { wrongChanges: undefined } });
  const qualityResult = ranked([...archives, withoutQuality]);
  assert.equal(qualityResult.latest.rawDelta, Math.floor(3 / 1.18 ** 5));
  assert.equal(qualityResult.latest.reasons.reduce((sum, reason) => sum + reason.points, 0), qualityResult.latest.delta);
});

test('Linux scenarios award the authored technical mastery rather than prose guesses', () => {
  for (const [scenarioId, expected] of [
    ['linux-dns-split', ['dns', 'network', 'linux']],
    ['linux-pam-directory', ['identity', 'security', 'linux']],
    ['linux-systemd-chain', ['monitoring', 'linux']],
    ['linux-ha-quorum', ['virtualization', 'monitoring', 'linux']],
    ['linux-policy-routing', ['network', 'linux']],
  ]) {
    const entry = { solved: true, solvedCount: 1, mode: 'career', archive: { level: 6, scenarioIds: [scenarioId] } };
    assert.deepEqual(topicsFor(entry)[0].domains, expected);
  }
});
