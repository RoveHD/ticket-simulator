'use strict';

const { topicsFor } = require('./challenges');

// Rewards belong to the host. An ability never changes diagnosis, score, RR,
// ticket state or the simulation clock returned by the model.
const ABILITIES = Object.freeze({
  snake: { id: 'precision-bite', name: 'Präzisionsbiss', description: '+75 Spieler-XP für den nächsten sauber gelösten Karrierefall: keine Fehländerung und kein unnötiger Check.', cooldownMinutes: 40, xp: 75, companionXp: 0, condition: 'clean', careerOnly: true },
  wolf: { id: 'pack-spirit', name: 'Rudelgeist', description: '+100 Begleiter-EP für das nächste gelöste Ticket.', cooldownMinutes: 40, xp: 0, companionXp: 100 },
  dragon: { id: 'firepower', name: 'Feuerkraft', description: '+125 Spieler-XP für das nächste gelöste Ticket.', cooldownMinutes: 50, xp: 125, companionXp: 0 },
  'snake-coral': { id: 'double-bite', name: 'Doppelbiss', description: '+50 Spieler-XP und +75 Begleiter-EP für das nächste gelöste Ticket.', cooldownMinutes: 45, xp: 50, companionXp: 75 },
  fox: { id: 'swift-paws', name: 'Flinke Pfoten', description: '+100 Spieler-XP für den nächsten Karrierefall, den du innerhalb seiner Referenz-Arbeitszeit löst.', cooldownMinutes: 40, xp: 100, companionXp: 0, condition: 'quick', careerOnly: true },
  'wolf-night': { id: 'night-hunt', name: 'Nachtjagd', description: '+150 Begleiter-EP für den nächsten sauber gelösten Karrierefall: keine Fehländerung und kein unnötiger Check.', cooldownMinutes: 45, xp: 0, companionXp: 150, condition: 'clean', careerOnly: true },
  raven: { id: 'tailwind', name: 'Rückenwind', description: '+50 Spieler-XP und +100 Begleiter-EP für das nächste gelöste Security- oder Plattformdiagnose-Ticket.', cooldownMinutes: 45, xp: 50, companionXp: 100, condition: 'affinity' },
  'dragon-frost': { id: 'frost-core', name: 'Frostkern', description: '+75 Spieler-XP und +100 Begleiter-EP für das nächste gelöste Ticket auf Stufe 4 oder höher.', cooldownMinutes: 50, xp: 75, companionXp: 100, condition: 'hard' },
  chimera: { id: 'convergence', name: 'Konvergenz', description: '+150 Spieler-XP und +150 Begleiter-EP für das nächste gelöste Ticket.', cooldownMinutes: 60, xp: 150, companionXp: 150 },
});
for (const ability of Object.values(ABILITIES)) Object.freeze(ability);

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const abilityClock = state => finite(state.abilityState?.clock) ? state.abilityState.clock : 0;
const abilityFor = id => Object.hasOwn(ABILITIES, id) ? { ...ABILITIES[id] } : null;

function abilityView(state, characterId, { selected = false, unlocked = false } = {}) {
  const ability = abilityFor(characterId);
  if (!ability) return null;
  const remainingMinutes = Math.max(0, (state.abilityState?.readyAt?.[characterId] || 0) - abilityClock(state));
  const session = state.session;
  const active = session?.current?.status === 'active' && session.abilityPending?.characterId === characterId;
  let blockedReason = '';
  if (!unlocked) blockedReason = 'Dieser Begleiter ist noch gesperrt.';
  else if (!selected) blockedReason = 'Wähle diesen Begleiter, um seine Fähigkeit einzusetzen.';
  else if (session?.current?.status !== 'active') blockedReason = 'Starte zuerst einen Einsatz.';
  else if (session.companionId !== undefined && session.companionId !== characterId) blockedReason = 'Dieser Begleiter gehört nicht zum laufenden Einsatz.';
  else if (active) blockedReason = 'Die Fähigkeit wartet bereits auf das nächste gelöste Ticket.';
  else if (session.abilityPending) blockedReason = 'Es ist bereits eine Fähigkeit aktiv.';
  else if (ability.careerOnly && session.mode !== 'career') blockedReason = 'Diese Fähigkeit benötigt die Einzelbewertung eines Karrierefalls.';
  else if (remainingMinutes > 0) blockedReason = `Noch ${Math.ceil(remainingMinutes * 10) / 10} simulierte Arbeitsminuten Cooldown.`;
  return { ...ability, remainingMinutes, ready: remainingMinutes === 0, active: !!active,
    canActivate: !blockedReason, blockedReason };
}

function activateAbility(state, characterId) {
  const ability = abilityFor(characterId);
  const clock = abilityClock(state);
  const session = state.session;
  return { ...state,
    abilityState: { clock, readyAt: { ...state.abilityState?.readyAt, [characterId]: clock + ability.cooldownMinutes } },
    session: { ...session, companionId: characterId,
      abilityPending: { characterId, abilityId: ability.id, activatedAt: clock,
        excludedTickets: [...new Set([...(session.current.queue || []).filter(item => item.status !== 'open').map(item => item.number),
          ...(session.abilityRewards || []).map(item => item.ticketNumber)])] },
      messages: [...session.messages, { role: 'assistant', content: `**${ability.name} aktiviert.** ${ability.description}\n\nDer Bonus wird beim nächsten gelösten Ticket geprüft. Cooldown: ${ability.cooldownMinutes} simulierte Arbeitsminuten. Bewertung und Rangpunkte bleiben unverändert.` }] } };
}

function conditionMet(ability, archive, ticket) {
  if (ability.careerOnly && archive.mode !== 'career') return false;
  if (ability.condition === 'clean') return archive.summary?.solved === true && archive.summary.wrongChanges === 0 && archive.summary.unnecessaryChecks === 0;
  if (ability.condition === 'quick') return archive.summary?.solved === true && finite(archive.elapsed) && finite(archive.reference) && archive.reference > 0 && archive.elapsed <= archive.reference;
  if (ability.condition === 'affinity' || ability.condition === 'hard') {
    const topics = topicsFor({ archive: { ...archive, completedTickets: [ticket] }, mode: archive.mode, solved: true, solvedCount: 1 });
    return ability.condition === 'affinity' ? topics.some(topic => topic.domains.some(id => ['security', 'monitoring'].includes(id)))
      : topics.some(topic => topic.level >= 4);
  }
  return true;
}

function consumeAbility(session, current) {
  const pending = session.abilityPending;
  const ability = abilityFor(pending?.characterId);
  if (!pending || !ability || pending.abilityId !== ability.id) return { pending: null, rewards: session.abilityRewards || [], message: null };
  const before = new Set((session.current.queue || []).filter(item => item.status === 'solved').map(item => item.number));
  const excluded = new Set([...(pending.excludedTickets || []), ...(session.abilityRewards || []).map(item => item.ticketNumber)]);
  const solved = (current.queue || []).find(item => item.status === 'solved' && !before.has(item.number) && !excluded.has(item.number));
  if (!solved) return { pending: current.status === 'completed' ? null : pending, rewards: session.abilityRewards || [], message: null };
  const ticket = session.plan.find(item => item.number === solved.number);
  if (!ticket) return { pending: null, rewards: session.abilityRewards || [], message: null };
  const reference = current.hidden.tickets.find(item => item.number === solved.number)?.referenceMinutes;
  const met = conditionMet(ability, { mode: session.mode, level: session.level, elapsed: current.elapsed, reference, summary: current.summary }, ticket);
  const reward = { version: 1, characterId: pending.characterId, abilityId: ability.id, ticketNumber: solved.number,
    xp: met ? ability.xp : 0, companionXp: met ? ability.companionXp : 0, conditionMet: met };
  const gains = [reward.xp ? `+${reward.xp} Spieler-XP` : '', reward.companionXp ? `+${reward.companionXp} Begleiter-EP` : ''].filter(Boolean).join(' und ');
  return { pending: null, rewards: [...(session.abilityRewards || []), reward],
    message: `**${ability.name} · Ticket #${solved.number}:** ${met ? `${gains} ${current.status === 'completed' ? 'als Fähigkeitsbonus verdient.' : 'vorgemerkt. Vergabe beim Einsatzabschluss.'}` : 'Bedingung nicht erfüllt; kein Fähigkeitsbonus.'}` };
}

// Recheck saved awards against actual solved tickets. Archived model text and
// XP suggestions are never a source of ability rewards.
function archiveAbilityReward(archive, characterId = archive.companionReward?.characterId) {
  const ability = abilityFor(characterId);
  const seen = new Set();
  const uses = [];
  if (ability && ['career', 'speedrun'].includes(archive.mode)) {
    const solvedCount = archive.mode === 'career' ? (archive.summary?.solved === true ? 1 : 0) : Math.max(0, Math.floor(archive.summary?.solvedCount || 0));
    const tickets = (archive.completedTickets || []).slice(0, solvedCount);
    for (const record of archive.abilityRewards || []) {
      if (!validRecord(record) || record.characterId !== characterId || record.abilityId !== ability.id || seen.has(record.ticketNumber)) continue;
      const ticket = tickets.find(item => item.number === record.ticketNumber);
      if (!ticket) continue;
      const met = conditionMet(ability, archive, ticket);
      if (record.conditionMet !== met || record.xp !== (met ? ability.xp : 0) || record.companionXp !== (met ? ability.companionXp : 0)) continue;
      seen.add(record.ticketNumber);
      uses.push({ ...record, name: ability.name });
    }
  }
  return { xp: uses.reduce((sum, use) => sum + use.xp, 0), companionXp: uses.reduce((sum, use) => sum + use.companionXp, 0), uses };
}

function sessionAbilityReward(session) {
  const uses = (session.abilityRewards || []).filter(validRecord).map(record => ({ ...record, name: ABILITIES[record.characterId].name }));
  return { xp: uses.reduce((sum, use) => sum + use.xp, 0), companionXp: uses.reduce((sum, use) => sum + use.companionXp, 0), uses };
}

function validRecord(record) {
  const ability = abilityFor(record?.characterId);
  return !!ability && record.version === 1 && record.abilityId === ability.id && typeof record.ticketNumber === 'string' && record.ticketNumber.length <= 30 &&
    typeof record.conditionMet === 'boolean' && record.xp === (record.conditionMet ? ability.xp : 0) && record.companionXp === (record.conditionMet ? ability.companionXp : 0);
}

function validAbilityPersistence(state) {
  const data = state.abilityState;
  if (data !== undefined && (!plain(data) || !finite(data.clock) || !plain(data.readyAt) ||
    Object.entries(data.readyAt).some(([id, at]) => !abilityFor(id) || !finite(at)))) return false;
  const session = state.session;
  if (session?.abilityRewards !== undefined && (!Array.isArray(session.abilityRewards) || session.abilityRewards.length > 120 || !session.abilityRewards.every(validRecord))) return false;
  const pending = session?.abilityPending;
  return pending == null || plain(pending) && !!abilityFor(pending.characterId) && pending.abilityId === ABILITIES[pending.characterId].id && finite(pending.activatedAt) &&
    Array.isArray(pending.excludedTickets) && pending.excludedTickets.length <= 240 && pending.excludedTickets.every(item => typeof item === 'string' && item.length <= 30);
}

module.exports = { ABILITIES, abilityFor, abilityClock, abilityView, activateAbility, consumeAbility, archiveAbilityReward, sessionAbilityReward, validAbilityPersistence };
