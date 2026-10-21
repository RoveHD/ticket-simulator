'use strict';

// Stable character IDs are shared by inventory rewards, image routes and UI.
// Lord artwork is a separate asset; owning it additionally requires mastery.
const CHARACTERS = Object.freeze([
  ['snake', 'Schlange', 'common', 0],
  ['wolf', 'Wolf', 'common', 0],
  ['dragon', 'Drache', 'common', 0],
  ['snake-coral', 'Korallenviper', 'rare', 6],
  ['fox', 'Sonnenfuchs', 'rare', 10],
  ['wolf-night', 'Schattenwolf', 'epic', 18],
  ['raven', 'Sturmrabe', 'epic', 26],
  ['dragon-frost', 'Frostdrache', 'legendary', 34],
  ['chimera', 'Nyxar', 'mythic', null],
].map(([id, name, rarity, unlockLevel]) => Object.freeze({ id, name, rarity, unlockLevel,
  ...(id === 'chimera' ? { secret: true, form: 'Schlange · Wolf · Drache' } : {}),
  baseImage: `/characters/${id}.png`, lordImage: `/characters/${id}-lord.png` })));

function validCompanionReward(reward) {
  return reward?.version === 1 && CHARACTERS.some(character => character.id === reward.characterId) &&
    Number.isSafeInteger(reward.xp) && reward.xp >= 0 && reward.xp <= 18000;
}

module.exports = { CHARACTERS, validCompanionReward };
