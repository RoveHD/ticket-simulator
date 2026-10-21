'use strict';

const SWITCH_LEVEL = 20;
const MAX_XP = Number.MAX_SAFE_INTEGER;

// Each following level costs 300 XP more than the preceding one.
function xpAtLevel(level) {
  return Math.min(MAX_XP, 150 * (level - 1) * (level + 2));
}
function levelAt(xp) {
  let level = Math.max(1, Math.floor((Math.sqrt(9 + 4 * xp / 150) - 1) / 2));
  while (xpAtLevel(level + 1) <= xp && xpAtLevel(level + 1) < MAX_XP) level++;
  while (xpAtLevel(level) > xp) level--;
  return level;
}
const SWITCH_XP = xpAtLevel(SWITCH_LEVEL);

module.exports = { SWITCH_LEVEL, SWITCH_XP, MAX_XP, xpAtLevel, levelAt };
