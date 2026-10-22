'use strict';

const MODES = new Set(['career', 'speedrun']);
const DURATIONS = new Set([60, 120, 240]);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
function leaderboard(archives, options = {}) {
  if (!plain(options) || Object.keys(options).some(key => !['mode', 'duration', 'limit', 'offset', 'from', 'to'].includes(key))) invalid('Ungültiger Leaderboard-Filter.');
  const mode = options.mode ?? 'career', duration = mode === 'speedrun' ? options.duration ?? 60 : null;
  const limit = options.limit ?? 50, offset = options.offset ?? 0;
  if (!MODES.has(mode) || (mode === 'career' && options.duration !== undefined && options.duration !== null) ||
      (mode === 'speedrun' && !DURATIONS.has(duration)) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0) invalid('Ungültiger Leaderboard-Filter.');
  const boundary = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) invalid('Ungültiger Leaderboard-Zeitraum.');
    return Date.parse(value);
  };
  const from = boundary(options.from, -Infinity), to = boundary(options.to, Infinity);
  if (from > to) invalid('Ungültiger Leaderboard-Zeitraum.');
  const seen = new Set(), records = [];
  for (const archive of Array.isArray(archives) ? archives : []) {
    if (!plain(archive) || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    const summary = archive.summary;
    if (archive.mode !== mode || (mode === 'speedrun' && archive.duration !== duration) || !plain(summary) ||
        !Number.isSafeInteger(summary.score) || summary.score < 0 || (mode === 'career' && summary.score > 100) ||
        !finiteNonnegative(archive.elapsed) || !Number.isInteger(archive.level) || archive.level < 1 || archive.level > 6) continue;
    if (mode === 'career' ? typeof summary.solved !== 'boolean' : !Number.isSafeInteger(summary.solvedCount) || summary.solvedCount < 0) continue;
    const waiting = archive.waiting ?? 0;
    if (!finiteNonnegative(waiting) || !Number.isFinite(archive.elapsed + waiting)) continue;
    const timestamp = typeof archive.completedAt === 'string' ? Date.parse(archive.completedAt) : NaN;
    if ((Number.isFinite(from) || Number.isFinite(to)) && (!Number.isFinite(timestamp) || timestamp < from || timestamp > to)) continue;
    const referenceRatio = finiteNonnegative(archive.reference) && archive.reference > 0 ? archive.elapsed / archive.reference : null;
    records.push({ id: String(archive.id), title: typeof archive.title === 'string' && archive.title.trim() ? archive.title.slice(0, 500) : mode === 'career' ? 'Karrierefall' : `${duration}-Minuten-Schicht`,
      mode, duration, score: summary.score, minutes: archive.elapsed + waiting, activeMinutes: archive.elapsed,
      level: archive.level, completedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      solved: mode === 'career' ? summary.solved : summary.solvedCount,
      referenceRatio: referenceRatio !== null && Number.isFinite(referenceRatio) ? referenceRatio : null });
  }
  // Scores define the place. Time orders equal scores for easy comparison but
  // never gives one equally scoring record a worse rank (1, 1, 3).
  records.sort((a, b) => b.score - a.score || a.minutes - b.minutes ||
    (a.completedAt || '\uffff').localeCompare(b.completedAt || '\uffff') || a.id.localeCompare(b.id));
  let rank = 0, previousScore = null;
  const entries = records.map((record, index) => {
    if (record.score !== previousScore) rank = index + 1;
    previousScore = record.score;
    return { ...record, rank };
  }).slice(offset, offset + limit);
  return { scope: 'local', mode, duration, total: records.length, offset, limit, entries,
    ranking: 'Punktzahl absteigend; gleiche Punktzahl teilt denselben Platz. Bei Gleichstand wird die kürzere Zeit zuerst angezeigt.' };
}

module.exports = { leaderboard };
