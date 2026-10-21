'use strict';

// RR is derived from saved outcomes by the host. Model prose, profile settings,
// experience points and speedrun scores never decide a competitive rank.
const RANKS = Object.freeze([
  'IT-Support', 'Fortgeschrittener IT-Support', 'Junior-Systemadministrator',
  'Systemadministrator', 'Senior-Systemadministrator', 'Infrastruktur-Experte',
]);
const RR_PER_RANK = 100;
const MAX_TOTAL_RR = RANKS.length * RR_PER_RANK;
const GAIN_CURVE_BASE = 1.18;
const LOSS_CURVE_BASE = 1.25;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function rankView(totalRr) {
  const total = clamp(Math.trunc(finite(totalRr) ? totalRr : 0), 0, MAX_TOTAL_RR);
  const index = Math.min(RANKS.length - 1, Math.floor(total / RR_PER_RANK));
  const rr = total - index * RR_PER_RANK;
  return { index, rankIndex: index, level: index + 1, name: RANKS[index], rr, totalRr: total,
    progress: rr, maxRr: RR_PER_RANK, nextRank: index < RANKS.length - 1 ? index + 2 : null,
    nextName: RANKS[index + 1] ?? null };
}

function qualityPoints(solved, score) {
  if (!solved) return -28;
  if (score >= 98) return 18;
  if (score >= 95) return 15;
  if (score >= 90) return 11;
  if (score >= 85) return 7;
  if (score >= 80) return 3;
  if (score >= 75) return 0;
  if (score >= 70) return -4;
  if (score >= 60) return -8;
  if (score >= 40) return -13;
  return -20;
}

function curveFor(index) {
  const gainDivisor = GAIN_CURVE_BASE ** index;
  const lossMultiplier = LOSS_CURVE_BASE ** index;
  return { gainDivisor, lossMultiplier, maxGain: Math.floor(18 / gainDivisor), maxLoss: Math.round(30 * lossMultiplier) };
}

function resultFor(archive, before) {
  const reasons = [];
  const add = (label, points) => { if (points !== 0) reasons.push({ label, points }); };
  // Existing saves may contain a case started before this ranked system existed.
  // Replaying its actual recorded difficulty is safe; easier cases cannot farm RR.
  if (!Number.isInteger(archive.level) || archive.level < before.level || archive.level > RANKS.length) {
    return { rawDelta: 0, training: true, reasons: [{ label: 'Training: Ticketstufe liegt unter deinem Rang oder fehlt.', points: 0 }] };
  }
  const summary = archive.summary;
  let historicalGainCap = Infinity, historicalCapLabel = '';
  add(summary.solved ? `Lösungsqualität: ${summary.score}/100` : 'Einsatz aufgegeben oder ungelöst', qualityPoints(summary.solved, summary.score));
  const timed = finite(archive.elapsed) && archive.elapsed >= 0 && finite(archive.reference) && archive.reference > 0;
  if (timed) {
    const ratio = archive.elapsed / archive.reference;
    const penalty = ratio > 3 ? 22 : ratio > 2 ? 16 : ratio > 1.5 ? 10 : ratio > 1.25 ? 6 : ratio > 1 ? 3 : 0;
    add('Aktive Arbeitszeit über der vorab festgelegten Referenz', -penalty);
  } else {
    // Historical saves lacking timing cannot claim top gains on unproven speed.
    historicalGainCap = 7;
    historicalCapLabel = 'Historischer Zeitnachweis fehlt: Basisgewinn auf 7 RR begrenzt';
  }
  const unnecessary = finite(summary.unnecessaryChecks) ? Math.max(0, Math.floor(summary.unnecessaryChecks)) : null;
  const wrong = finite(summary.wrongChanges) ? Math.max(0, Math.floor(summary.wrongChanges)) : null;
  if (unnecessary !== null) add(`${unnecessary} unnötige Prüfungen`, -Math.min(12, unnecessary * 2));
  if (wrong !== null) add(`${wrong} Fehländerungen und Betriebsrisiken`, -Math.min(20, wrong * 5));
  if (unnecessary === null || wrong === null) {
    historicalGainCap = 3;
    historicalCapLabel = 'Historischer Qualitätsnachweis unvollständig: Basisgewinn maximal 3 RR';
  }
  const curve = curveFor(before.index);
  const originalGains = reasons.filter(reason => reason.points > 0).reduce((sum, reason) => sum + reason.points, 0);
  const losses = -reasons.filter(reason => reason.points < 0).reduce((sum, reason) => sum + reason.points, 0);
  const gains = Math.min(originalGains, historicalGainCap);
  if (gains !== originalGains) add(historicalCapLabel, gains - originalGains);
  const scaledGains = Math.floor(gains / curve.gainDivisor);
  const scaledLosses = Math.ceil(losses * curve.lossMultiplier);
  const format = value => value.toFixed(2).replace('.', ',');
  add(`Exponentieller Rangfaktor für Gewinne ÷${format(curve.gainDivisor)}`, scaledGains - gains);
  add(`Exponentieller Rangfaktor für Abzüge ×${format(curve.lossMultiplier)}`, losses - scaledLosses);
  const calculated = scaledGains - scaledLosses;
  const rawDelta = clamp(calculated, -curve.maxLoss, curve.maxGain);
  if (calculated !== rawDelta) add('Begrenzung pro Einsatz', rawDelta - calculated);
  if (!reasons.length) reasons.push({ label: 'Leistung hält den aktuellen Stand', points: 0 });
  return { rawDelta, training: false, reasons };
}

function ranked(archives) {
  let totalRr = 0, latest = null, games = 0;
  const seen = new Set();
  for (const archive of Array.isArray(archives) ? archives : []) {
    if (!archive || typeof archive !== 'object' || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    if (archive.mode !== 'career' || typeof archive.summary?.solved !== 'boolean' ||
      !finite(archive.summary.score) || archive.summary.score < 0 || archive.summary.score > 100) continue;
    const before = rankView(totalRr);
    const result = resultFor(archive, before);
    totalRr = clamp(totalRr + result.rawDelta, 0, MAX_TOTAL_RR);
    const after = rankView(totalRr), delta = totalRr - before.totalRr;
    const reasons = [...result.reasons];
    if (delta !== result.rawDelta) reasons.push({ label: totalRr === 0 ? 'Untergrenze des ersten Rangs' : 'Obergrenze des Maximalrangs', points: delta - result.rawDelta });
    if (!result.training) games++;
    latest = { id: archive.id, delta, rawDelta: result.rawDelta, before, after, reasons,
      rankUp: after.index > before.index, rankDown: after.index < before.index, training: result.training };
  }
  const view = rankView(totalRr), curve = curveFor(view.index);
  return { ...view, games, latest, ranks: RANKS.map((name, index) => ({ name, index, level: index + 1 })),
    rules: { maxGain: curve.maxGain, maxLoss: curve.maxLoss, rrPerRank: RR_PER_RANK,
      curve: { gainBase: GAIN_CURVE_BASE, lossBase: LOSS_CURVE_BASE, gainDivisor: curve.gainDivisor, lossMultiplier: curve.lossMultiplier },
      perRank: RANKS.map((name, index) => ({ level: index + 1, name, ...curveFor(index) })),
      description: 'Nur Karrierefälle auf deiner Rangstufe oder darüber zählen. Positive Beiträge werden pro Rang durch 1,18 geteilt; Zeit-, Qualitäts- und Fehlerabzüge werden pro Rang mit 1,25 multipliziert. Die Schwierigkeit wächst exponentiell.' } };
}

module.exports = { ranked, rankView, RANKS, RR_PER_RANK, MAX_TOTAL_RR };
