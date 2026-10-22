'use strict';

const crypto = require('node:crypto');
const { progression } = require('./progression');
const { passDustAtLevel } = require('./pass-extras');
const { CHARACTERS } = require('./characters');
const { chosenCharacter } = require('./companions');
const { canonicalPortraitId, canonicalMasteryReward, retainedPassFrames, legacyMasteryRewards } = require('./challenges');
const { validBonusTotals, arcaneBonusTotals } = require('./arcane-grants');
const STARTER = 300;
const PRICE = 100;
const RECEIPT_LIMIT = 50;
const MAX_SPINS = Math.floor(Number.MAX_SAFE_INTEGER / 400);
const REQUEST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/;
const COSMETICS = Object.freeze([
  Object.freeze({ id: 'badge-arcane-oracle', name: 'Oracle of the Rift', kind: 'badge', emblem: 'oracle', rarity: 'epic', animated: true,
    presentation: 'Arkanes Abzeichen', description: 'Ein leuchtendes Runensiegel aus dem Arcane Spinwheel.' }),
  Object.freeze({ id: 'badge-arcane-singularity', name: 'Heart of the Void', kind: 'badge', emblem: 'singularity', rarity: 'legendary', animated: true,
    presentation: 'Legendäres Abzeichen', description: 'Gebundene Sternenenergie für dein Profil.' }),
  Object.freeze({ id: 'title-arcane-sovereign', name: 'Sovereign of the Astral Veil', kind: 'title', rarity: 'mythic', titleStyle: 'mythic', animated: true,
    presentation: 'Mythischer Titel', description: 'Ein mythischer Name, geschmiedet jenseits des Schleiers.' }),
  ...[
    ['scene', 'forge', 'Sternenschmiede', 'Exklusive Menükulisse'],
    ['aura', 'soul', 'Seelenfunken', 'Exklusive Begleiteraura'],
    ['trail', 'thread', 'Astralfaden', 'Exklusive Cursorspur'],
    ['banner', 'rift', 'Risschronik', 'Exklusives Profilbanner'],
    ['finisher', 'supernova', 'Arkane Supernova', 'Exklusiver Sieges-Finisher'],
  ].map(([kind, slug, name, presentation]) => Object.freeze({ id: `${kind}-arcane-${slug}`, name, kind, variant: 5,
    rarity: 'mythic', presentation, description: 'Exklusiver Spinwheel-Look. Nach dem Gewinn dauerhaft im Profil ausrüstbar und jederzeit ablegbar.' })),
]);
const SEGMENTS = Object.freeze([
  [ 'dust-25', '25 Arkanstaub', 16, 25 ],
  [ 'dust-50', '50 Arkanstaub', 18, 50 ],
  [ 'dust-100', '100 Arkanstaub', 16, 100 ],
  [ 'dust-200', '200 Arkanstaub', 8, 200 ],
  [ 'dust-400', '400 Arkanstaub', 3, 400 ],
  [ 'oracle', COSMETICS[0].name, 6, COSMETICS[0].id ],
  [ 'singularity', COSMETICS[1].name, 4, COSMETICS[1].id ],
  [ 'sovereign', COSMETICS[2].name, 1, COSMETICS[2].id ],
  ...COSMETICS.slice(3).map(reward => [reward.id, reward.name, 3, reward.id]),
  ['companion-xp', '150 Begleiter-EP', 8, { kind: 'companionXp', amount: 150 }],
  ['pass-xp', '250 Pass-EP', 5, { kind: 'passXp', amount: 250 }],
].map(([id, name, weight, prize], index) => Object.freeze({ id, index, name, weight, chance: weight,
  ...(typeof prize === 'number' ? { dust: prize } : typeof prize === 'string' ? { cosmeticId: prize } : { grant: Object.freeze(prize) }) })));
const cosmeticById = new Map(COSMETICS.map(reward => [reward.id, reward]));
const integer = value => Number.isSafeInteger(value) && value >= 0;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const invalid = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function earnedDust(archives) {
  const seen = new Set();
  let total = 0;
  for (const archive of Array.isArray(archives) ? archives : []) {
    if (!plain(archive) || archive.id == null || seen.has(String(archive.id))) continue;
    seen.add(String(archive.id));
    const summary = archive.summary;
    if (!plain(summary)) continue;
    let earned = 0;
    if (archive.mode === 'career' && summary.solved === true) {
      earned = 40 + (summary.wrongChanges === 0 && summary.unnecessaryChecks === 0 ? 10 : 0);
    } else if (archive.mode === 'speedrun' && integer(summary.solvedCount) && summary.solvedCount <= Math.floor(Number.MAX_SAFE_INTEGER / 20)) {
      earned = summary.solvedCount * 20;
    }
    if (!Number.isSafeInteger(total + earned)) invalid('Der Arkanstaub-Ertrag überschreitet den unterstützten Zahlenbereich.', 500);
    total += earned;
  }
  return total;
}

function emptyLedger() { return { version: 2, spins: 0, spent: 0, won: 0, owned: [], receipts: [], passXp: 0, companionXp: {} }; }
function validReceipt(receipt, version) {
  const keys = ['requestId', 'spin', 'segmentIndex', 'dustAwarded', 'cosmeticId', 'duplicate', 'balance', 'createdAt'];
  if (!plain(receipt)) return false;
  const segment = SEGMENTS[receipt.segmentIndex];
  if (segment?.grant) keys.push('grant');
  if (!exactKeys(receipt, keys)) return false;
  if (typeof receipt.requestId !== 'string' || !REQUEST_ID.test(receipt.requestId) || !integer(receipt.spin) || receipt.spin < 1 || receipt.spin > MAX_SPINS ||
      !Number.isInteger(receipt.segmentIndex) || receipt.segmentIndex < 0 || receipt.segmentIndex >= (version === 1 ? 8 : SEGMENTS.length) ||
      !integer(receipt.balance) || typeof receipt.duplicate !== 'boolean' || typeof receipt.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(receipt.createdAt))) return false;
  if (segment.grant) {
    const grant = receipt.grant;
    const definition = segment.grant.kind === 'passXp' && grant?.kind === 'companionXp' ? { kind: 'companionXp', amount: 150 } : segment.grant;
    const companion = definition.kind === 'companionXp';
    return exactKeys(grant, companion ? ['kind', 'amount', 'characterId'] : ['kind', 'amount']) &&
      grant.kind === definition.kind && grant.amount === definition.amount &&
      (!companion || CHARACTERS.some(character => character.id === grant.characterId)) &&
      receipt.dustAwarded === 0 && receipt.cosmeticId === null && receipt.duplicate === false;
  }
  if (segment.dust !== undefined) return receipt.dustAwarded === segment.dust && receipt.cosmeticId === null && receipt.duplicate === false;
  return receipt.cosmeticId === segment.cosmeticId && receipt.dustAwarded === (receipt.duplicate ? 150 : 0);
}
function validArcanePersistence(state) {
  if (!plain(state)) return false;
  if (state.arcane === undefined) return true;
  const ledger = state.arcane;
  const version = ledger?.version;
  if (![1, 2].includes(version) || !exactKeys(ledger, ['version', 'spins', 'spent', 'won', 'owned', 'receipts', ...(version === 2 ? ['passXp', 'companionXp'] : [])]) ||
      !integer(ledger.spins) || ledger.spins > MAX_SPINS || ledger.spent !== ledger.spins * PRICE ||
      !integer(ledger.won) || ledger.won > ledger.spins * 400 || !Array.isArray(ledger.owned) ||
      ledger.owned.length > COSMETICS.length || ledger.owned.length > ledger.spins || new Set(ledger.owned).size !== ledger.owned.length ||
      !ledger.owned.every(id => version === 1 ? COSMETICS.slice(0, 3).some(reward => reward.id === id) : cosmeticById.has(id)) || !Array.isArray(ledger.receipts) ||
      ledger.receipts.length !== Math.min(ledger.spins, RECEIPT_LIMIT)) return false;
  if (version === 2 && !validBonusTotals(ledger)) return false;
  const ids = new Set(), recentOwned = new Set();
  let recentWon = 0, recentPassXp = 0;
  const recentCompanionXp = {};
  for (let i = 0; i < ledger.receipts.length; i++) {
    const receipt = ledger.receipts[i];
    if (!validReceipt(receipt, version) || receipt.spin !== ledger.spins - ledger.receipts.length + i + 1 || ids.has(receipt.requestId) ||
        (receipt.cosmeticId && !ledger.owned.includes(receipt.cosmeticId))) return false;
    if (receipt.cosmeticId) {
      if (recentOwned.has(receipt.cosmeticId) && !receipt.duplicate) return false;
      if (ledger.spins <= RECEIPT_LIMIT && receipt.duplicate !== recentOwned.has(receipt.cosmeticId)) return false;
      recentOwned.add(receipt.cosmeticId);
    }
    if (receipt.grant?.kind === 'passXp') recentPassXp += receipt.grant.amount;
    if (receipt.grant?.kind === 'companionXp') recentCompanionXp[receipt.grant.characterId] = (recentCompanionXp[receipt.grant.characterId] || 0) + receipt.grant.amount;
    ids.add(receipt.requestId); recentWon += receipt.dustAwarded;
  }
  if (ledger.spins <= RECEIPT_LIMIT && (recentOwned.size !== ledger.owned.length || ledger.owned.some(id => !recentOwned.has(id)))) return false;
  if (version === 2) {
    const total = arcaneBonusTotals(ledger);
    if (recentPassXp > total.passXp || (ledger.spins <= RECEIPT_LIMIT && recentPassXp !== total.passXp)) return false;
    for (const id of new Set([...Object.keys(total.companionXp), ...Object.keys(recentCompanionXp)])) {
      if ((recentCompanionXp[id] || 0) > (total.companionXp[id] || 0) ||
          (ledger.spins <= RECEIPT_LIMIT && (recentCompanionXp[id] || 0) !== (total.companionXp[id] || 0))) return false;
    }
    const bonusSpins = total.passXp / 250 + Object.values(total.companionXp).reduce((sum, xp) => sum + xp / 150, 0);
    if (bonusSpins + ledger.owned.length > ledger.spins) return false;
  }
  return recentWon <= ledger.won && (ledger.spins > RECEIPT_LIMIT || recentWon === ledger.won);
}
function ledgerFor(state) {
  if (!validArcanePersistence(state)) invalid('Der gespeicherte Arcane-Spielstand ist ungültig. Er wurde nicht überschrieben.', 500);
  return state.arcane || emptyLedger();
}
function copyReceipt(receipt) {
  return { ...receipt, ...(receipt.grant ? { grant: { ...receipt.grant } } : {}) };
}
function wallet(state, ledger = ledgerFor(state), options = {}) {
  const earned = earnedDust(state.archives);
  // The pass is an entitlement derived from host-validated outcomes, not a
  // claimable ledger entry. Reloading or replaying a spin cannot credit it twice.
  const passLevel = options.passLevel ?? progression(state.archives, options.now ?? new Date(), state).battlepass.level;
  const passEarned = passDustAtLevel(passLevel);
  // Check every operation before using it; even intermediate integer overflow is rejected.
  const funded = STARTER + earned + passEarned;
  if (!Number.isSafeInteger(funded) || !Number.isSafeInteger(funded + ledger.won)) invalid('Der Arkanstaub-Kontostand überschreitet den unterstützten Zahlenbereich.', 500);
  const balance = funded + ledger.won - ledger.spent;
  if (!integer(balance)) invalid('Der gespeicherte Arkanstaub-Kontostand ist widersprüchlich. Er wurde nicht überschrieben.', 500);
  return { earned, passEarned, balance };
}
function arcaneRewards(state) {
  return ledgerFor(state).owned.map(id => ({ ...cosmeticById.get(id) }));
}
function activeCompanion(state, game) {
  const inventory = [...game.inventory, ...retainedPassFrames(state.legacyPassFrameIds),
    ...legacyMasteryRewards(game, state.legacyMasteryRewardIds || []).map(canonicalMasteryReward)];
  return chosenCharacter({ ...state, cosmetics: { ...state.cosmetics, portrait: canonicalPortraitId(state.cosmetics?.portrait) } }, inventory);
}
function arcaneView(state, options = {}) {
  const ledger = ledgerFor(state);
  const game = options.passLevel === undefined || !Object.hasOwn(options, 'activeId') ? progression(state.archives, options.now ?? new Date(), state) : null;
  const activeId = Object.hasOwn(options, 'activeId') ? options.activeId : activeCompanion(state, game);
  const { earned, passEarned, balance } = wallet(state, ledger, { ...options, passLevel: options.passLevel ?? game.battlepass.level });
  return { currency: 'Arkanstaub', starter: STARTER, price: PRICE, earned, passEarned, spent: ledger.spent, won: ledger.won,
    bonusPassXp: arcaneBonusTotals(ledger).passXp, bonusCompanionXp: arcaneBonusTotals(ledger).companionXp,
    balance, totalSpins: ledger.spins, canSpin: !!activeId && balance >= PRICE && ledger.spins < MAX_SPINS,
    spinBlockedReason: !activeId ? 'Wähle zuerst deinen Begleiter im Profil.' : balance < PRICE ? 'Nicht genug Arkanstaub.' : ledger.spins >= MAX_SPINS ? 'Maximale Spinzahl erreicht.' : '',
    segments: SEGMENTS.map(segment => ({ ...segment, ...(segment.grant ? { grant: { ...segment.grant } } : {}), ...(segment.cosmeticId ? { reward: { ...cosmeticById.get(segment.cosmeticId) } } : {}) })),
    recent: ledger.receipts.slice(-10).reverse().map(copyReceipt) };
}
function spin(state, input, options = {}) {
  if (!exactKeys(input, ['requestId', 'expectedSpins']) || typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId) ||
      !integer(input.expectedSpins) || input.expectedSpins > MAX_SPINS) invalid('Ungültige Spin-Anfrage. Bitte aktualisiere das Spinwheel.');
  const ledger = ledgerFor(state), original = ledger.receipts.find(receipt => receipt.requestId === input.requestId);
  if (original) return { nextState: state, receipt: copyReceipt(original), replayed: true };
  if (input.expectedSpins !== ledger.spins) invalid('Der Spin-Stand hat sich geändert. Bitte aktualisiere das Spinwheel.', 409);
  const time = typeof options.now === 'function' ? options.now() : options.now ?? new Date();
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) invalid('Der Spin-Zeitpunkt ist ungültig.', 500);
  const game = progression(state.archives, date, state), characterId = activeCompanion(state, game);
  if (!characterId) invalid('Wähle zuerst deinen Begleiter im Profil.', 409);
  const { balance, passEarned } = wallet(state, ledger, { now: date, passLevel: game.battlepass.level });
  if (ledger.spins >= MAX_SPINS) invalid('Die unterstützte Zahl an Spins ist erreicht.', 409);
  if (balance < PRICE) invalid('Nicht genug Arkanstaub. Löse weitere Tickets für neue Spins.', 409);
  const roll = (options.randomInt || crypto.randomInt)(100);
  if (!Number.isInteger(roll) || roll < 0 || roll >= 100) invalid('Das Spin-Ergebnis konnte nicht ermittelt werden.', 500);
  let edge = 0;
  const segment = SEGMENTS.find(item => roll < (edge += item.weight));
  const duplicate = !!segment.cosmeticId && ledger.owned.includes(segment.cosmeticId);
  const dustAwarded = segment.dust ?? (duplicate ? 150 : 0);
  const won = ledger.won + dustAwarded;
  const bonus = arcaneBonusTotals(ledger);
  const packet = segment.grant?.kind === 'passXp' && game.battlepass.level === 40 ? { kind: 'companionXp', amount: 150 } : segment.grant;
  const grant = packet ? { ...packet, ...(packet.kind === 'companionXp' ? { characterId } : {}) } : null;
  const passXp = bonus.passXp + (grant?.kind === 'passXp' ? grant.amount : 0);
  const companionXp = { ...bonus.companionXp };
  if (grant?.kind === 'companionXp') companionXp[characterId] = (companionXp[characterId] || 0) + grant.amount;
  const nextLedger = { version: 2, spins: ledger.spins + 1, spent: ledger.spent + PRICE, won,
    owned: segment.cosmeticId && !duplicate ? [...ledger.owned, segment.cosmeticId] : [...ledger.owned],
    receipts: [...ledger.receipts], passXp, companionXp };
  const nextState = { ...state, arcane: nextLedger };
  const nextPassEarned = grant?.kind === 'passXp' ? passDustAtLevel(progression(state.archives, date, nextState).battlepass.level) : passEarned;
  const nextBalance = balance - PRICE + dustAwarded + nextPassEarned - passEarned;
  if (!integer(won) || !integer(nextBalance) || !integer(passXp) || !Object.values(companionXp).every(integer)) invalid('Der Spin überschreitet den unterstützten Zahlenbereich.', 500);
  const receipt = { requestId: input.requestId, spin: ledger.spins + 1, segmentIndex: segment.index, dustAwarded,
    cosmeticId: segment.cosmeticId || null, duplicate, balance: nextBalance, createdAt: date.toISOString(), ...(grant ? { grant } : {}) };
  nextLedger.receipts = [...ledger.receipts, receipt].slice(-RECEIPT_LIMIT);
  if (!validArcanePersistence(nextState)) invalid('Der Spin konnte nicht widerspruchsfrei gespeichert werden.', 500);
  return { nextState, receipt: { ...receipt, ...(grant ? { grant: { ...grant } } : {}) }, replayed: false };
}

module.exports = { STARTER, PRICE, COSMETICS, SEGMENTS, earnedDust, validArcanePersistence, arcaneView, arcaneRewards, spin };
