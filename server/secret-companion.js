'use strict';

const STARTER_IDS = ['snake', 'wolf', 'dragon'];
const DOMAIN_IDS = ['dns', 'dhcp', 'backup', 'identity', 'network', 'security', 'cloud', 'virtualization', 'storage', 'endpoint', 'monitoring'];
const { SWITCH_XP } = require('./companion-levels');
const { SCENARIOS } = require('./difficulty');
const SCENARIO_IDS = new Set(SCENARIOS.map(scenario => scenario.id));

function uniqueArchives(archives) {
  const seen = new Set();
  return (Array.isArray(archives) ? archives : []).filter(archive => {
    if (!archive || typeof archive !== 'object' || archive.id == null || seen.has(String(archive.id))) return false;
    seen.add(String(archive.id));
    return true;
  });
}

function starterCompanionsMaxed(archives, offsets) {
  const totals = Object.fromEntries(STARTER_IDS.map(id => [id, 0]));
  for (const archive of archives) {
    if (!['career', 'speedrun'].includes(archive.mode)) continue;
    const reward = archive.companionReward;
    if (!reward || reward.version !== 1 || !STARTER_IDS.includes(reward.characterId) ||
      !Number.isInteger(reward.xp) || reward.xp < 0 || reward.xp > 18000) continue;
    totals[reward.characterId] = Math.min(SWITCH_XP, totals[reward.characterId] + reward.xp);
  }
  return STARTER_IDS.every(id => totals[id] + (Number.isSafeInteger(offsets?.[id]) && offsets[id] >= 0 ? offsets[id] : 0) >= SWITCH_XP);
}

function qualifiedCareer(archive) {
  const summary = archive.summary;
  return archive.mode === 'career' && Number.isInteger(archive.level) && archive.level >= 4 && archive.level <= 6 &&
    summary?.solved === true && typeof summary.score === 'number' && Number.isFinite(summary.score) && summary.score >= 95 && summary.score <= 100 &&
    summary.wrongChanges === 0 && summary.unnecessaryChecks === 0 &&
    typeof archive.elapsed === 'number' && Number.isFinite(archive.elapsed) && archive.elapsed >= 0 &&
    typeof archive.reference === 'number' && Number.isFinite(archive.reference) && archive.reference > 0 && archive.elapsed <= archive.reference;
}

function hasCareerStreak(archives) {
  let streak = 0;
  for (const archive of archives) {
    if (archive.mode !== 'career') continue;
    if (qualifiedCareer(archive)) {
      if (++streak === 9) return true;
    } else streak = 0;
  }
  return false;
}

function hasCompleteSpeedrun(archives) {
  return archives.some(archive => {
    if (archive.mode !== 'speedrun' || archive.level !== 6 ||
      typeof archive.duration !== 'number' || !Number.isFinite(archive.duration) || archive.duration < 60 ||
      typeof archive.summary?.arrived !== 'number' || !Number.isInteger(archive.summary.arrived) || archive.summary.arrived < 6 ||
      archive.summary.solvedCount !== archive.summary.arrived || archive.summary.wrongChanges !== 0 || archive.summary.unnecessaryChecks !== 0) return false;
    const seen = new Set();
    const completed = (Array.isArray(archive.completedTickets) ? archive.completedTickets : []).filter(ticket => {
      if (!ticket || ticket.number == null || seen.has(String(ticket.number)) || !SCENARIO_IDS.has(ticket.scenarioId)) return false;
      seen.add(String(ticket.number));
      return true;
    });
    return completed.length >= 6 && completed.length === archive.summary.arrived;
  });
}

function chimeraUnlocked(archives, masteries, offsets = {}) {
  const unique = uniqueArchives(archives);
  const lords = new Set((Array.isArray(masteries) ? masteries : []).filter(item => item?.lordUnlocked === true).map(item => item.id));
  return starterCompanionsMaxed(unique, offsets) && DOMAIN_IDS.every(id => lords.has(id)) && hasCareerStreak(unique) && hasCompleteSpeedrun(unique);
}

function hiddenCharacter(character) {
  return { id: character.id, secret: true, name: '???', unlocked: false, unlockLevel: null,
    baseImage: null, lordImage: null, rarity: character.rarity, affinityIds: [], affinities: [] };
}

module.exports = { chimeraUnlocked, hiddenCharacter };
