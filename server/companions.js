'use strict';

const { CHARACTERS, validCompanionReward } = require('./characters');
const { DOMAINS, topicsFor } = require('./challenges');
const { hiddenCharacter } = require('./secret-companion');
const { SWITCH_LEVEL, SWITCH_XP, MAX_XP, xpAtLevel, levelAt } = require('./companion-levels');
const { abilityView, archiveAbilityReward } = require('./abilities');
const { arcaneBonusTotals } = require('./arcane-grants');

const MAX_LEVEL = null;
const BASE_XP = 100;
const BONUS_PERCENT = 50;
const AFFINITIES = {
  snake: ['dns', 'identity', 'cloud', 'endpoint', 'hardware-advice'],
  wolf: ['dhcp', 'network', 'virtualization', 'monitoring', 'linux'],
  dragon: ['backup', 'security', 'storage', 'hardware'],
  'snake-coral': ['dns', 'identity', 'cloud', 'endpoint', 'hardware-advice'],
  fox: ['identity', 'cloud', 'endpoint', 'hardware-advice'],
  'wolf-night': ['dhcp', 'network', 'virtualization', 'monitoring', 'linux'],
  raven: ['security', 'monitoring', 'linux'],
  'dragon-frost': ['backup', 'security', 'storage', 'hardware'],
  chimera: DOMAINS.map(domain => domain.id),
};
const characterById = id => CHARACTERS.find(character => character.id === id);

function chosenCharacter(state, inventory) {
  if (state.companionChosen === false) return null;
  const portrait = inventory.find(item => item.kind === 'portrait' && item.id === state.cosmetics?.portrait);
  return portrait && characterById(portrait.character) ? portrait.character : null;
}

function earnedXp(archives, offsets = {}, arcane) {
  const totals = Object.fromEntries(CHARACTERS.map(character => [character.id, 0]));
  const seen = new Set();
  for (const archive of archives || []) {
    if (!archive || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    const reward = archive.companionReward;
    if (!['career', 'speedrun'].includes(archive.mode) || !validCompanionReward(reward)) continue;
    totals[reward.characterId] = Math.min(MAX_XP, totals[reward.characterId] + reward.xp);
  }
  for (const character of CHARACTERS) {
    const offset = offsets?.[character.id];
    if (Number.isSafeInteger(offset) && offset >= 0) totals[character.id] = Math.min(MAX_XP, totals[character.id] + offset);
  }
  for (const [id, xp] of Object.entries(arcaneBonusTotals(arcane).companionXp)) totals[id] = Math.min(MAX_XP, totals[id] + xp);
  return totals;
}

function legacyLevelOffsets(archives) {
  return Object.fromEntries(Object.entries(earnedXp(archives)).flatMap(([id, xp]) => {
    const oldLevel = Math.min(20, 1 + Math.floor(xp / 300));
    const progress = oldLevel < 20 ? (xp % 300) / 300 : 0;
    const preservedXp = Math.floor(xpAtLevel(oldLevel) + progress * (xpAtLevel(oldLevel + 1) - xpAtLevel(oldLevel)));
    return preservedXp > xp ? [[id, preservedXp - xp]] : [];
  }));
}

function companionState(state, game) {
  const activeId = chosenCharacter(state, game.inventory);
  const totals = earnedXp(state.archives, state.companionXpOffsets, state.arcane);
  const visibleCharacters = (Array.isArray(game.characters) ? game.characters : CHARACTERS)
    .map(character => character.secret && !character.unlocked ? hiddenCharacter(character) : character);
  const characters = visibleCharacters.map(character => {
    if (character.secret && !character.unlocked) return { ...character, xp: 0, level: 1, maxLevel: MAX_LEVEL,
      switchLevel: SWITCH_LEVEL, switchUnlocked: false,
      progress: 0, levelStartXp: 0, nextXp: xpAtLevel(2), remainingXp: xpAtLevel(2), maxed: false };
    const xp = totals[character.id];
    const level = levelAt(xp);
    const levelStartXp = xpAtLevel(level), nextXp = xpAtLevel(level + 1);
    const unlocked = game.inventory.some(item => item.kind === 'portrait' && item.id === `portrait-${character.id}-base`);
    return { ...character, xp, level, maxLevel: MAX_LEVEL,
      ability: abilityView(state, character.id, { selected: character.id === activeId, unlocked }),
      switchLevel: SWITCH_LEVEL, switchUnlocked: level >= SWITCH_LEVEL,
      progress: Math.floor((xp - levelStartXp) / (nextXp - levelStartXp) * 100),
      levelStartXp, nextXp, remainingXp: nextXp - xp, maxed: false,
      unlocked,
      affinityIds: [...(AFFINITIES[character.id] || [])],
      affinities: (AFFINITIES[character.id] || []).map(id => DOMAINS.find(domain => domain.id === id)?.name).filter(Boolean) };
  });
  const current = characters.find(character => character.id === activeId) || null;
  const activeSession = state.session?.current.status === 'active';
  const canSwitch = !current || current.switchUnlocked && !activeSession;
  const switchReason = !current ? 'Wähle deinen ersten Begleiter.' : activeSession
    ? 'Beende zuerst deinen laufenden Einsatz.' : current.switchUnlocked
      ? 'Wechsel freigeschaltet. Du kannst einen anderen freigeschalteten Begleiter wählen.'
      : `Erreiche mit ${current.name} Stufe ${SWITCH_LEVEL}, um den Begleiter zu wechseln.`;
  const latestArchive = state.archives?.at(-1);
  const latestReward = latestArchive?.companionReward;
  return { activeId, current, characters, ability: current?.ability || null, maxLevel: MAX_LEVEL, switchLevel: SWITCH_LEVEL, bonusPercent: BONUS_PERCENT,
    baseXpPerSolved: BASE_XP, canSwitch, switchReason,
    latestReward: latestReward?.characterId === 'chimera' && !visibleCharacters.some(item => item.id === 'chimera' && item.unlocked)
      ? null : latestReward || null };
}

function rewardForArchive(archive, characterId, archives = [], offsets = {}, arcane) {
  const character = characterById(characterId);
  if (!character || !['career', 'speedrun'].includes(archive.mode)) return null;
  const solvedCount = archive.mode === 'career' ? (archive.summary?.solved === true ? 1 : 0)
    : Math.max(0, Math.min(120, Math.floor(Number(archive.summary?.solvedCount) || 0)));
  const seen = new Set();
  const completedTickets = (archive.completedTickets || []).filter(ticket => {
    if (!ticket || ticket.number == null || seen.has(String(ticket.number))) return false;
    seen.add(String(ticket.number)); return true;
  }).slice(0, solvedCount);
  const solved = completedTickets.length;
  const topics = topicsFor({ archive: { ...archive, completedTickets }, solved: solved > 0, solvedCount: solved, mode: archive.mode });
  const affinities = AFFINITIES[characterId] || [];
  const bonusCount = topics.filter(topic => topic.domains.some(id => affinities.includes(id))).length;
  const domains = [...new Set(topics.flatMap(topic => topic.domains.filter(id => affinities.includes(id))))];
  const baseXp = solved * BASE_XP;
  const bonusXp = bonusCount * BASE_XP * BONUS_PERCENT / 100;
  // Preserve the established archive limit, including any active ability bonus.
  const abilityXp = Math.min(Math.max(0, 18000 - baseXp - bonusXp), archiveAbilityReward(archive, characterId).companionXp);
  const xp = baseXp + bonusXp + abilityXp;
  const before = earnedXp(archives, offsets, arcane)[characterId];
  const after = Math.min(MAX_XP, before + xp);
  return { version: 1, characterId, character: characterId, characterName: character.name,
    solvedCount: solved, bonusCount, baseXp, bonusXp, abilityXp, xp, appliedXp: after - before,
    levelBefore: levelAt(before), levelAfter: levelAt(after), maxed: false,
    domains: domains.map(id => DOMAINS.find(domain => domain.id === id)?.name).filter(Boolean) };
}

module.exports = { MAX_LEVEL, MAX_XP, SWITCH_LEVEL, SWITCH_XP, BASE_XP, BONUS_PERCENT, companionState, chosenCharacter, earnedXp, legacyLevelOffsets, rewardForArchive };
