'use strict';

const EXTRA_KINDS = Object.freeze(['scene', 'aura', 'trail', 'banner', 'finisher']);
const TYPES = {
  scene: { presentation: 'Menükulisse', names: ['Neonhafen', 'Kristallzitadelle', 'Sternenarchiv', 'Thron der Leere'], description: 'Eine eigene Kulisse für dein Hauptmenü. Im Profil ausrüsten oder jederzeit ablegen.' },
  aura: { presentation: 'Begleiteraura', names: ['Runenfunken', 'Frostsplitter', 'Phönixfeuer', 'Singularität'], description: 'Umhüllt deinen aktiven Begleiter mit einem sichtbaren Effekt. Funktioniert mit jedem freigeschalteten Tier.' },
  trail: { presentation: 'Cursorspur', names: ['Kometenschweif', 'Runenspur', 'Blitzfaden', 'Sternenriss'], description: 'Eine leuchtende Spur folgt deiner Maus. Deine Eingaben und Klicks bleiben frei bedienbar.' },
  banner: { presentation: 'Profilbanner', names: ['Sternenkarte', 'Aurora', 'Drachenschmiede', 'Ewiger Kosmos'], description: 'Ein eigenes Banner inszeniert dein Profil und deinen Begleiter.' },
  finisher: { presentation: 'Sieges-Finisher', names: ['Sternenregen', 'Runenexplosion', 'Phönix-Aufstieg', 'Weltenriss'], description: 'Feiert erfolgreich abgeschlossene Einsätze mit einer besonderen Animation. Verändert weder Bewertung noch Rangpunkte.' },
};

const BONUS_CATALOG = Object.freeze(Array.from({ length: 40 }, (_, index) => {
  const level = index + 1;
  if (level % 2) {
    const amount = 50 + Math.floor(level / 10) * 25;
    return Object.freeze({ id: `pass-dust-${level}`, kind: 'currency', name: `${amount} Arkanstaub`, amount,
      level, rarity: level >= 31 ? 'legendary' : level >= 21 ? 'epic' : level >= 11 ? 'rare' : 'common',
      presentation: 'Arkanstaub-Paket', description: `${amount} Arkanstaub für dein Spinwheel. Automatisch und einmalig im Kontostand enthalten.` });
  }
  const position = level / 2 - 1, kind = EXTRA_KINDS[position % EXTRA_KINDS.length], variant = Math.floor(position / EXTRA_KINDS.length) + 1;
  const type = TYPES[kind];
  return Object.freeze({ id: `pass-${kind}-${variant}`, name: type.names[variant - 1], kind, variant, level,
    rarity: ['rare', 'epic', 'legendary', 'mythic'][variant - 1],
    presentation: type.presentation, description: type.description });
}));

function bonusForTier(level) {
  const reward = BONUS_CATALOG.find(item => item.level === level);
  return reward ? { ...reward } : null;
}
function passDustAtLevel(level) {
  const safeLevel = Number.isInteger(level) ? Math.min(40, Math.max(0, level)) : 0;
  return BONUS_CATALOG.reduce((total, reward) => total + (reward.kind === 'currency' && reward.level <= safeLevel ? reward.amount : 0), 0);
}

module.exports = { EXTRA_KINDS, BONUS_CATALOG, bonusForTier, passDustAtLevel };
