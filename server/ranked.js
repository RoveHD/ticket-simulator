'use strict';

// RR is derived from saved outcomes by the host. Model prose, profile settings,
// experience points and speedrun scores never decide a competitive rank.
const RANKS = Object.freeze([
  'IT-Support', 'Fortgeschrittener IT-Support', 'Junior-Systemadministrator',
  'Systemadministrator', 'Senior-Systemadministrator', 'Infrastruktur-Experte',
]);
const RR_PER_RANK = 100;
const DIVISIONS_PER_RANK = 3;
const MAX_TOTAL_RR = RANKS.length * DIVISIONS_PER_RANK * RR_PER_RANK;
const LEGACY_MAX_TOTAL_RR = RANKS.length * RR_PER_RANK;
const GAIN_CURVE_BASE = 1.18;
const LOSS_CURVE_BASE = 1.25;
const RANKED_RULES_VERSION = 3;
const ENTRY_BONUSES = [15, 12, 8];
const ENTRY_LOSS_MULTIPLIERS = [.4, .65, 1];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function rankView(totalRr) {
  const total = clamp(Math.trunc(finite(totalRr) ? totalRr : 0), 0, MAX_TOTAL_RR);
  const index = Math.min(RANKS.length * DIVISIONS_PER_RANK - 1, Math.floor(total / RR_PER_RANK));
  const tierIndex = Math.floor(index / DIVISIONS_PER_RANK);
  const division = index % DIVISIONS_PER_RANK + 1;
  const rr = total - index * RR_PER_RANK;
  const nextIndex = index + 1;
  const hasNext = nextIndex < RANKS.length * DIVISIONS_PER_RANK;
  return { index, rankIndex: index, tierIndex, division, level: tierIndex + 1,
    baseName: RANKS[tierIndex], name: `${RANKS[tierIndex]} ${division}`, rr, totalRr: total,
    progress: rr, maxRr: RR_PER_RANK, nextRank: hasNext ? nextIndex + 1 : null,
    nextName: hasNext ? `${RANKS[Math.floor(nextIndex / DIVISIONS_PER_RANK)]} ${nextIndex % DIVISIONS_PER_RANK + 1}` : null };
}

function legacyRankView(totalRr) {
  const index = Math.min(RANKS.length - 1, Math.floor(totalRr / RR_PER_RANK));
  return { index, tierIndex: index, level: index + 1, totalRr };
}

function migrateLegacyTotal(totalRr) {
  if (totalRr === LEGACY_MAX_TOTAL_RR) return MAX_TOTAL_RR;
  const tierIndex = Math.floor(totalRr / RR_PER_RANK);
  return tierIndex * DIVISIONS_PER_RANK * RR_PER_RANK + totalRr % RR_PER_RANK;
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

function curveFor(index, version = RANKED_RULES_VERSION) {
  const gainDivisor = GAIN_CURVE_BASE ** index;
  const entryBonus = version >= 2 ? ENTRY_BONUSES[index] || 0 : 0;
  const lossMultiplier = version >= 2 && index < ENTRY_LOSS_MULTIPLIERS.length
    ? ENTRY_LOSS_MULTIPLIERS[index] : LOSS_CURVE_BASE ** index;
  return { gainDivisor, lossMultiplier, entryBonus, maxGain: Math.floor((18 + entryBonus) / gainDivisor), maxLoss: Math.round(30 * lossMultiplier) };
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
  // Archives without a rule version retain the original RR calculation. Never
  // replay completed results under new balancing and change an existing rank.
  const version = archive.rankedRulesVersion === RANKED_RULES_VERSION ? RANKED_RULES_VERSION : archive.rankedRulesVersion === 2 ? 2 : 1;
  const curve = curveFor(before.tierIndex, version);
  let historicalGainCap = Infinity, historicalCapLabel = '';
  add(summary.solved ? `Lösungsqualität: ${summary.score}/100` : 'Einsatz aufgegeben oder ungelöst', qualityPoints(summary.solved, summary.score));
  if (summary.solved && summary.score >= 70 && curve.entryBonus) add(`Einstiegsbonus auf Rang ${before.level} ab 70 Punkten`, curve.entryBonus);
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
  const originalGains = reasons.filter(reason => reason.points > 0).reduce((sum, reason) => sum + reason.points, 0);
  const losses = -reasons.filter(reason => reason.points < 0).reduce((sum, reason) => sum + reason.points, 0);
  const gains = Math.min(originalGains, historicalGainCap);
  if (gains !== originalGains) add(historicalCapLabel, gains - originalGains);
  const scaledGains = Math.floor(gains / curve.gainDivisor);
  const scaledLosses = Math.ceil(losses * curve.lossMultiplier);
  const format = value => value.toFixed(2).replace('.', ',');
  add(`Exponentieller Rangfaktor für Gewinne ÷${format(curve.gainDivisor)}`, scaledGains - gains);
  add(`${curve.entryBonus ? 'Reduzierte Abzüge im Einstieg' : 'Exponentieller Rangfaktor für Abzüge'} ×${format(curve.lossMultiplier)}`, losses - scaledLosses);
  const calculated = scaledGains - scaledLosses;
  const rawDelta = clamp(calculated, -curve.maxLoss, curve.maxGain);
  if (calculated !== rawDelta) add('Begrenzung pro Einsatz', rawDelta - calculated);
  if (!reasons.length) reasons.push({ label: 'Leistung hält den aktuellen Stand', points: 0 });
  return { rawDelta, training: false, reasons };
}

function ranked(archives) {
  let totalRr = 0, latest = null, games = 0;
  let legacy = true;
  const seen = new Set();
  for (const archive of Array.isArray(archives) ? archives : []) {
    if (!archive || typeof archive !== 'object' || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    if (archive.mode !== 'career' || typeof archive.summary?.solved !== 'boolean' ||
      !finite(archive.summary.score) || archive.summary.score < 0 || archive.summary.score > 100) continue;
    // Replay historical outcomes with their original six-rank boundaries, then
    // transfer the earned main rank and its local RR once, before the first v3
    // outcome. Reopening a save repeats this pure replay, never the transfer.
    if (legacy && archive.rankedRulesVersion === RANKED_RULES_VERSION) {
      totalRr = migrateLegacyTotal(totalRr);
      legacy = false;
    }
    const before = legacy ? legacyRankView(totalRr) : rankView(totalRr);
    const result = resultFor(archive, before);
    totalRr = clamp(totalRr + result.rawDelta, 0, legacy ? LEGACY_MAX_TOTAL_RR : MAX_TOTAL_RR);
    const after = legacy ? legacyRankView(totalRr) : rankView(totalRr), delta = totalRr - before.totalRr;
    const reasons = [...result.reasons];
    if (delta !== result.rawDelta) reasons.push({ label: totalRr === 0 ? 'Untergrenze des ersten Rangs' : 'Obergrenze des Maximalrangs', points: delta - result.rawDelta });
    if (!result.training) games++;
    latest = { id: archive.id, delta, rawDelta: result.rawDelta, before, after, reasons,
      rankUp: after.index > before.index, rankDown: after.index < before.index, training: result.training };
  }
  if (legacy) {
    totalRr = migrateLegacyTotal(totalRr);
    if (latest) {
      const before = rankView(migrateLegacyTotal(latest.before.totalRr));
      const after = rankView(migrateLegacyTotal(latest.after.totalRr));
      const delta = after.totalRr - before.totalRr;
      const migrationAdjustment = delta - latest.delta;
      latest = { ...latest, before, after, delta, migrationAdjustment,
        reasons: [...latest.reasons, ...(migrationAdjustment ? [{ label: 'Übernahme bereits erreichter Ränge in drei Rangstufen', points: migrationAdjustment }] : [])],
        rankUp: after.index > before.index, rankDown: after.index < before.index };
    }
  }
  const view = rankView(totalRr), curve = curveFor(view.tierIndex);
  const ranks = Array.from({ length: RANKS.length * DIVISIONS_PER_RANK }, (_, index) => {
    const { name, baseName, tierIndex, level, division } = rankView(index * RR_PER_RANK);
    return { name, baseName, index, tierIndex, level, division };
  });
  return { ...view, games, latest, ranks,
    rules: { version: RANKED_RULES_VERSION, maxGain: curve.maxGain, maxLoss: curve.maxLoss, rrPerRank: RR_PER_RANK,
      divisionsPerRank: DIVISIONS_PER_RANK,
      curve: { gainBase: GAIN_CURVE_BASE, lossBase: LOSS_CURVE_BASE, gainDivisor: curve.gainDivisor, lossMultiplier: curve.lossMultiplier },
      perRank: RANKS.map((name, index) => ({ level: index + 1, name, ...curveFor(index) })),
      description: 'Jeder der sechs Einsatzränge hat drei Stufen. Je 100 RR führen zur nächsten Stufe; nach Stufe 3 folgt der nächste Einsatzrang. Nur Karrierefälle auf deiner Rangstufe oder darüber zählen. Gewinne und Abzüge richten sich nach dem Einsatzrang, nicht nach der Unterstufe. Bereits erreichte Einsatzränge und ihre Rangpunkte bleiben erhalten.' } };
}

module.exports = { ranked, rankView, RANKS, RR_PER_RANK, DIVISIONS_PER_RANK, MAX_TOTAL_RR, RANKED_RULES_VERSION };
