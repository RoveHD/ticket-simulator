'use strict';

const { expansion } = require('./challenges');
const { ranked } = require('./ranked');
const { validCompanionReward } = require('./characters');
const { archiveAbilityReward } = require('./abilities');

const THRESHOLDS = [0, 300, 800, 1600, 3000, 5000];
const RANKS = ['Neustart', 'Einsatzbereit', 'Problemlöser', 'Teamstütze', 'Betriebsprofi', 'Leitstelle'];
const MISSION_DEFS = [
  { id: 'first-fix', title: 'Erster Erfolg', description: 'Löse deinen ersten Karrierefall.', target: 1, reward: 100, count: s => s.careerSolved },
  { id: 'clean-work', title: 'Saubere Arbeit', description: 'Löse drei Karrierefälle ohne Fehländerungen oder unnötige Checks.', target: 3, reward: 200, count: s => s.cleanSolved },
  { id: 'reliable', title: 'Zuverlässig im Einsatz', description: 'Löse fünf Karrierefälle.', target: 5, reward: 300, count: s => s.careerSolved },
  { id: 'shift', title: 'Schicht geschafft', description: 'Löse mindestens ein Ticket in einem Speedrun.', target: 1, reward: 150, count: s => s.speedrunSolved ? 1 : 0 },
];

function number(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
}

function rankAt(xp) {
  let index = 0;
  for (let i = 1; i < THRESHOLDS.length; i++) if (xp >= THRESHOLDS[i]) index = i;
  return { name: RANKS[index], index, start: THRESHOLDS[index], next: THRESHOLDS[index + 1] ?? null,
    nextName: RANKS[index + 1] ?? null,
    progress: index === RANKS.length - 1 ? 100 : Math.min(100, Math.floor((xp - THRESHOLDS[index]) * 100 / (THRESHOLDS[index + 1] - THRESHOLDS[index]))) };
}

function summarize(archives) {
  const seen = new Set();
  const entries = [];
  for (const archive of Array.isArray(archives) ? archives : []) {
    if (!archive || typeof archive !== 'object' || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    if (archive.mode !== 'career' && archive.mode !== 'speedrun') continue;
    const summary = archive.summary && typeof archive.summary === 'object' ? archive.summary : {};
    const solved = archive.mode === 'career' ? summary.solved === true : number(summary.solvedCount) > 0;
    const score = number(summary.score, 0, archive.mode === 'career' ? 100 : Number.MAX_SAFE_INTEGER);
    const wrongChanges = number(summary.wrongChanges);
    const unnecessaryChecks = number(summary.unnecessaryChecks);
    const solvedCount = archive.mode === 'career' ? (solved ? 1 : 0) : number(summary.solvedCount);
    let baseXp = 0;
    if (archive.mode === 'career' && solved) baseXp = 100 + 2 * score + (wrongChanges === 0 && unnecessaryChecks === 0 ? 25 : 0);
    if (archive.mode === 'speedrun') baseXp = 100 * solvedCount;
    const abilityXp = validCompanionReward(archive.companionReward) ? archiveAbilityReward(archive).xp : 0;
    entries.push({ archive, mode: archive.mode, solved, score, solvedCount, wrongChanges, unnecessaryChecks, baseXp, abilityXp });
  }
  return entries;
}

function progression(archives, now = new Date(), options = {}) {
  const entries = summarize(archives);
  const stateFor = list => {
    const careers = list.filter(e => e.mode === 'career');
    const careerSolved = careers.filter(e => e.solved).length;
    const cleanSolved = careers.filter(e => e.solved && e.wrongChanges === 0 && e.unnecessaryChecks === 0).length;
    const speedrunSolved = list.some(e => e.mode === 'speedrun' && e.solved);
    let streak = 0;
    for (const e of careers) { if (e.solved) streak++; else streak = 0; }
    const scores = careers.filter(e => e.solved).map(e => e.score);
    const unlocked = MISSION_DEFS.filter(m => m.count({ careerSolved, cleanSolved, speedrunSolved }) >= m.target);
    return { careerSolved, cleanSolved, speedrunSolved, streak, bestScore: scores.length ? Math.max(...scores) : 0, unlocked };
  };
  const state = stateFor(entries);
  const missionXp = state.unlocked.reduce((sum, m) => sum + m.reward, 0);
  const baseXp = entries.reduce((sum, e) => sum + e.baseXp + e.abilityXp, 0);
  const xp = baseXp + missionXp;
  const rank = rankAt(xp);
  const missions = MISSION_DEFS.map(m => {
    const current = m.count(state);
    return { id: m.id, title: m.title, description: m.description, current: Math.min(m.target, current), target: m.target, reward: m.reward, unlocked: current >= m.target };
  });
  const expanded = expansion(entries, now, options);
  let latest = null;
  if (entries.length) {
    const current = entries[entries.length - 1];
    const previous = entries.slice(0, -1);
    const before = stateFor(previous);
    const beforeXp = previous.reduce((sum, e) => sum + e.baseXp + e.abilityXp, 0) + before.unlocked.reduce((sum, m) => sum + m.reward, 0);
    const newlyUnlocked = state.unlocked.filter(m => !before.unlocked.some(old => old.id === m.id));
    const bonusXp = newlyUnlocked.reduce((sum, m) => sum + m.reward, 0);
    const latestXp = current.baseXp + bonusXp + current.abilityXp;
    latest = { id: current.archive.id, mode: current.mode, solved: current.solved, score: current.score, xp: latestXp,
      baseXp: current.baseXp, bonusXp, abilityXp: current.abilityXp, unlocked: newlyUnlocked.map(({ id, title, reward }) => ({ id, title, reward })),
      rankUp: rankAt(beforeXp).index < rank.index, rankName: rank.name };
    const previousExpanded = expansion(previous, now, options);
    latest.passXp = expanded.battlepass.xp - previousExpanded.battlepass.xp;
    latest.masteryGains = expanded.masteries.flatMap((mastery, index) => {
      const beforeMastery = previousExpanded.masteries[index];
      return mastery.xp > beforeMastery.xp ? [{ id: mastery.id, name: mastery.name, solved: mastery.solved - beforeMastery.solved,
        xp: mastery.xp - beforeMastery.xp, levelUp: mastery.level > beforeMastery.level, lordUnlocked: mastery.lordUnlocked && !beforeMastery.lordUnlocked,
        prestige: mastery.prestige, silverUnlocked: mastery.silverUnlocked && !beforeMastery.silverUnlocked,
        goldUnlocked: mastery.goldUnlocked && !beforeMastery.goldUnlocked,
        eternalUnlocked: mastery.eternalUnlocked && !beforeMastery.eternalUnlocked,
        astralUnlocked: mastery.astralUnlocked && !beforeMastery.astralUnlocked }] : [];
    });
    latest.companionMasteryGains = Object.entries(expanded.companionMasteries).flatMap(([characterId, masteries]) =>
      masteries.flatMap((mastery, index) => {
        if (!validCompanionReward(current.archive.companionReward) || current.archive.companionReward.characterId !== characterId) return [];
        const beforeMastery = previousExpanded.companionMasteries[characterId]?.[index];
        // A newly visible secret companion still needs attributable solved cases.
        if (mastery.xp <= (beforeMastery?.xp || 0)) return [];
        return [{ characterId, characterName: expanded.characters.find(character => character.id === characterId).name,
          id: mastery.id, name: mastery.name, solved: mastery.solved - (beforeMastery?.solved || 0),
          hardSolved: mastery.hardSolved - (beforeMastery?.hardSolved || 0), xp: mastery.xp - (beforeMastery?.xp || 0),
          levelUp: mastery.level > (beforeMastery?.level || 1), prestige: mastery.prestige,
          ...Object.fromEntries(['lord', 'silver', 'gold', 'eternal', 'astral'].map(tier =>
            [`${tier}Unlocked`, mastery[`${tier}Unlocked`] && !beforeMastery?.[`${tier}Unlocked`]])) }];
      }));
    latest.companionFormGains = Object.entries(expanded.companionForms).flatMap(([characterId, form]) => {
      if (!validCompanionReward(current.archive.companionReward) || current.archive.companionReward.characterId !== characterId) return [];
      const before = previousExpanded.companionForms[characterId];
      if (form.xp <= (before?.xp || 0)) return [];
      return [{ characterId, characterName: expanded.characters.find(character => character.id === characterId).name,
        solved: form.solved - (before?.solved || 0), hardSolved: form.hardSolved - (before?.hardSolved || 0),
        xp: form.xp - (before?.xp || 0), levelUp: form.level > (before?.level || 1), prestige: form.prestige,
        ...Object.fromEntries(['lord', 'silver', 'gold', 'eternal', 'astral'].map(tier =>
          [`${tier}Unlocked`, form[`${tier}Unlocked`] && !before?.[`${tier}Unlocked`]])) }];
    });
    const ownedBefore = new Set(previousExpanded.inventory.map(reward => reward.id));
    latest.newRewards = expanded.inventory.filter(reward => !ownedBefore.has(reward.id));
  }
  return { xp, rank, solved: state.careerSolved + entries.filter(e => e.mode === 'speedrun').reduce((sum, e) => sum + e.solvedCount, 0),
    streak: state.streak, bestScore: state.bestScore, missions, latest, ...expanded, ranked: ranked(archives) };
}

module.exports = { progression };
