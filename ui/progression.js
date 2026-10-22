'use strict';

// Career progression UI. Kept independent so game.js can embed progressionHub()
// and reuse the small profile helpers without coupling the ticket workflow.
let progressionTab = 'daily';
let progressionQuery = '';
let progressionFilter = 'all';
let progressionPage = 0;
let progressionPassPage = null;
let progressionBusy = false;
let progressionCollectionKind = 'portrait';
let progressionCollectionSpecies = 'all';
let progressionCollectionPage = 0;
let profileTab = 'companions';
let progressionCollectionStatus = 'owned';
let progressionMasterySpecies = null;

const progressionTabs = [
  ['daily', 'Heute'], ['weekly', 'Diese Woche'], ['permanent', 'Dauerhaft'],
];
const progressionRarity = {
  common: ['Gewöhnlich', 'common'], rare: ['Selten', 'rare'], epic: ['Episch', 'epic'],
  legendary: ['Legendär', 'legendary'], mythic: ['Mythisch', 'mythic'],
};
const progressionCharacterFallbacks = [
  { id: 'snake', name: 'Schlange', rarity: 'common', unlockLevel: 0 },
  { id: 'wolf', name: 'Wolf', rarity: 'common', unlockLevel: 0 },
  { id: 'dragon', name: 'Drache', rarity: 'common', unlockLevel: 0 },
];
const progressionRankNames = ['Neustart', 'Einsatzbereit', 'Problemlöser', 'Teamstütze', 'Betriebsprofi', 'Leitstelle'];

function progressionEscape(value) {
  return typeof esc === 'function' ? esc(value) : String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function progressionGame() { return state?.game || {}; }
function progressionChallenges() { return progressionGame().challenges || {}; }
function progressionCharactersCatalog() {
  const source = Array.isArray(progressionGame().characters) ? progressionGame().characters : progressionCharacterFallbacks;
  return source.filter(c => c && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(c.id || '')))
    .map(c => {
      const id = String(c.id), baseImage = `/characters/${id}.png`, lordImage = `/characters/${id}-lord.png`;
      if (c.secret && !c.unlocked) return { ...c, id, name: '???', baseImage: '', lordImage: '', unlockLevel: null };
      return { ...c, id, name: String(c.name || id),
        baseImage: c.baseImage === baseImage ? c.baseImage : baseImage,
        lordImage: c.lordImage === lordImage ? c.lordImage : lordImage,
        unlockLevel: c.secret ? null : Math.max(0, Number(c.unlockLevel) || 0) };
    });
}
function progressionCharacterById(id) { return progressionCharactersCatalog().find(c => c.id === id); }
function progressionSecretLocked(id) {
  const character = progressionCharacterById(id);
  return !!character?.secret && !character.unlocked;
}
function progressionSecretArt(compact = false) {
  return `<div class="progression-art secret-art ${compact ? 'compact' : ''}" role="img" aria-label="Unbekannter geheimer Begleiter"><i class="secret-orbit" aria-hidden="true"></i><i class="secret-orbit inner" aria-hidden="true"></i><b aria-hidden="true">?</b><small aria-hidden="true">UNENTDECKT</small></div>`;
}
function progressionSecretReveal(rewards = []) {
  const discovered = rewards.find(reward => reward.kind === 'portrait' && reward.variant === 'base' &&
    progressionCharacterById(reward.character)?.secret && progressionRewardOwned(reward));
  if (!discovered) return '';
  return `<section class="secret-reveal" aria-label="Geheimer Begleiter entdeckt">${progressionRewardArt(discovered)}<div><span class="secret-label">DAS SIEGEL IST GEBROCHEN</span><h3>${progressionEscape(discovered.name)}</h3><p>Eine Legende hat dich anerkannt. Dein geheimer Begleiter und seine verdienten Formen warten im Profil.</p><button class="button primary" data-view="profile">Begleiter entdecken →</button></div></section>`;
}
function progressionCharacterImage(id, lord = false) {
  const character = progressionCharacterById(id);
  return character ? (lord ? character.lordImage : character.baseImage) : '';
}
function progressionPixelSprite(id, lord = false, extraClass = '') {
  if (progressionSecretLocked(id)) return '';
  const cells = { snake:['a',0],wolf:['a',1],dragon:['b',0],'snake-coral':['b',1],fox:['c',0],
    'wolf-night':['c',1],raven:['d',0],'dragon-frost':['d',1],chimera:['secret',0] };
  if (!Object.hasOwn(cells,id) || !progressionCharacterById(id)) return '';
  const [sheet,column] = cells[id], secret = sheet === 'secret';
  const col = secret ? Number(lord) : column, row = secret ? 0 : Number(lord), rows = secret ? 1 : 2;
  return `<span class="pixel-sprite ${extraClass}" data-character="${id}" data-variant="${lord ? 'lord' : 'base'}" style="--sprite-col:${col};--sprite-row:${row};--sprite-rows:${rows}"><img class="pixel-sprite-sheet" src="/characters/pixel-atlas-${sheet}.png" alt="" loading="lazy" draggable="false"></span>`;
}
function progressionCompanionForms(characterId) { return progressionGame().companionForms?.[characterId]; }
function progressionPersonalMasteries(characterId) {
  return progressionGame().companionMasteries?.[characterId] || [];
}
function progressionMasteryCharacter() {
  const characters = progressionCharactersCatalog().filter(c => !progressionSecretLocked(c.id));
  return characters.find(c => c.id === progressionMasterySpecies) ||
    characters.find(c => c.id === progressionGame().companion?.activeId) || characters[0];
}
function progressionMasteryAnimals() {
  const selected = progressionMasteryCharacter();
  const active = progressionGame().companion?.activeId;
  return `<div class="mastery-animal-heading"><h3>Dein Tier. Seine Meisterung.</h3><p>Ansehen wechselt deinen Begleiter nicht. Nur dein aktives Tier sammelt neue Formenfortschritte.</p></div><div class="mastery-animals" role="group" aria-label="Meisterung eines Begleiters ansehen">${progressionCharactersCatalog().map(c => {
    if (progressionSecretLocked(c.id)) return `<div class="mastery-animal sealed" aria-label="Geheimer Begleiter, noch unentdeckt">${progressionSecretArt(true)}<strong>???</strong><small>GEHEIM</small></div>`;
    const info = progressionGame().companion?.characters?.find(item => item.id === c.id) || c;
    return `<button class="mastery-animal ${selected?.id === c.id ? 'selected' : ''}" data-mastery-character="${c.id}" aria-pressed="${selected?.id === c.id}">${progressionPixelSprite(c.id)}<strong>${progressionEscape(c.name)}</strong><small>${active === c.id ? 'AKTIVER BEGLEITER' : info?.unlocked ? `Stufe ${info.level || 1}` : 'NOCH GESPERRT'}</small></button>`;
  }).join('')}</div>`;
}
function progressionMasteryBonus(mastery, lordOwned = false) {
  const companion = progressionGame().companion || {};
  const current = companion.current || null;
  const character = progressionCharacterById(mastery.character) || progressionMasteryCharacter();
  const info = companion.characters?.find(c => c.id === character?.id);
  const active = character?.id === current?.id;
  const eligible = Array.isArray(info?.affinityIds) ? info.affinityIds.includes(mastery.id) : (info?.affinities || []).includes(mastery.name);
  const base = Number(companion.baseXpPerSolved) || 100;
  const bonus = eligible ? Math.floor(base * (Number(companion.bonusPercent) || 50) / 100) : 0;
  const forms = progressionCompanionForms(character?.id) || {};
  const frame = forms.astralUnlocked ? 'astral' : forms.eternalUnlocked ? 'eternal' : forms.goldUnlocked ? 'gold' : forms.silverUnlocked ? 'silver' : forms.lordUnlocked ? 'lord' : 'base';
  const art = { kind: 'portrait', character: character?.id, variant: frame === 'base' ? 'base' : 'lord', frame };
  return `<div class="mastery-animal-portrait">${progressionRewardArt(art)}</div><div class="mastery-bonus-info"><span class="progression-overline">${active ? 'DEIN AKTIVER BEGLEITER' : 'TIERANSICHT · NICHT AKTIV'}</span><h3>${progressionEscape(character?.name || 'Begleiter')}</h3><strong>${active ? `${base} Basis-EP${bonus ? ` + ${bonus} Bonus-EP` : ''} pro gelöstem Fall` : 'Sammelt gerade keinen eigenen Fortschritt'}</strong><span>${eligible ? '+50 % Begleiter-EP in diesem Fachgebiet' : 'Ohne Fachgebietsbonus · Formen trotzdem erlernbar'}</span><small>Diese Fälle zählen zum gemeinsamen Formenfortschritt von ${progressionEscape(character?.name || 'diesem Tier')}. Dein Begleiter-Level wächst ohne Obergrenze; pro Ticket höchstens ein Bonus.</small></div>`;
}
function progressionRewardName(reward = {}) {
  if (reward.name) return reward.name;
  if (reward.kind === 'portrait') return `${progressionCharacterById(reward.character)?.name || 'Charakter'}${reward.variant === 'lord' ? ' · Lord' : reward.variant && reward.variant !== 'base' ? ` · ${reward.variant}` : ''}`;
  if (reward.kind === 'badge') return 'Rangabzeichen';
  return 'Titel';
}
function progressionRarityMarkup(reward = {}) {
  const [label, css] = progressionRarity[reward.rarity] || progressionRarity.common;
  return `<span class="progression-rarity rarity-${css}">${label}</span>`;
}
function progressionTitleMarkup(reward = {}) {
  const rarity = progressionRarity[reward.rarity]?.[1] || 'common';
  return `<span class="reward-title title-${rarity}" title="${progressionEscape(reward.name || 'Unbound')}">${progressionEscape(reward.name || 'Unbound')}</span>`;
}
function equippedTitleMarkup() {
  const title = progressionInventory().find(r => r.kind === 'title' && progressionEquipped(r));
  return title ? progressionTitleMarkup(title) : '';
}
const progressionPixelEmblems = Object.fromEntries(Object.entries({
  "spark": [
    "00011000",
    "00011000",
    "00011000",
    "11111111",
    "11111111",
    "00011000",
    "00011000",
    "00011000"
  ],
  "sentinel": [
    "11111111",
    "10000001",
    "10000001",
    "10001001",
    "01011010",
    "01010010",
    "00100100",
    "00011000"
  ],
  "comet": [
    "00000110",
    "00011110",
    "00111100",
    "01111000",
    "11110000",
    "11100000",
    "11000000",
    "10000000"
  ],
  "oracle": [
    "00011000",
    "00111100",
    "01100110",
    "11011011",
    "11011011",
    "01100110",
    "00111100",
    "00011000"
  ],
  "compass": [
    "00011000",
    "00111100",
    "00011000",
    "11111111",
    "11111111",
    "00011000",
    "00111100",
    "00011000"
  ],
  "blade": [
    "00000011",
    "00000111",
    "00001110",
    "01011100",
    "00111000",
    "01110000",
    "11001000",
    "10000000"
  ],
  "aegis": [
    "11111111",
    "10000001",
    "10111101",
    "10100101",
    "01100110",
    "01111110",
    "00111100",
    "00011000"
  ],
  "reactor": [
    "00111100",
    "01100110",
    "11011011",
    "10100101",
    "10100101",
    "11011011",
    "01100110",
    "00111100"
  ],
  "eclipse": [
    "00111100",
    "01100010",
    "11000000",
    "11000000",
    "11000000",
    "11000000",
    "01100010",
    "00111100"
  ],
  "wraith": [
    "00111100",
    "01111110",
    "11011011",
    "11011011",
    "11111111",
    "11111111",
    "11011011",
    "10010001"
  ],
  "phoenix": [
    "10011001",
    "11011011",
    "01111110",
    "00111100",
    "01111110",
    "01011010",
    "00011000",
    "00100100"
  ],
  "crown": [
    "10011001",
    "11011011",
    "11111111",
    "01111110",
    "01111110",
    "01111110",
    "00000000",
    "00111100"
  ],
  "prism": [
    "00011000",
    "00111100",
    "01111110",
    "11011011",
    "11011011",
    "01111110",
    "00111100",
    "00011000"
  ],
  "void": [
    "11000011",
    "11100111",
    "01111110",
    "01111110",
    "00111100",
    "00100100",
    "00111100",
    "00011000"
  ],
  "dragon": [
    "11000011",
    "11100111",
    "01111110",
    "11011011",
    "11111111",
    "01100110",
    "00111100",
    "00011000"
  ],
  "singularity": [
    "00111100",
    "01100110",
    "11000011",
    "10011001",
    "10011001",
    "11000011",
    "01100110",
    "00111100"
  ]
}).map(([name,rows])=>[name,'<path class="em-pixel" d="'+rows.flatMap((row,y)=>[...row].flatMap((bit,x)=>bit==='1'?['M'+(18+x*8)+' '+(18+y*8)+'h8v8h-8z']:[])).join('')+'"/>']));
function progressionPassEmblem(reward, compact = false) {
  const symbols = progressionPixelEmblems;
  const emblem = Object.hasOwn(symbols, reward.emblem) ? reward.emblem : 'spark';
  const rarity = progressionRarity[reward.rarity]?.[1] || 'common';
  const animated = ['epic','legendary','mythic'].includes(rarity);
  return `<div class="progression-art pass-emblem emblem-${emblem} emblem-${rarity} ${animated?'emblem-animated':''} ${compact?'compact':''}" role="img" aria-label="${progressionEscape(reward.name || 'Abzeichen')}"><svg viewBox="0 0 100 100" aria-hidden="true"><g class="em-orbit"><path d="M18 4h64v6h8v8h6v64h-6v8h-8v6H18v-6h-8v-8H4V18h6v-8h8z"/><rect class="em-satellite" x="48" y="2" width="4" height="4"/><rect class="em-satellite" x="48" y="94" width="4" height="4"/></g><g class="em-symbol">${symbols[emblem]}</g></svg></div>`;
}

function progressionRewardArt(reward = {}, compact = false) {
  if (typeof passExtraArt === 'function') {
    const extra = passExtraArt(reward, compact);
    if (extra) return extra;
  }
  if (reward.kind === 'portrait') {
    const character = reward.character || 'snake';
    if (progressionSecretLocked(character)) return progressionSecretArt(compact);
    const frame = reward.frame || reward.variant || 'base';
    const breakout = progressionCharacterBreakout(character, frame);
    return `<div class="progression-art ${compact ? 'compact' : ''} ${reward.variant === 'lord' ? 'lord-art' : ''} frame-${progressionEscape(frame)} ${breakout ? `character-breakout breakout-${progressionEscape(character)}` : ''}">${breakout || progressionPixelSprite(character, reward.variant === 'lord')}${progressionFrameEffect(frame)}</div>`;
  }
  if (reward.kind === 'badge') return progressionBadgeArt(reward, compact);
  return `<div class="progression-art pass-title-art ${compact ? 'compact' : ''}"><span class="title-insignia" aria-hidden="true">${reward.rarity === 'mythic' ? '♛' : '✦'}</span>${progressionTitleMarkup(reward)}</div>`;
}
function progressionCharacterBreakout(character, frame) {
  if (!['eternal', 'astral'].includes(frame) || progressionSecretLocked(character) || !progressionCharactersCatalog().some(c => c.id === character)) return '';
  return `<span class="portrait-scene-background" aria-hidden="true"><svg viewBox="0 0 100 140" preserveAspectRatio="none"><path d="M20 24h60v72H20zM28 32h44v56H28zM50 16v88M12 60h76"/><path class="scene-stars" d="M14 20h6v6h-6zM80 100h6v6h-6zM24 112h6v6h-6z"/></svg></span>${progressionPixelSprite(character,true,'portrait-creature')}`;
}
function progressionFrameEffect(frame) {
  if (!['eternal', 'astral'].includes(frame)) return '';
  return `<span class="eternal-frame-effect ${frame === 'astral' ? 'astral-frame-effect' : ''}" aria-hidden="true">${frame === 'astral' ? '<span class="astral-halo"></span><span class="astral-light-sweep"></span>' : ''}<svg viewBox="0 0 100 140" preserveAspectRatio="none"><path class="eternal-track" d="M25 5H75L95 25V115L75 135H25L5 115V25Z"/><path class="eternal-current" pathLength="100" d="M25 5H75L95 25V115L75 135H25L5 115V25Z"/><path class="eternal-current eternal-counter" pathLength="100" d="M25 5H75L95 25V115L75 135H25L5 115V25Z"/><path class="eternal-inner" d="M22 12H78L88 22V118L78 128H22L12 118V22Z"/><g class="eternal-crystals"><path d="m50 1 8 8-8 11-8-11Z"/><path d="m50 120 8 11-8 8-8-8Z"/><path d="m1 70 7-9 7 9-7 9Z"/><path d="m85 70 7-9 7 9-7 9Z"/></g></svg><i class="eternal-spark spark-one"></i><i class="eternal-spark spark-two"></i><i class="eternal-spark spark-three"></i></span>`;
}
function progressionBadgeArt(reward = {}, compact = false) {
  if (reward.masteryTier) return progressionMasteryBadgeArt(reward.masteryTier, compact);
  if (reward.emblem) return progressionPassEmblem(reward, compact);
  const key = String(reward.id || reward.name || 'badge');
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  const shape = Math.abs(hash) % 5;
  const paths = [
    '<path d="M12 1 15 6l6 1-4 5 1 6-6-2-6 2 1-6-4-5 6-1z"/>',
    '<path d="M12 1 22 7v10l-10 6L2 17V7z"/><path d="m6 12 4 4 8-8"/>',
    '<path d="M12 1 15 8l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/><circle cx="12" cy="12" r="3"/>',
    '<path d="M12 1 20 5v6c0 6-8 12-8 12S4 17 4 11V5z"/><path d="m8 12 3 3 5-6"/>',
    '<path d="M12 1 23 12 12 23 1 12z"/><path d="m8 12 3-3 5 3-4 4z"/>',
  ];
  return `<div class="progression-art sigil badge-art badge-shape-${shape} ${compact ? 'compact' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[shape]}</svg><i>${String(shape + 1)}</i></div>`;
}
function progressionMasteryBadgeArt(tier, compact = false) {
  const art = '<path class="mb-shield" d="M16 8h32v6h8v26h-6v12h-6v10h-8v6h-8v-6h-8V52h-6V40H8V14h8z"/>'+
    (tier!=='lord'?'<path class="mb-wings" d="M8 20H0v10h4v12h6v10h8V40h-6V30H8zM56 20h8v10h-4v12h-6v10h-8V40h6V30h4z"/>':'')+
    (tier==='gold'?'<path class="mb-crown" d="M14 14V4h6v6h8V0h8v10h8V4h6v10h-6v6H20v-6z"/>':'')+
    '<path class="mb-crystal" d="M28 25h8v8h8v8h-8v8h-8v-8h-8v-8h8z"/>';
  const label = tier === 'gold' ? 'Gold-Lord' : tier === 'silver' ? 'Silber-Lord' : 'Lord';
  return `<div class="mastery-badge-art mastery-badge-${progressionEscape(tier)} ${compact ? 'compact' : ''}" role="img" aria-label="${label}-Siegel"><svg viewBox="0 0 64 76" aria-hidden="true">${art}</svg></div>`;
}
function progressionMasteryBadges(mastery) {
  const tiers = [
    ['lord', 'LORD-SIEGEL', mastery.lordRequirements || { solved: 50, hardSolved: 10 }],
    ['silver', 'SILBER-LORD', mastery.prestigeRequirements?.silver || { solved: 100, hardSolved: 25 }],
    ['gold', 'ULTIMATIVER GOLD-LORD', mastery.prestigeRequirements?.gold || { solved: 200, hardSolved: 60 }],
  ];
  return `<div class="mastery-badges" aria-label="Meisterschafts-Abzeichen">${tiers.map(([tier, label, required]) => {
    const id = tier === 'lord' ? `badge-lord-${mastery.id}` : `badge-lord-${mastery.id}-${tier}`;
    const badge = { id, name: `${mastery.name || 'Fachgebiet'} · ${label}`, kind: 'badge', masteryId: mastery.id, masteryTier: tier, frame: tier === 'lord' ? undefined : tier, rarity: 'mythic' };
    const unlocked = progressionRewardOwned(badge);
    const progress = `${Math.min(Number(mastery.solved) || 0, required.solved)}/${required.solved} Fälle · ${Math.min(Number(mastery.hardSolved) || 0, required.hardSolved)}/${required.hardSolved} auf Stufe 4+`;
    return `<article class="mastery-badge-preview ${unlocked ? 'earned' : ''} tier-${tier}">${progressionMasteryBadgeArt(tier)}<div><span>${label}</span><strong>${progressionEscape(badge.name)}</strong><small>${progress}</small></div>${unlocked ? progressionEquipButton(badge) : '<small class="mastery-badge-locked">GESPERRT</small>'}</article>`;
  }).join('')}</div>`;
}
function progressionCosmetics() { return progressionGame().cosmetics || {}; }
function progressionInventory() { return progressionGame().inventory || []; }
function progressionRewardOwned(reward = {}) {
  const inventory = progressionInventory();
  if (!inventory.some(item => item.id === reward.id)) return false;
  if (reward.kind === 'portrait' && reward.variant === 'lord') {
    const stored = inventory.find(item => item.id === reward.id);
    if (stored?.legacy) return inventory.some(item => item.id === `portrait-${reward.character}-base`);
    const mastery = reward.companionForm || !reward.masteryId ? progressionCompanionForms(reward.character) : progressionPersonalMasteries(reward.character).find(m => m.id === reward.masteryId);
    const stage = reward.frame === 'astral' ? mastery?.astralUnlocked : reward.frame === 'eternal' ? mastery?.eternalUnlocked : reward.frame === 'gold' ? mastery?.goldUnlocked : reward.frame === 'silver' ? mastery?.silverUnlocked : mastery?.lordUnlocked;
    return !!stage && inventory.some(item => item.id === `portrait-${reward.character}-base`);
  }
  if (reward.kind === 'badge' && reward.masteryTier) {
    const mastery = (progressionGame().masteries || []).find(m => m.id === reward.masteryId);
    const stage = reward.masteryTier === 'gold' ? mastery?.goldUnlocked : reward.masteryTier === 'silver' ? mastery?.silverUnlocked : mastery?.lordUnlocked;
    return !!stage && inventory.some(item => item.id === reward.id);
  }
  return true;
}
function progressionEquipped(reward) {
  const value = progressionCosmetics()[reward.kind];
  return value === reward.id || value?.id === reward.id;
}
function progressionEquipButton(reward) {
  const owned = progressionRewardOwned(reward) || reward.unlocked === true;
  if (!owned || !['portrait', 'badge', 'title', 'scene', 'aura', 'trail', 'banner', 'finisher'].includes(reward.kind)) return '';
  const selected = progressionEquipped(reward) && !(reward.kind === 'portrait' && progressionGame().companionChosen === false);
  const companion = progressionGame().companion;
  const switchLocked = reward.kind === 'portrait' && companion?.activeId && reward.character !== companion.activeId && !companion.canSwitch;
  return `<button class="progression-equip ${selected ? 'equipped' : ''}" data-progression-equip="${progressionEscape(reward.kind)}" data-reward-id="${progressionEscape(reward.id)}" aria-pressed="${selected}" ${switchLocked ? `title="${progressionEscape(companion.switchReason)}"` : ''} ${selected || switchLocked || progressionBusy || (typeof isBusy === 'function' && isBusy()) ? 'disabled' : ''}>${selected ? 'Ausgewählt' : switchLocked ? 'Wechsel noch gesperrt' : 'Ausrüsten'}</button>`;
}
function progressionRewardCard(reward, options = {}) {
  if (reward.kind === 'portrait' && progressionSecretLocked(reward.character)) {
    return `<article class="progression-reward is-locked secret-reward">${progressionSecretArt()}<div class="progression-reward-copy"><span class="secret-label">GEHEIMER BEGLEITER</span><h3>???</h3><p>Ein verborgenes Wesen. Sein Name und seine Formen bleiben versiegelt.</p></div>${progressionUnlock(reward)}</article>`;
  }
  const owned = progressionRewardOwned(reward) || reward.unlocked === true;
  const locked = options.locked || !owned;
  return `<article class="progression-reward rarity-border-${progressionRarity[reward.rarity]?.[1] || 'common'} ${locked ? 'is-locked' : ''}">${progressionRewardArt(reward)}<div class="progression-reward-copy">${progressionRarityMarkup(reward)}<h3>${progressionEscape(progressionRewardName(reward))}</h3><p>${progressionEscape(reward.description || (locked ? options.unlockText || 'Noch nicht freigeschaltet' : 'In deiner Sammlung'))}</p>${reward.kind === 'title' ? `<span class="title-preview">${progressionTitleMarkup(reward)}</span>` : ''}</div>${locked ? '<span class="progression-lock" aria-label="Gesperrt">▣</span>' + progressionUnlock(reward) : progressionEquipButton(reward)}${typeof passExtraPreviewButton === 'function' ? passExtraPreviewButton(reward) : ''}</article>`;
}
function progressionCountdown(endAt) {
  const end = Date.parse(endAt || '');
  if (!Number.isFinite(end)) return 'Erneuert um 00:00 UTC';
  const remaining = Math.max(0, end - Date.now());
  const days = Math.floor(remaining / 86400000), hours = Math.floor(remaining % 86400000 / 3600000), minutes = Math.floor(remaining % 3600000 / 60000);
  return `${days ? `${days} T · ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · UTC`;
}
function progressionMissionCard(mission, period) {
  const current = Math.max(0, Number(mission.current) || 0), target = Math.max(1, Number(mission.target) || 1);
  const complete = mission.unlocked === true || current >= target;
  const reward = mission.reward || {};
  const xp = Number(typeof reward === 'number' ? reward : reward.passXp ?? mission.rewardXp ?? 0);
  return `<article class="progression-mission ${complete ? 'is-complete' : ''}"><div class="progression-mission-meta"><span>${complete ? '✓ ABGESCHLOSSEN' : period.toUpperCase()}</span><span>+${xp} PASS-XP</span></div><h3>${progressionEscape(mission.title || 'Mission')}</h3><p>${progressionEscape(mission.description || 'Schließe Einsätze ab, um Fortschritt zu sammeln.')}</p><div class="progression-progress-row"><progress max="${target}" value="${Math.min(current, target)}" aria-label="${progressionEscape(mission.title || 'Mission')}: ${current} von ${target}"></progress><strong>${Math.min(current, target)}<small> / ${target}</small></strong></div></article>`;
}
function progressionMissionSet(type) {
  const group = progressionChallenges()[type] || {};
  const missions = Array.isArray(group) ? group : group.missions || [];
  const key = group.key || group.date || group.week || '';
  const endAt = group.endsAt || '';
  const label = type === 'daily' ? 'Tägliche Einsätze' : 'Wöchentliche Ziele';
  const done = missions.filter(m => m.unlocked || Number(m.current) >= Number(m.target)).length;
  return `<section class="progression-panel"><header class="progression-panel-head"><div><span class="progression-overline">${type === 'daily' ? 'TÄGLICH' : 'WÖCHENTLICH'} · ${progressionEscape(key || 'UTC')}</span><h2>${label}</h2><p>Fortschritt zählt automatisch aus deinen abgeschlossenen Einsätzen.</p></div><div class="progression-reset"><span>ERNEUERT IN</span><strong>${progressionCountdown(endAt)}</strong><small>Zeitzone UTC</small></div></header><div class="progression-mission-grid">${missions.length ? missions.map(m => progressionMissionCard(m, type === 'daily' ? 'Heute' : 'Diese Woche')).join('') : `<div class="progression-empty"><strong>Neue Ziele stehen bereit.</strong><p>Deine nächste Missionenrotation wird hier angezeigt.</p></div>`}</div>${missions.length ? `<p class="progression-footnote">${done} von ${missions.length} Missionen abgeschlossen · Belohnungen fließen in deinen Battlepass.</p>` : ''}</section>`;
}
function progressionPermanent() {
  const all = progressionChallenges().permanent || [];
  const filtered = progressionFilteredPermanent(all);
  const pageSize = 12, visible = filtered.slice(0, (progressionPage + 1) * pageSize);
  return `<section class="progression-panel"><header class="progression-panel-head"><div><span class="progression-overline">LANGZEITZIELE · ${all.length} MISSIONEN</span><h2>Dein Weg zum Experten</h2><p>Langfristige Erfolge und Fachpraxis aus deinem gesamten Karriereverlauf.</p></div><div class="progression-count"><strong>${all.filter(m => m.unlocked || Number(m.current) >= Number(m.target)).length}</strong><span>von ${all.length} erledigt</span></div></header><div class="progression-toolbar"><label class="progression-search">Mission suchen<input type="search" id="progression-search" value="${progressionEscape(progressionQuery)}" placeholder="z. B. Linux, Hardware, DNS"></label><label>Status<select id="progression-filter"><option value="all" ${progressionFilter === 'all' ? 'selected' : ''}>Alle anzeigen</option><option value="open" ${progressionFilter === 'open' ? 'selected' : ''}>Offen</option><option value="done" ${progressionFilter === 'done' ? 'selected' : ''}>Abgeschlossen</option></select></label><span class="progression-result-count">${filtered.length} Treffer</span></div><div id="progression-results">${progressionPermanentResults(filtered, all, visible)}</div></section>`;
}
function progressionFilteredPermanent(all = progressionChallenges().permanent || []) {
  const query = progressionQuery.trim().toLocaleLowerCase('de');
  return all.filter(m => {
    const text = `${m.title || ''} ${m.description || ''} ${m.domain || ''}`.toLocaleLowerCase('de');
    const completed = m.unlocked || Number(m.current) >= Number(m.target);
    return (!query || text.includes(query)) && (progressionFilter === 'all' || (progressionFilter === 'done') === completed);
  });
}
function progressionPermanentResults(filtered, all, visible = filtered.slice(0, (progressionPage + 1) * 12)) {
  return `<div class="progression-permanent-grid">${visible.length ? visible.map(m => progressionMissionCard(m, m.domain || 'Dauerhaft')).join('') : `<div class="progression-empty"><strong>${all.length ? 'Keine Missionen für diese Suche.' : 'Deine Langzeitziele erscheinen hier.'}</strong><p>${all.length ? 'Passe Suchbegriff oder Statusfilter an.' : 'Arbeite an echten Einsätzen, um deine Sammlung aufzubauen.'}</p></div>`}</div>${visible.length < filtered.length ? `<button class="progression-load-more" data-progression-more>Weitere Missionen laden <span>${visible.length} / ${filtered.length}</span></button>` : ''}`;
}
function progressionPassBonus(tier) {
  const bonuses = (tier.rewards || []).slice(1);
  if (!bonuses.length) return '';
  return `<section class="pass-bonus-rewards"><small>+ ZUSÄTZLICHE BELOHNUNG</small>${bonuses.map(reward => `<div class="pass-bonus-item">${progressionRewardArt(reward, true)}<div><h5>${progressionEscape(reward.name)}</h5><p>${progressionEscape(reward.presentation || reward.description || '')}</p></div></div><div class="pass-bonus-actions">${reward.kind === 'currency' ? tier.unlocked ? '<span class="fine-print">✓ Automatisch im Arkanstaubkonto</span><button class="progression-equip" data-view="casino">Zum Spinwheel →</button>' : '' : tier.unlocked ? progressionEquipButton(reward) : ''}${typeof passExtraPreviewButton === 'function' ? passExtraPreviewButton(reward) : ''}</div>`).join('')}</section>`;
}
function progressionPass() {
  const pass = progressionGame().battlepass || {}, tiers = pass.tiers || [];
  const level = Number(pass.level) || 0, xp = Number(pass.xp) || 0;
  const currentPage = Math.min(Math.max(0, Math.ceil(tiers.length / 4) - 1), Math.floor(level / 4));
  const page = Math.max(0, Math.min(Math.ceil(tiers.length / 4) - 1, progressionPassPage ?? currentPage));
  const visible = tiers.slice(page * 4, (page + 1) * 4);
  return `<section class="progression-panel pass-paged"><header class="progression-pass-hero"><div><span class="progression-overline">DEINE EINSÄTZE. DEINE BELOHNUNGEN.</span><h2>Battlepass</h2><span class="pass-reward-count">${pass.rewardCount || tiers.length} BELOHNUNGEN · ${tiers.length} STUFEN</span><p>Spiele Einsätze und erfülle Missionen für Pass-EP. Jede erreichte Stufe schaltet zwei Belohnungen frei. Looks & Effekte findest du im Profil, Arkanstaub landet automatisch im Konto.</p><div class="progression-pass-level"><span>STUFE <strong>${level}</strong> / ${tiers.length}</span><span>${xp.toLocaleString('de-AT')} PASS-EP</span></div><progress max="100" value="${Number(pass.progress) || 0}" aria-label="Battlepassfortschritt"></progress></div><div class="pass-seal" aria-hidden="true"><span>STUFE</span><strong>${level}</strong></div></header><div class="progression-tier-heading"><div class="pass-destinations"><button class="text-button" data-view="missions">Pass-EP verdienen →</button><button class="text-button" data-pass-collection>Meine Looks & Effekte →</button></div><div><span class="progression-overline">SEITE ${page + 1} VON ${Math.max(1, Math.ceil(tiers.length / 4))}</span><h3>Stufen ${page * 4 + 1}–${Math.min(tiers.length, (page + 1) * 4)}</h3></div></div>${progressionPassNavigation(tiers, page, currentPage)}<div class="progression-tier-grid">${visible.map(t => `<article class="progression-tier pass-reward-${progressionRarity[t.reward?.rarity]?.[1] || 'common'} ${t.unlocked ? 'earned' : ''} ${Number(t.level) === level + 1 ? 'next-tier' : ''}"><span class="tier-number">STUFE ${t.level}</span><div class="pass-reward-preview">${progressionRewardArt(t.reward || {})}</div><h4>${progressionEscape(progressionRewardName(t.reward || {}))}</h4><div>${progressionRarityMarkup(t.reward || {})}</div><p class="reward-presentation">${progressionEscape(t.reward?.presentation || 'Profilbelohnung')}</p><p class="tier-unlock">${t.unlocked ? '✓ Freigeschaltet' : `Ab ${Number(t.requiredXp || 0).toLocaleString('de-AT')} Pass-EP`}</p>${t.unlocked ? progressionEquipButton(t.reward || {}) : ''}${progressionPassBonus(t)}</article>`).join('')}</div>${progressionPassNavigation(tiers, page, currentPage)}</section>`;
}
function progressionMastery() {
  const accountMasteries = progressionGame().masteries || [];
  const character = progressionMasteryCharacter();
  const masteries = progressionPersonalMasteries(character?.id);
  const forms = progressionCompanionForms(character?.id);
  return `<section class="progression-panel personal-mastery"><header class="progression-panel-head"><div><span class="progression-overline">TECHNISCHE PRAXIS · DEIN FORTSCHRITT</span><h2>Meistere dein Handwerk</h2><p>Jede Form gibt es einmal pro Begleiter. Titel und Abzeichen verdienst du weiterhin in den einzelnen Fachgebieten.</p></div></header>${progressionMasteryAnimals()}<section class="companion-forms" id="mastery-forms" tabindex="-1"><div class="mastery-view-caption"><strong>${progressionEscape(character?.name || 'Begleiter')} · eigene Formen</strong><span>Alle Fachgebiete zählen zusammen. Jedes gelöste Ticket zählt einmal.</span></div><p class="forms-total">${Number(forms?.solved || 0).toLocaleString('de-AT')} eigene Fälle · ${Number(forms?.hardSolved || 0).toLocaleString('de-AT')} auf Stufe 4+ · Nur Einsätze mit diesem Tier zählen.</p><div class="companion-forms-grid">${forms ? progressionEternalMastery(forms) : ''}</div></section><div class="mastery-view-caption"><strong>Deine Fachgebiete</strong><span>Eigene Fallzahlen und gemeinsame Titel & Abzeichen</span></div><div class="progression-mastery-grid">${masteries.map(m => {
    const account = accountMasteries.find(item => item.id === m.id);
    const title = account && { id: `title-lord-${m.id}`, name: account.titleName, kind: 'title', rarity: 'mythic' };
    return `<article class="progression-mastery" id="mastery-${progressionEscape(m.id)}" tabindex="-1"><div class="mastery-specialty-art">${progressionMasteryBonus(m)}</div><div class="mastery-copy"><span class="progression-overline">${progressionEscape(character?.name || 'Begleiter')} · ${Number(m.solved) || 0} EIGENE FÄLLE</span><h3>${progressionEscape(m.name)}</h3>${m.description ? `<p>${progressionEscape(m.description)}</p>` : ''}<p>${Number(m.hardSolved) || 0} davon auf Stufe 4+. Diese Fälle zählen auch für die Formen oben.</p></div>${account ? `<section class="mastery-account"><span class="progression-overline">DEINE GEMEINSAME FACHMEISTERUNG</span><p>${account.solved} Fälle insgesamt · ${account.hardSolved} auf Stufe 4+. Dieser Fortschritt zählt für Titel und Abzeichen.</p><div class="mastery-account-title">${progressionTitleMarkup(title)}${account.lordUnlocked ? progressionEquipButton(title) : '<small>Titel ab 50 Fällen, davon 10 auf Stufe 4+.</small>'}</div>${progressionMasteryBadges(account)}</section>` : ''}</article>`;
  }).join('')}</div></section>`;
}
function progressionEternalMastery(mastery) {
  const character = mastery.character || progressionMasteryCharacter()?.id || 'snake';
  return [
    ['lord', 'Lord', 'DEINE ERSTE FORM', { solved: 50, hardSolved: 10 }, 'Das Lord-Portrait deines Begleiters.'],
    ['silver', 'Silber-Lord', 'NACH LORD · SILBERRAHMEN', { solved: 100, hardSolved: 25 }, 'Dein Lord-Portrait mit silbernem Rahmen.'],
    ['gold', 'Ultimativer Gold-Lord', 'NACH SILBER · GOLDRAHMEN', { solved: 200, hardSolved: 60 }, 'Dein Lord-Portrait mit leuchtendem Goldrahmen.'],
    ['eternal', 'Ewiger Lord', 'NACH GOLD · ANIMIERTER RAHMEN', { solved: 1000, hardSolved: 400 }, 'Dein Lord-Porträt bleibt still. Ein heller türkisfarbener Rahmen pulsiert außen um das Tier.'],
    ['astral', 'Astral-Lord', 'NACH EWIG · BEWEGTES PORTRAIT', { solved: 2500, hardSolved: 1000 }, 'Dein Lord-Porträt schwebt vor einem festen Hintergrund. Ein gold-violetter Rahmen und leuchtende Funken umgeben das Tier.'],
  ].map(([frame, name, label, fallback, description]) => {
    const required = (frame === 'lord' ? mastery.lordRequirements : mastery.prestigeRequirements?.[frame]) || fallback;
    const reward = { id: `portrait-${character}-lord${frame === 'lord' ? '' : '-' + frame}`, name, kind: 'portrait',
      character, variant: 'lord', frame, companionForm: true, rarity: 'mythic' };
    const owned = progressionRewardOwned(reward);
    return `<section class="eternal-mastery tier-${frame} ${owned ? 'earned' : ''}" aria-label="${name} für ${progressionEscape(progressionCharacterById(character)?.name)}">${progressionRewardArt(reward)}<div><span class="progression-overline">${label}</span><h3>${progressionEscape(progressionCharacterById(character)?.name || 'Begleiter')} · ${name}</h3><p>${description}</p><div class="eternal-requirements"><span class="${mastery.solved >= required.solved ? 'met' : ''}"><b>${Math.min(mastery.solved, required.solved).toLocaleString('de-AT')} / ${required.solved.toLocaleString('de-AT')}</b> eigene Fälle</span><span class="${mastery.hardSolved >= required.hardSolved ? 'met' : ''}"><b>${Math.min(mastery.hardSolved, required.hardSolved).toLocaleString('de-AT')} / ${required.hardSolved.toLocaleString('de-AT')}</b> davon auf Stufe 4+</span></div>${owned ? progressionEquipButton(reward) : `<small class="eternal-lock">${mastery[frame + 'Unlocked'] ? 'Rahmen verdient · Basisbegleiter noch nicht freigeschaltet.' : 'Gesperrt · beide Ziele mit diesem Tier erfüllen.'}</small>`}</div></section>`;
  }).join('');
}
function progressionCollection() {
  const inventory = progressionInventory();
  const game = progressionGame();
  const passRewards = (game.battlepass?.tiers || []).map(t => ({ ...(t.reward || {}), unlocked: !!t.unlocked }));
  const speciesPreviews = progressionCharactersCatalog().map(c => ({
    id: `portrait-${c.id}-base`, name: c.name, kind: 'portrait', character: c.id,
    variant: 'base', rarity: c.rarity || 'common', unlockLevel: c.unlockLevel,
    description: c.secret ? 'Geheimer Begleiter. Formen und Rahmen erhältst du über Meisterungen.' : c.unlockLevel ? `Basisportrait ab Battlepassstufe ${c.unlockLevel}. Rahmen gibt es über Meisterungen.` : 'Starter-Begleiter; sofort verfügbar. Rahmen gibt es über Meisterungen.',
  }));
  const formRewards = progressionCharactersCatalog().filter(c => !progressionSecretLocked(c.id)).flatMap(character => {
    const m = progressionCompanionForms(character.id);
    if (!m) return [];
    return ['lord','silver','gold','eternal','astral'].map(tier => {
      const required = tier === 'lord' ? m.lordRequirements : m.prestigeRequirements[tier];
      const name = {lord:'Lord',silver:'Silber-Lord',gold:'Ultimativer Gold-Lord',eternal:'Ewiger Lord',astral:'Astral-Lord'}[tier];
      return {id:`portrait-${character.id}-lord${tier === 'lord' ? '' : '-' + tier}`, name:`${character.name} · ${name}`,kind:'portrait',character:character.id,variant:'lord',frame:tier,companionForm:true,rarity:'mythic',description:`Mit diesem Begleiter insgesamt ${required.solved} Fälle lösen, davon ${required.hardSolved} auf Stufe 4+. Alle Fachgebiete zählen zusammen.`};
    });
  });
  const lordRewards = (game.masteries || []).flatMap(m => {
    const requirements = {
      lord: m.lordRequirements || { solved: 50, hardSolved: 10 },
      silver: m.prestigeRequirements?.silver || { solved: 100, hardSolved: 25 },
      gold: m.prestigeRequirements?.gold || { solved: 200, hardSolved: 60 },
      eternal: m.prestigeRequirements?.eternal || { solved: 1000, hardSolved: 400 },
      astral: m.prestigeRequirements?.astral || { solved: 2500, hardSolved: 1000 },
    };
    const requirementText = tier => `${requirements[tier].solved} gelöste Fälle, davon ${requirements[tier].hardSolved} auf Stufe 4+.`;
    return [
      { id: `title-lord-${m.id}`, name: m.titleName || 'Ascendant', kind: 'title', masteryId: m.id, rarity: 'mythic', description: requirementText('lord') },
      ...['lord', 'silver', 'gold'].map(tier => ({
        id: tier === 'lord' ? `badge-lord-${m.id}` : `badge-lord-${m.id}-${tier}`,
        name: `${m.name || m.id} · ${tier === 'gold' ? 'Ultimatives Gold-Siegel' : tier === 'silver' ? 'Silber-Lord-Siegel' : 'Lord-Siegel'}`,
        kind: 'badge', masteryId: m.id, masteryTier: tier, ...(tier === 'lord' ? {} : { frame: tier }), rarity: 'mythic', description: requirementText(tier),
      })),
    ];
  });
  const known = [...inventory, ...(game.arcane?.segments || []).map(s => s.reward).filter(Boolean), ...passRewards, ...speciesPreviews, ...formRewards, ...lordRewards].filter((r, i, a) => r.id && a.findIndex(x => x.id === r.id) === i)
    .map(r => ({ ...r, unlocked: progressionRewardOwned(r) }));
  const filtered = known.filter(r => progressionCollectionKind === r.kind &&
    (r.kind !== 'portrait' || progressionCollectionSpecies === 'all' || r.character === progressionCollectionSpecies) &&
    (progressionCollectionStatus === 'all' || (progressionCollectionStatus === 'owned') === r.unlocked));
  const visible = filtered.slice(0, (progressionCollectionPage + 1) * 12);
  const label = { title: 'Titel', badge: 'Abzeichen', portrait: 'Formen & Rahmen' }[progressionCollectionKind];
  return `<section class="progression-panel progression-collection ${progressionCollectionKind === 'portrait' ? 'portrait-gallery' : ''}"><header class="progression-panel-head"><div><span class="progression-overline">DEIN PROFIL ANPASSEN</span><h2>${label}</h2><p>Battlepass: Begleiter, Titel, Abzeichen und neue Looks & Effekte. Rahmen erhältst du über Meisterungen; bereits vorhandene Rahmen bleiben in deiner Sammlung.</p></div></header><div class="progression-toolbar"><label>Anzeigen<select id="profile-reward-status"><option value="owned" ${progressionCollectionStatus === 'owned' ? 'selected' : ''}>Freigeschaltet</option><option value="locked" ${progressionCollectionStatus === 'locked' ? 'selected' : ''}>Noch gesperrt</option><option value="all" ${progressionCollectionStatus === 'all' ? 'selected' : ''}>Alle</option></select></label>${progressionCollectionKind === 'portrait' ? `<label>Begleiter<select id="progression-species-filter"><option value="all" ${progressionCollectionSpecies === 'all' ? 'selected' : ''}>Alle Begleiter</option>${progressionCharactersCatalog().map(c => `<option value="${progressionEscape(c.id)}" ${progressionCollectionSpecies === c.id ? 'selected' : ''}>${progressionEscape(c.name)}</option>`).join('')}</select></label>` : ''}<span class="progression-result-count">${filtered.length} ${label}</span></div><div class="progression-reward-grid">${visible.length ? visible.map(r => progressionRewardCard(r, { locked: !r.unlocked })).join('') : '<div class="progression-empty"><strong>Hier sind noch keine Belohnungen vorhanden.</strong><p>Unter „Noch gesperrt“ findest du die Voraussetzungen zum Freischalten.</p></div>'}</div>${visible.length < filtered.length ? `<button class="progression-load-more" data-progression-collection-more>Weitere anzeigen <span>${visible.length} / ${filtered.length}</span></button>` : ''}</section>`;
}
function profileQuickButton() {
  return `<button class="profile-quick" data-view="profile" ${currentView === 'profile' ? 'aria-current="page"' : ''} aria-label="Dein Profil öffnen">${equippedCharacter()}<span><b>Dein Profil</b><small>${equippedTitleMarkup() || 'Begleiter & Ausrüstung'}</small></span>${equippedBadge()}</button>`;
}
function progressionUnlock(reward) {
  if (String(reward.id || '').includes('-arcane-')) return '<div class="reward-unlock"><small>Im Arcane Spinwheel zu finden.</small><button class="progression-equip" data-view="casino">Zum Arcane Casino →</button></div>';
  const game = progressionGame();
  if (reward.kind === 'portrait' && progressionSecretLocked(reward.character)) {
    return '<div class="reward-unlock secret-unlock"><small>Freischaltung unbekannt.</small><span>Manche Legenden hinterlassen keine Anleitung.</span></div>';
  }
  const baseMissing = reward.kind === 'portrait' && !progressionInventory().some(r => r.id === `portrait-${reward.character}-base`);
  const tier = (game.battlepass?.tiers || []).find(t => (t.rewards || [t.reward]).some(r => r?.id === (baseMissing ? `portrait-${reward.character}-base` : reward.id)));
  if (tier) return `<div class="reward-unlock"><small>Battlepass · Stufe ${tier.level} · noch ${Math.max(0, Number(tier.requiredXp || 0) - Number(game.battlepass?.xp || 0)).toLocaleString('de-AT')} Pass-EP</small><button class="progression-equip" data-unlock-pass="${tier.level}">Im Battlepass ansehen →</button></div>`;
  if (reward.companionForm) return `<div class="reward-unlock"><small>Begleiter-Meisterung · alle Fachgebiete</small><button class="progression-equip" data-unlock-mastery="forms" data-unlock-character="${progressionEscape(reward.character)}">Voraussetzungen ansehen →</button></div>`;
  if (reward.masteryId) {
    const mastery = (game.masteries || []).find(m => m.id === reward.masteryId);
    return `<div class="reward-unlock"><small>Meisterung · ${progressionEscape(mastery?.name || reward.masteryId)}</small><button class="progression-equip" data-unlock-mastery="${progressionEscape(reward.masteryId)}" ${reward.kind === 'portrait' ? `data-unlock-character="${progressionEscape(reward.character)}"` : ''}>Voraussetzungen ansehen →</button></div>`;
  }
  return '<div class="reward-unlock"><small>Wird durch deinen Karrierefortschritt freigeschaltet.</small><button class="progression-equip" data-view="missions">Zu den Missionen →</button></div>';
}
function companionPassiveDefinition(characterId) {
  if (typeof TicketPassives === 'undefined' || progressionSecretLocked(characterId)) return null;
  return TicketPassives.catalog[characterId] || null;
}
function companionPassivePreview(character) {
  const passive = companionPassiveDefinition(character?.id);
  if (!passive) return '';
  return `<div class="ability-preview passive-preview">${companionAbilityIcon(character.id)}<div><span>PASSIV · AUTOMATISCH</span><strong>${progressionEscape(passive.name)}</strong><p>${progressionEscape(passive.description)}</p></div></div>`;
}
function companionPassiveResults() {
  const companion = progressionGame().companion;
  if (!companionPassiveDefinition(companion?.activeId)) return '';
  const result = TicketPassives.analyze(companion.activeId, { session: state.session, draft });
  return `<ul class="passive-observations">${result.items.map(item => `<li class="passive-${['attention', 'good'].includes(item.tone) ? item.tone : 'neutral'}"><strong>${progressionEscape(item.label)}</strong><span>${progressionEscape(item.text)}</span>${item.evidence ? `<small>${progressionEscape(item.evidence)}</small>` : ''}</li>`).join('')}</ul>${result.note ? `<small class="passive-analysis-note">${progressionEscape(result.note)}</small>` : ''}`;
}
function companionPassivePanel() {
  const companion = progressionGame().companion;
  const passive = companionPassiveDefinition(companion?.activeId);
  if (!passive || !active()) return '';
  return `<section class="companion-passive" aria-label="Passive Begleiterhilfe"><div class="passive-heading"><span class="ability-symbol">${companionAbilityIcon(companion.activeId)}</span><div><small>PASSIV · AUTOMATISCH AKTIV</small><h3>${progressionEscape(passive.name)}</h3></div></div><p>${progressionEscape(passive.description)}</p><div class="companion-passive-output">${companionPassiveResults()}</div></section>`;
}
function renderCompanionPassive() {
  for (const output of document.querySelectorAll('.companion-passive-output')) output.innerHTML = companionPassiveResults();
}

function companionAbilityIcon(characterId) {
  const paths = {
    snake: '<path d="M9 5c-8 0-8 8-1 8h8c7 0 7 8-1 8M9 5h7l5 3-5 3H9M17 7h.01"/>',
    wolf: '<path d="m4 4 7 5h2l7-5-2 13-6 5-6-5zM8 13h1m6 0h1m-6 4h4"/>',
    dragon: '<path d="M13 2c1 6-7 7-7 13a6 6 0 0 0 12 0c0-3-2-5-2-5s0 4-3 4c3-5 2-8 0-12z"/>',
    'snake-coral': '<path d="m4 5 5 14 3-8 3 8 5-14M4 5h5m6 0h5"/>',
    fox: '<path d="m3 3 9 6 9-6-3 14-6 5-6-5zM6 10l5 7m7-7-5 7m-3 0h4"/>',
    'wolf-night': '<path d="M18 3a9 9 0 1 0 3 15A10 10 0 0 1 18 3zM6 11l3 2 4-1-3 5-4-2z"/>',
    raven: '<path d="m2 7 9 4 2-6 4-2 1 5 4 2-6 3-2 6-4 3 1-7-6-2z"/>',
    'dragon-frost': '<path d="M12 2v20M3 7l18 10M3 17 21 7M8 4l4 4 4-4M8 20l4-4 4 4M3 11l5-1-1-5m14 8-5 1 1 5M3 13l5 1-1 5m14-8-5-1 1-5"/>',
    chimera: '<path d="m12 2 10 18H2zM12 8l5 9H7zM12 2v6M2 20l5-3m15 3-5-3"/>',
  };
  return `<svg class="ability-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[characterId] || paths.dragon}</svg>`;
}
function companionAbilityPreview(character) {
  const ability = character?.ability;
  if (!ability) return '';
  return `<div class="ability-preview">${companionAbilityIcon(character.id)}<div><span>AKTIVE FÄHIGKEIT</span><strong>${progressionEscape(ability.name)}</strong><p>${progressionEscape(ability.description)}</p><small>Cooldown: ${ability.cooldownMinutes} simulierte Arbeitsminuten</small></div></div>`;
}
function companionAbilityPanel(compact = false) {
  const companion = progressionGame().companion;
  const ability = companion?.ability || companion?.current?.ability;
  if (!ability) return '';
  const remaining = Math.max(0, Number(ability.remainingMinutes) || 0);
  const cooldown = Math.max(1, Number(ability.cooldownMinutes) || 1);
  const minutes = (Math.ceil(remaining * 10) / 10).toLocaleString('de-AT');
  const status = ability.active ? `AKTIV · NÄCHSTE LÖSUNG${remaining > 0 ? ` · ${minutes} MIN. COOLDOWN` : ''}` : remaining > 0 ? `COOLDOWN · ${minutes} MIN.` : 'BEREIT';
  const label = ability.active ? 'Fähigkeit ist aktiv' : remaining > 0 ? `Noch ${minutes} Min. Cooldown` : ability.canActivate ? 'Fähigkeit einsetzen' : 'Im Einsatz verfügbar';
  return `<section class="companion-ability ${compact ? 'ability-compact' : ''} ${ability.active ? 'ability-active' : ''}" aria-label="Begleiterfähigkeit"><div class="ability-heading"><span class="ability-symbol">${companionAbilityIcon(companion.activeId)}</span><div><small>${compact ? 'FÄHIGKEIT' : progressionEscape(companion.current?.name || 'BEGLEITER')}</small><h3>${progressionEscape(ability.name)}</h3></div></div>${compact ? '' : `<p class="ability-description">${progressionEscape(ability.description)}</p>`}<span class="ability-status" role="status">${status}</span><progress max="${cooldown}" value="${cooldown - Math.min(cooldown, remaining)}" aria-label="Cooldown: noch ${remaining} simulierte Arbeitsminuten"></progress><button class="button ability-activate" data-action="companion-ability" ${!ability.canActivate || isBusy() ? 'disabled' : ''}>${companionAbilityIcon(companion.activeId)}<span>${label}</span></button>${!compact ? `<small class="ability-note">${progressionEscape(ability.blockedReason || (ability.active ? 'Der Bonus wird bei der nächsten Lösung geprüft.' : 'Cooldown läuft mit deinen simulierten Arbeitsminuten.'))}</small>` : ''}</section>`;
}

function companionChoices(first = false) {
  const companion = progressionGame().companion || {}, chosenId = companion.activeId;
  return `<div class="section-head"><h2>${first ? 'Wer begleitet dich?' : 'Begleiter wechseln'}</h2><span>${first ? 'Drei Begleiter sind sofort verfügbar' : 'Stufe und EP bleiben für jedes Tier erhalten'}</span></div><div class="companion-choices">${progressionCharactersCatalog().filter(c => !first || c.unlockLevel === 0).map(c => {
    const id = `portrait-${c.id}-base`, reward = { id, kind: 'portrait', character: c.id };
    const owned = progressionRewardOwned(reward), selected = !first && chosenId === c.id;
    const info = companion.characters?.find(item => item.id === c.id);
    const lockedSwitch = !first && !companion.canSwitch && chosenId !== c.id;
    if (c.secret && !owned) return `<article class="companion-choice locked secret-choice"><div class="companion-choice-art">${progressionSecretArt()}<span>GEHEIM</span></div><div class="companion-choice-copy"><span class="secret-label">UNBEKANNTE IDENTITÄT</span><h3>???</h3><p>Ein Wesen jenseits der bekannten Begleiter. Nur außergewöhnliche Taten können sein Siegel brechen.</p>${progressionUnlock(reward)}</div></article>`;
    return `<article class="companion-choice ${selected ? 'selected' : ''} ${!owned ? 'locked' : ''}"><div class="companion-choice-art">${progressionPixelSprite(c.id)}<span>${selected ? 'AKTIV' : owned ? 'FREIGESCHALTET' : 'GESPERRT'}</span></div><div class="companion-choice-copy"><h3>${progressionEscape(c.name)}</h3><p>${progressionEscape(info?.affinities?.join(' · ') || 'Begleitet deine Einsätze')}</p>${companionAbilityPreview(info || c)}${companionPassivePreview(info || c)}${owned ? `<strong>Stufe ${info?.level || 1} <small>· ${info?.xp || 0} EP</small></strong><progress max="100" value="${info?.progress || 0}" aria-label="${progressionEscape(c.name)}: Fortschritt"></progress><button class="button ${selected ? '' : 'primary'}" data-progression-equip="portrait" data-reward-id="${id}" aria-pressed="${selected}" ${progressionBusy || isBusy() || selected || lockedSwitch ? 'disabled' : ''}>${selected ? 'Aktiver Begleiter' : lockedSwitch ? (companion.current?.switchUnlocked ? 'Einsatz zuerst beenden' : `Wechsel ab Stufe ${companion.switchLevel || 20}`) : first ? `${progressionEscape(c.name)} wählen` : 'Begleiter wechseln'}</button>` : progressionUnlock(reward)}</div></article>`;
  }).join('')}</div>`;
}
function companionProfile() {
  const game = progressionGame(), first = game.companionChosen === false, companion = game.companion || {};
  const current = companion.current;
  if (first) return `<section class="companion-profile"><header class="profile-heading"><span class="progression-overline">DEIN ERSTER SCHRITT</span><h1>Wähle deinen Begleiter.</h1><p>Schlange, Wolf oder Drache: Dein Trainingspartner sammelt mit dir Erfahrung. Auf Stufe 20 kannst du den nächsten Begleiter wählen. Dein Tier levelt danach unbegrenzt weiter.</p></header>${companionChoices(true)}</section>`;
  const selectedBadge = progressionInventory().find(r => r.kind === 'badge' && progressionEquipped(r));
  return `<section class="companion-profile"><header class="profile-heading"><div><span class="progression-overline">DEIN STIL · DEINE ERFOLGE</span><h1>Dein Profil</h1><p>Begleiter, Ausrüstung, Looks und Effekte. Alles an einem Ort.</p></div><a class="text-button" href="#career">Karrierestatistik →</a></header>${typeof passExtraBanner === 'function' ? passExtraBanner() : ''}<div class="profile-showcase"><div class="profile-portrait">${equippedCharacter('hero')}</div><div class="profile-details"><span class="progression-overline">DEIN AKTIVER BEGLEITER</span><h2>${progressionEscape(progressionEquippedCharacterName())}</h2><div class="profile-equipped"><span><small>TITEL</small>${equippedTitleMarkup() || 'Kein Titel'}</span><span>${equippedBadge()}<span><small>ABZEICHEN</small>${progressionEscape(selectedBadge?.name || 'Kein Abzeichen')}</span></span></div><p class="companion-affinities">+50 % Begleiter-EP: ${progressionEscape(current?.affinities?.join(' · ') || 'Passende Fachgebiete')}</p><div class="profile-level"><strong>Stufe ${current?.level || 1} <small>· ohne Limit</small></strong><span>${current?.remainingXp ?? 600} EP bis zum Aufstieg</span></div><progress max="100" value="${current?.progress || 0}" aria-label="Begleiterfortschritt"></progress><p class="profile-switch-note">${progressionEscape(companion.switchReason || 'Erreiche Stufe 20, um deinen Begleiter zwischen Einsätzen zu wechseln.')}</p></div></div>${companionAbilityPanel()}${companionPassivePanel()}<nav class="profile-tabs" aria-label="Profil anpassen">${[['companions','Begleiter'],['title','Titel'],['badge','Abzeichen'],['portrait','Formen & Rahmen'],['extras','Looks & Effekte']].map(([id,label]) => `<button data-profile-tab="${id}" ${profileTab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav><div id="profile-content">${profileTab === 'companions' ? companionChoices() : profileTab === 'extras' && typeof passExtrasCollection === 'function' ? passExtrasCollection() : progressionCollection()}</div></section>`;
}
function renderCompanionDock() {
  const dock = document.querySelector('#companion-dock');
  if (!dock) return;
  dock.hidden = false;
  const first = progressionGame().companionChosen === false, current = progressionGame().companion?.current;
  replaceHtml(dock, `<button class="companion-dock-button" data-view="profile" aria-label="Profil öffnen und Begleiter ansehen">${first ? '<span class="companion-placeholder">?</span>' : equippedCharacter('dock')}<span class="dock-caption"><small>${first ? 'DEIN PROFIL' : 'DEIN BEGLEITER'}</small><strong>${first ? 'Begleiter wählen' : progressionEscape(progressionEquippedCharacterName())}</strong>${first ? '<span>Hier beginnt eure Reise</span>' : `<span>Stufe ${current?.level || 1} · ${Number(current?.xp || 0).toLocaleString('de-AT')} EP</span><progress max="100" value="${current?.progress || 0}" aria-label="Begleiterfortschritt"></progress><span>${current?.remainingXp ?? 600} EP bis zum Aufstieg</span>`}</span></button>${!first && active() ? companionAbilityPanel(true) : ''}`);
}

function progressionPassNavigation(tiers, page, currentPage) {
  const pages = Math.max(1, Math.ceil(tiers.length / 4));
  return `<nav class="pass-pagination" aria-label="Battlepass-Seiten"><button data-pass-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Vorherige Seite">←</button><div>${Array.from({ length: pages }, (_, i) => `<button data-pass-page="${i}" ${i === page ? 'aria-current="page"' : ''} aria-label="Seite ${i + 1}, Stufen ${i * 4 + 1} bis ${Math.min(tiers.length, i * 4 + 4)}">${i + 1}</button>`).join('')}</div><button data-pass-page="${page + 1}" ${page === pages - 1 ? 'disabled' : ''} aria-label="Nächste Seite">→</button><button class="pass-current" data-pass-page="${currentPage}">Zu meiner Stufe</button></nav>`;
}

function progressionHub() {
  const content = ({ daily: () => progressionMissionSet('daily'), weekly: () => progressionMissionSet('weekly'), permanent: progressionPermanent })[progressionTab]?.() || progressionMissionSet('daily');
  return `<section class="progression-hub" aria-label="Missionen"><header class="profile-heading"><div><span class="progression-overline">DEINE NÄCHSTEN ZIELE</span><h1>Missionen</h1><p>Schließe Einsätze ab und sammle automatisch Pass-EP.</p></div><button class="text-button" data-view="battlepass">Zum Battlepass →</button></header><nav class="progression-tabs" aria-label="Missionszeitraum">${progressionTabs.map(([id, title]) => `<button data-progression-tab="${id}" class="${progressionTab === id ? 'active' : ''}" ${progressionTab === id ? 'aria-current="page"' : ''}>${title}</button>`).join('')}</nav><div class="progression-tab-content" id="progression-content">${content}</div></section>`;
}
function progressionEquippedCharacter(size = 'small') {
  const selected = progressionInventory().find(r => r.kind === 'portrait' && progressionEquipped(r) && progressionRewardOwned(r));
  const frame = selected?.frame || selected?.variant || 'base';
  const breakout = progressionCharacterBreakout(selected?.character, frame);
  return `<span class="progression-avatar avatar-${size} frame-${progressionEscape(frame)} ${selected?.variant === 'lord' ? 'lord-portrait' : ''} ${breakout ? `character-breakout breakout-${progressionEscape(selected.character)}` : ''}">${breakout || (selected ? progressionPixelSprite(selected.character, selected.variant === 'lord') : '')}${progressionFrameEffect(frame)}</span>`;
}
function equippedCharacter(size = 'small') { return progressionEquippedCharacter(size); }
function progressionEquippedCharacterName() {
  const selected = progressionInventory().find(r => r.kind === 'portrait' && progressionEquipped(r) && progressionRewardOwned(r));
  return selected ? progressionRewardName(selected) : 'Schlange';
}
function equippedTitle() {
  const title = progressionInventory().find(r => r.kind === 'title' && progressionEquipped(r));
  return title?.name || '';
}
function equippedBadge() {
  const badge = progressionInventory().find(r => r.kind === 'badge' && progressionEquipped(r) && progressionRewardOwned(r));
  return badge ? progressionBadgeArt(badge, true) : '';
}
function careerRanks() {
  return progressionGame().ranked?.ranks || levels.flatMap((baseName, tierIndex) =>
    [1, 2, 3].map(division => ({ name: `${baseName} ${division}`, baseName, division,
      index: tierIndex * 3 + division - 1, tierIndex, level: tierIndex + 1 })));
}
function careerRankTrack() {
  const rank = progressionGame().ranked || { index: 0 };
  const ranks = careerRanks();
  return `<div class="level-track">${levels.map((name, tierIndex) => {
    const divisions = ranks.filter(item => item.tierIndex === tierIndex);
    const current = divisions.some(item => item.index === rank.index);
    return `<div class="level-step ${current ? 'current' : ''}"><span class="level-number">${String(tierIndex + 1).padStart(2, '0')}</span><div class="career-tier-copy">${progressionEscape(name)}<div class="career-divisions">${divisions.map(item => `<span class="career-division ${item.index === rank.index ? 'current' : item.index < rank.index ? 'completed' : ''}" ${item.index === rank.index ? 'aria-current="step"' : ''} aria-label="${progressionEscape(item.name)}${item.index === rank.index ? ', dein aktueller Rang' : ''}">${item.division}</span>`).join('')}</div>${current ? `<small>Dein aktueller Rang: ${progressionEscape(divisions.find(item => item.index === rank.index).name)}</small>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function ranksScreen() {
  const rank = progressionGame().ranked || { index: 0, rr: 0, totalRr: 0 };
  const ranks = careerRanks();
  const step = rank.rules?.rrPerRank || 100;
  const current = ranks[rank.index] || ranks[0];
  const next = ranks[rank.index + 1];
  return `<section class="rank-gallery" aria-labelledby="rank-gallery-title">
    <div class="rank-gallery-top"><button class="text-button" data-view="menu">${icon('back')} Hauptmenü</button><span>CAREER MODE / RANGLISTE</span></div>
    <header class="rank-gallery-heading"><span class="eyebrow">DEIN WEG NACH OBEN</span><h1 id="rank-gallery-title">DIE EINSATZRÄNGE</h1><p>Sechs Ränge. Je drei Stufen. Dein Weg durch 18 Aufstiegsstufen.<br>100 RR pro Stufe · Nach Stufe 3 folgt der nächste Rang.</p></header>
    <ol class="rank-lineup" aria-label="Sechs Einsatzränge mit je drei Stufen">${levels.map((name, tierIndex) => {
      const divisions = ranks.filter(item => item.tierIndex === tierIndex);
      const item = divisions.find(item => item.index === rank.index) || divisions[0];
      const active = divisions.some(item => item.index === rank.index);
      return `<li class="rank-tier ${active ? 'is-current' : item.index < rank.index ? 'is-lower' : 'is-higher'}" ${active ? 'aria-current="step"' : ''}>
        <span class="rank-tier-number">RANG ${String(item.level).padStart(2, '0')}</span>
        <div class="rank-tier-emblem">${grandRankBadge(item)}</div>
        <h2>${progressionEscape(name)}</h2><ol class="rank-divisions" aria-label="Stufen von ${progressionEscape(name)}">${divisions.map(division => `<li class="rank-division ${division.index === rank.index ? 'is-current' : division.index < rank.index ? 'is-lower' : 'is-higher'}" ${division.index === rank.index ? 'aria-current="true"' : ''}><strong aria-label="${progressionEscape(division.name)}">${division.division}</strong><small>AB ${division.index * step} GESAMT-RR</small></li>`).join('')}</ol>
        <span class="rank-tier-state">${active ? `◆ DEINE STUFE ${item.division}` : item.index < rank.index ? 'UNTER DEINEM RANG' : divisions.some(item => item.index === rank.index + 1) ? 'NÄCHSTES ZIEL' : 'HÖHERER RANG'}</span>
      </li>`;
    }).join('')}</ol>
    <section class="rank-current" aria-label="Dein aktueller Rangfortschritt"><div><span class="eyebrow">DEIN AKTUELLER STAND</span><h2>${progressionEscape(current.name)}</h2><p>${next ? `Noch ${step - rank.rr} RR bis ${progressionEscape(next.name)}.` : 'Du hast den höchsten Einsatzrang erreicht.'}</p></div><div class="rank-current-meter"><div><strong>${rank.rr}<small> / ${step} RR</small></strong><span>${rank.totalRr} GESAMT-RR</span></div><progress max="${step}" value="${rank.rr}" aria-label="${rank.rr} von ${step} Rangpunkten"></progress><small>${next ? step + ' RR → Aufstieg' : rank.rr === step ? 'Maximaler Rangfortschritt erreicht' : 'Noch ' + (step - rank.rr) + ' RR bis zum Maximum'}</small></div></section>
    <details class="rank-gallery-info"><summary>So funktioniert der Aufstieg ${icon('arrow')}</summary><div class="rank-gallery-rules"><p><strong>Immer drei Stufen pro Rang.</strong> IT-Support 1 → 2 → 3 → Fortgeschrittener IT-Support 1. Je 100 RR steigst du eine Stufe auf; unter die Grenze fällst du zurück. Erst der nächste Hauptrang erhöht die Ticketstufe. Qualität, Sicherheit und Effizienz bestimmen deine Rangpunkte.</p><p><strong>Einfacher einsteigen, später mehr leisten.</strong> Auf Rang 1–3 gibt es ab 70 Punkten einen Einstiegsbonus und kleinere Abzüge. Ab Rang 4 bleiben Gewinne und Abzüge anspruchsvoll. Bestehende Spielstände behalten ihren Hauptrang und ihre RR innerhalb der ersten Stufe. Speedruns verändern deinen Einsatzrang nicht.</p></div></details>
  </section>`;
}

function grandRankBadge(rank) {
  const index = Math.max(0, Math.min(5, Number(rank?.tierIndex ?? Math.floor((rank?.index || 0) / 3)) || 0));
  const division = Math.max(1, Math.min(3, Number(rank?.division) || 1));
  const name = rank?.name || `${levels[index]} ${division}`;
  const stars = Array.from({ length: division }, () => '<i aria-hidden="true">✦</i>').join('');
  const crest = '<path class="rank-core" d="M33 21h44v6h6v30h-6v12h-6v12h-9v8H48v-8h-9V69h-6V57h-6V27h6z"/>'+
    (index>=1?'<path class="rank-wing" d="M27 33H9v12h6v12h6v12h12V57h-6zM83 33h18v12h-6v12h-6v12H77V57h6z"/>':'')+
    (index>=3?'<path class="rank-crown" d="M32 21V9h7v6h9V3h14v12h9V9h7v12h-7v6H39v-6z"/>':'')+
    (index>=4?'<path class="rank-orbit" d="M17 37V25h8V17h12M73 17h12v8h8v12M93 73v12h-8v8H73M37 93H25v-8h-8V73"/><rect class="rank-orbit-gem" x="12" y="51" width="7" height="7"/><rect class="rank-orbit-gem" x="91" y="51" width="7" height="7"/>':'')+
    (index===5?'<path class="rank-wing" d="M3 8h7v7h7v7h-7v7H3V15zM107 8h-7v7h-7v7h7v7h7V15zM3 81h7v7h7v7h-7v7H3V88zM107 81h-7v7h-7v7h7v7h7V88z"/>':'');
  return `<span class="grand-rank grand-rank-${index}" role="img" aria-label="Rang ${progressionEscape(name)}, Stufe ${division}"><svg viewBox="0 0 110 110" aria-hidden="true"><path class="rank-rim" d="M27 12h56v7h9v42h-7v14h-8v12h-9v8H42v-8h-9V75h-8V61h-7V19h9z"/>${crest}<path class="rank-gem" d="M49 33h12v12h12v12H61v12H49V57H37V45h12z"/></svg><span class="rank-stars">${stars}</span><strong>${division}</strong><small>${progressionEscape(name)}</small></span>`;
}

document.addEventListener('click', async event => {
  const masteryAnimal = event.target.closest('[data-mastery-character]');
  if (masteryAnimal) {
    progressionMasterySpecies = masteryAnimal.dataset.masteryCharacter;
    render(); document.querySelector(`[data-mastery-character="${progressionMasterySpecies}"]`)?.focus({ preventScroll: true }); return;
  }
  const profile = event.target.closest('[data-profile-tab]');
  if (profile) {
    profileTab = profile.dataset.profileTab;
    if (!['companions', 'extras'].includes(profileTab)) progressionCollectionKind = profileTab;
    if (profileTab === 'portrait') progressionCollectionSpecies = progressionGame().companion?.activeId || 'all';
    progressionCollectionPage = 0;
    render(); document.querySelector(`[data-profile-tab="${profileTab}"]`)?.focus({preventScroll:true}); return;
  }
  const unlockPass = event.target.closest('[data-unlock-pass]');
  if (unlockPass) { progressionPassPage = Math.max(0, Math.floor((Number(unlockPass.dataset.unlockPass) - 1) / 4)); navigate('battlepass'); main.scrollIntoView({block:'start'}); return; }
  const unlockMastery = event.target.closest('[data-unlock-mastery]');
  if (unlockMastery) {
    if (unlockMastery.dataset.unlockCharacter) progressionMasterySpecies = unlockMastery.dataset.unlockCharacter;
    navigate('mastery');
    const target = document.getElementById('mastery-' + unlockMastery.dataset.unlockMastery);
    target?.scrollIntoView({block:'center'}); target?.focus({preventScroll:true}); return;
  }
  const tab = event.target.closest('[data-progression-tab]');
  if (tab) { progressionTab = tab.dataset.progressionTab; progressionPage = 0; progressionCollectionPage = 0; render(); document.querySelector(`[data-progression-tab="${progressionTab}"]`)?.focus(); return; }
  if (event.target.closest('[data-progression-more]')) { progressionPage++; render(); document.querySelector('[data-progression-more]')?.focus(); return; }
  if (event.target.closest('[data-progression-collection-more]')) { progressionCollectionPage++; render(); document.querySelector('[data-progression-collection-more]')?.focus(); return; }
  const passPage = event.target.closest('[data-pass-page]');
  if (passPage && !passPage.disabled) { progressionPassPage = Number(passPage.dataset.passPage); render(); document.querySelector('.pass-pagination [aria-current="page"]')?.focus({preventScroll:true}); return; }
  const page = event.target.closest('[data-progression-page]');
  if (page && !page.disabled) { progressionPage = Math.max(0, progressionPage + (page.dataset.progressionPage === 'next' ? 1 : -1)); render(); return; }
  const equip = event.target.closest('[data-progression-equip]');
  if (equip && !equip.disabled && !progressionBusy && !(typeof isBusy === 'function' && isBusy())) {
    const kind = equip.dataset.progressionEquip, id = equip.dataset.rewardId;
    progressionBusy = true; equip.disabled = true;
    try {
      await mutate('cosmetics', { kind, id });
      if (progressionCosmetics()[kind] === id) { window.GameAudio?.play('equip'); window.ArcaneFX?.emit('spell'); }
    } finally { progressionBusy = false; render(); document.querySelector(`[data-reward-id="${id}"]`)?.focus({preventScroll:true}); }
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'progression-search') {
    progressionQuery = event.target.value; progressionPage = 0;
    const node = document.querySelector('#progression-results');
    if (node) node.innerHTML = progressionPermanentResults(progressionFilteredPermanent(), progressionChallenges().permanent || []);
  }
});
document.addEventListener('change', async event => {
  const cosmetic = event.target.closest('[data-profile-cosmetic]');
  if (cosmetic && !progressionBusy && !isBusy()) {
    const kind = cosmetic.dataset.profileCosmetic, id = cosmetic.value;
    progressionBusy = true;
    try { await mutate('cosmetics', {kind, id}); }
    finally { progressionBusy = false; render(); document.querySelector('[data-profile-cosmetic="'+kind+'"]')?.focus(); }
    return;
  }
  if (event.target.id === 'profile-reward-status') { progressionCollectionStatus = event.target.value; progressionCollectionPage = 0; render(); document.querySelector('#profile-reward-status')?.focus({preventScroll:true}); }
  if (event.target.id === 'progression-filter') { progressionFilter = event.target.value; progressionPage = 0; const node = document.querySelector('#progression-results'); if (node) node.innerHTML = progressionPermanentResults(progressionFilteredPermanent(), progressionChallenges().permanent || []); }
  if (event.target.id === 'progression-collection-kind') { progressionCollectionKind = event.target.value; progressionCollectionPage = 0; render(); document.querySelector('#progression-collection-kind')?.focus(); }
  if (event.target.id === 'progression-species-filter') { progressionCollectionSpecies = event.target.value; progressionCollectionPage = 0; render(); document.querySelector('#progression-species-filter')?.focus(); }
});
