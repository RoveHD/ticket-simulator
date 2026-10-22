'use strict';

const { CHARACTERS } = require('./characters');
const IDS = new Set(CHARACTERS.map(character => character.id));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Shared by the pass, companion levels and ledger validator without importing
// the spin service back into progression (which would form a module cycle).
function validBonusTotals(ledger) {
  if (!plain(ledger) || ledger.version !== 2 || !integer(ledger.spins) || !integer(ledger.passXp) ||
      ledger.passXp % 250 !== 0 || !plain(ledger.companionXp)) return false;
  let grants = ledger.passXp / 250;
  for (const [id, xp] of Object.entries(ledger.companionXp)) {
    if (!IDS.has(id) || !integer(xp) || xp % 150 !== 0) return false;
    grants += xp / 150;
  }
  return Number.isSafeInteger(grants) && grants <= ledger.spins;
}
function arcaneBonusTotals(ledger) {
  return validBonusTotals(ledger) ? { passXp: ledger.passXp, companionXp: { ...ledger.companionXp } }
    : { passXp: 0, companionXp: {} };
}

module.exports = { validBonusTotals, arcaneBonusTotals };
