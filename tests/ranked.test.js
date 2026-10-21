'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ranked, rankView, MAX_TOTAL_RR } = require('../server/ranked');
const { progression } = require('../server/progression');
const { topicsFor } = require('../server/challenges');

function career(id, options = {}) {
  return { id, mode: 'career', level: 1, elapsed: 10, reference: 10, ...options,
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0, ...options.summary } };
}
function climb(target) {
  const archives = [];
  while (ranked(archives).totalRr < target) {
    archives.push(career(`win-${archives.length}`, { level: ranked(archives).level, summary: { score: 100 } }));
    assert.ok(archives.length <= 100);
  }
  return archives;
}

test('ranked begins at support / 0 RR and cannot be raised by experience or settings', () => {
  const state = ranked([]);
  assert.equal(state.level, 1);
  assert.equal(state.name, 'IT-Support');
  assert.equal(state.rr, 0);
  assert.equal(state.latest, null);
  assert.equal(state.ranks.length, 6);
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
  const after = ranked([...archives, career('loss', { level: before.level, summary: { solved: false, score: 90 } })]);
  assert.equal(after.latest.rawDelta, -35);
  assert.equal(after.totalRr, before.totalRr - 35);
  assert.equal(after.level, 1);
  assert.equal(after.latest.rankDown, true);
  assert.equal(after.latest.before.level, 2);
  assert.equal(after.latest.after.level, 1);
  assert.equal(after.rr, after.totalRr);
});

test('promotion requires 100 RR and higher ranks need consistently stronger performances', () => {
  const promoted = ranked(climb(100));
  assert.equal(promoted.latest.rankUp, true);
  assert.equal(promoted.level, 2);
  assert.equal(promoted.nextRank, 3);
  const high = climb(500);
  const strong = ranked([...high, career('strong-high', { level: 6, summary: { score: 100 } })]);
  const mediocre = ranked([...high, career('mediocre-high', { level: 6, elapsed: 13, summary: { score: 85 } })]);
  assert.equal(strong.latest.rawDelta, 7);
  assert.equal(mediocre.latest.rawDelta, -16);
  assert.equal(mediocre.latest.rankDown, true);
});

test('rank ceiling, floor and per-match loss cap cannot overflow', () => {
  const ceiling = ranked(climb(MAX_TOTAL_RR));
  assert.equal(ceiling.level, 6);
  assert.equal(ceiling.rr, 100);
  assert.equal(ceiling.nextRank, null);
  assert.equal(ceiling.totalRr, MAX_TOTAL_RR);
  const maxAgain = ranked([...climb(MAX_TOTAL_RR), career('capped', { level: 6, summary: { score: 100 } })]);
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

test('rank difficulty grows by explicit exponential gain and loss factors at every rank', () => {
  const maxGains = [], losses = [], lossCaps = [];
  for (let index = 0; index < 6; index++) {
    const archives = climb(index * 100), before = ranked(archives);
    assert.equal(before.index, index);
    const win = ranked([...archives, career(`curve-win-${index}`, { level: index + 1, summary: { score: 100 } })]);
    const loss = ranked([...archives, career(`curve-loss-${index}`, { level: index + 1, summary: { solved: false, score: 0 } })]);
    maxGains.push(win.latest.rawDelta);
    losses.push(loss.latest.rawDelta);
    lossCaps.push(before.rules.maxLoss);
    assert.equal(before.rules.maxGain, Math.floor(18 / 1.18 ** index));
    assert.equal(before.rules.maxLoss, Math.round(30 * 1.25 ** index));
    assert.equal(before.rules.curve.gainDivisor, 1.18 ** index);
    assert.equal(before.rules.curve.lossMultiplier, 1.25 ** index);
    assert.equal(before.rules.perRank[index].level, index + 1);
    assert.equal(before.rules.perRank[index].maxLoss, before.rules.maxLoss);
    if (index > 0) {
      assert.ok(maxGains[index] < maxGains[index - 1]);
      assert.ok(losses[index] < losses[index - 1]);
      assert.ok(lossCaps[index] > lossCaps[index - 1]);
      assert.ok(loss.latest.reasons.some(reason => reason.label.includes('Exponentieller Rangfaktor für Abzüge')));
    }
  }
  assert.deepEqual(maxGains, [18, 15, 12, 10, 9, 7]);
  assert.deepEqual(losses, [-28, -35, -44, -55, -69, -86]);
  assert.deepEqual(lossCaps, [30, 38, 47, 59, 73, 92]);
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
