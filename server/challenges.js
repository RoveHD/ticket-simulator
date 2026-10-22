'use strict';

const { SCENARIOS } = require('./difficulty');
const { CHARACTERS, validCompanionReward } = require('./characters');
const { chimeraUnlocked, hiddenCharacter } = require('./secret-companion');
const { bonusForTier } = require('./pass-extras');
const { arcaneBonusTotals } = require('./arcane-grants');

// Only known, authored scenario families award topic credit. Archive/report prose
// is deliberately never interpreted as proof of a solved topic.
const DOMAINS = [
  ['dns', 'DNS', ['dns-resolution', 'dns-dynamic-registration', 'site-vpn-dns', 'critical-name-path', 'linux-dns-split']],
  ['dhcp', 'DHCP', ['dhcp-scope', 'dhcp-failover']],
  ['backup', 'Backup & Recovery', ['backup-window', 'backup-recovery-site', 'recovery-control', 'linux-backup-consistency', 'linux-storage-recovery']],
  ['identity', 'Identität & AD', ['shared-signin', 'ad-lockout', 'scheduled-service-account', 'gpo-application', 'identity-dependency', 'hybrid-identity', 'm365-federation', 'replication-site', 'identity-control-plane', 'linux-pam-directory', 'linux-pki-federation']],
  ['network', 'Netzwerk', ['shared-wifi', 'shared-remote-access', 'dhcp-scope', 'routing-segment', 'site-vpn-dns', 'wan-routing', 'network-segmentation', 'linux-dns-split', 'linux-container-network', 'linux-policy-routing']],
  ['security', 'Security & Zertifikate', ['certificate-service', 'certificate-chain', 'identity-control-plane', 'network-segmentation', 'linux-file-acl', 'linux-pam-directory', 'linux-pki-federation']],
  ['cloud', 'Cloud & Microsoft 365', ['shared-m365', 'shared-mail-access', 'hybrid-identity', 'm365-federation']],
  ['virtualization', 'Virtualisierung', ['vm-service-chain', 'storage-latency', 'virtualization-cluster', 'linux-container-network', 'linux-ha-quorum']],
  ['storage', 'Storage & Dateien', ['shared-files', 'file-permissions', 'storage-latency', 'storage-failover', 'workstation-local-storage', 'linux-file-acl', 'linux-backup-consistency', 'linux-storage-recovery']],
  ['endpoint', 'Clients & Richtlinien', ['workstation-peripheral', 'workstation-profile', 'workstation-print', 'workstation-audio', 'workstation-display', 'workstation-local-app', 'workstation-camera', 'workstation-local-storage', 'shared-print-queue', 'shared-endpoint', 'gpo-application', 'endpoint-management-chain']],
  ['monitoring', 'Dienst- & Plattformdiagnose', ['vm-service-chain', 'storage-latency', 'critical-name-path', 'recovery-control', 'scheduled-service-account', 'linux-systemd-chain', 'linux-ha-quorum']],
  ['linux', 'Linux', SCENARIOS.filter(s => s.id.startsWith('linux-')).map(s => s.id), 'Linux-Dienste, Dateirechte, Identität, Container, Netzwerk und sicherer Wiederanlauf. Bestehende gelöste Linux-Fälle zählen mit.'],
  ['hardware', 'Hardwarediagnose & Reparatur', SCENARIOS.filter(s => s.id.startsWith('hardware-') && !s.id.startsWith('hardware-advice-')).map(s => s.id), 'Defekte eingrenzen, Daten schützen und Reparatur, Austausch oder Garantieabwicklung mit Funktionsprüfung durchführen.'],
  ['hardware-advice', 'Hardwareberatung & Verkauf', SCENARIOS.filter(s => s.id.startsWith('hardware-advice-')).map(s => s.id), 'Fernseher, Handys, Router, PCs, Gaming, Audio, Smart Home, Haushalt und weitere Technik beraten. Angebote mit simulierten EUR-Preisen vergleichen: Bedarf, Preis-Leistung, Kompatibilität und Folgekosten prüfen; Kauf oder Nichtkauf und abgelehnte Alternativen begründen.'],
].map(([id, name, scenarios, description]) => ({ id, name, scenarios, ...(description ? { description } : {}) }));
const SCENARIO_BY_ID = new Map(SCENARIOS.map(s => [s.id, s]));
const FRAME_CHARACTERS = ['snake', 'wolf', 'dragon'];
const ANIMALS = Object.fromEntries(CHARACTERS.map(character => [character.id, character.name]));
const DAY = 86400000;

function finite(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }

function topicsFor(entry) {
  if (!entry.solved) return [];
  const archive = entry.archive;
  let tickets;
  if (Array.isArray(archive.completedTickets)) {
    const seen = new Set();
    tickets = archive.completedTickets.filter(ticket => {
      if (!ticket || ticket.number == null || seen.has(String(ticket.number))) return false;
      seen.add(String(ticket.number));
      return true;
    }).slice(0, Math.floor(entry.solvedCount));
  } else if (entry.mode === 'career') {
    // A career archive represents exactly one solved ticket. A speedrun's plan
    // describes arrivals, not solutions, and must never be credited wholesale.
    tickets = [{ scenarioId: Array.isArray(archive.scenarioIds) ? archive.scenarioIds[0] : undefined }];
  } else tickets = [];
  return tickets.flatMap(ticket => {
    const scenario = SCENARIO_BY_ID.get(ticket.scenarioId);
    if (!scenario) return [];
    // An elevated archive field alone cannot turn a support scenario into a
    // difficult domain solution. Both authored family and session must qualify.
    const level = Number.isInteger(archive.level) && archive.level >= 1 && archive.level <= 6 ? Math.min(archive.level, scenario.level) : scenario.level;
    return [{ scenarioId: scenario.id, level, domains: DOMAINS.filter(d => d.scenarios.includes(scenario.id)).map(d => d.id) }];
  });
}

function metrics(entries) {
  const result = { total: 0, career: 0, shifts: 0, speedrun: 0, clean: 0, noWrong: 0, efficient: 0,
    score70: 0, score85: 0, score95: 0, score100: 0, quick: 0, streak: 0, cleanStreak: 0, variety: 0 };
  for (let level = 2; level <= 6; level++) result[`level${level}`] = 0;
  for (const d of DOMAINS) { result[`topic-${d.id}`] = 0; result[`hard-${d.id}`] = 0; }
  let streak = 0, cleanStreak = 0;
  const scenarios = new Set();
  for (const e of entries) {
    const solved = Math.floor(e.solvedCount);
    result.total += solved;
    if (e.mode === 'speedrun') { result.speedrun += solved; if (e.solved) result.shifts++; }
    if (e.mode === 'career') {
      if (e.solved) {
        result.career++;
        if (finite(e.archive.summary?.wrongChanges) && e.wrongChanges === 0) result.noWrong++;
        if (finite(e.archive.summary?.unnecessaryChecks) && e.unnecessaryChecks === 0) result.efficient++;
        const clean = finite(e.archive.summary?.wrongChanges) && finite(e.archive.summary?.unnecessaryChecks) && e.wrongChanges === 0 && e.unnecessaryChecks === 0;
        if (clean) result.clean++;
        for (const score of [70, 85, 95, 100]) if (finite(e.archive.summary?.score) && e.score >= score) result[`score${score}`]++;
        if (finite(e.archive.elapsed) && finite(e.archive.reference) && e.archive.reference > 0 && e.archive.elapsed <= e.archive.reference) result.quick++;
        streak++; cleanStreak = clean ? cleanStreak + 1 : 0;
        result.streak = Math.max(result.streak, streak);
        result.cleanStreak = Math.max(result.cleanStreak, cleanStreak);
      } else { streak = 0; cleanStreak = 0; }
    }
    for (let level = 2; level <= 6; level++) {
      if (Number.isInteger(e.archive.level) && e.archive.level >= level && e.archive.level <= 6) result[`level${level}`] += solved;
    }
    for (const ticket of topicsFor(e)) {
      scenarios.add(ticket.scenarioId);
      for (const domain of ticket.domains) {
        result[`topic-${domain}`]++;
        if (ticket.level >= 4) result[`hard-${domain}`]++;
      }
    }
  }
  result.variety = scenarios.size;
  return result;
}

const OBJECTIVES = [
  ['total', 'Retter im Einsatz', 'Löse Tickets in Karriere oder Speedrun.', [1, 3, 10, 25, 50, 100, 250, 500]],
  ['career', 'Fall für Fall', 'Löse Karrierefälle.', [1, 3, 5, 10, 25, 50, 100, 250]],
  ['clean', 'Saubere Arbeit', 'Löse Karrierefälle ohne Fehländerungen und unnötige Checks.', [1, 3, 5, 10, 25, 50, 100]],
  ['noWrong', 'Ruhige Hand', 'Löse Karrierefälle ohne Fehländerungen.', [1, 5, 15, 30, 60]],
  ['efficient', 'Gezielte Diagnose', 'Löse Karrierefälle ohne unnötige Checks.', [1, 5, 15, 30, 60]],
  ['score70', 'Solider Betrieb', 'Löse Karrierefälle mit mindestens 70 Punkten.', [1, 3, 10, 25, 50]],
  ['score85', 'Sehr gut im Dienst', 'Löse Karrierefälle mit mindestens 85 Punkten.', [1, 3, 10, 25, 50]],
  ['score95', 'Herausragende Einsätze', 'Löse Karrierefälle mit mindestens 95 Punkten.', [1, 3, 10, 25, 50]],
  ['score100', 'Perfekte Lösung', 'Löse Karrierefälle mit 100 Punkten.', [1, 3, 5, 10, 25]],
  ['quick', 'Im Referenzfenster', 'Löse Karrierefälle innerhalb ihrer Referenzzeit.', [1, 3, 10, 25, 50]],
  ['streak', 'Erfolgsserie', 'Löse Karrierefälle in Folge; ein ungelöster Karrierefall beendet die Serie.', [2, 3, 5, 10, 20]],
  ['cleanStreak', 'Präzisionsserie', 'Löse Karrierefälle in Folge ohne Fehländerungen und unnötige Checks.', [2, 3, 5, 10, 20]],
  ['shifts', 'Schichtheld', 'Beende Speedruns mit mindestens einem gelösten Ticket.', [1, 3, 5, 10, 25, 50]],
  ['speedrun', 'Queue geräumt', 'Löse Tickets in Speedruns.', [1, 5, 15, 30, 75, 150, 300]],
  ['variety', 'Breites Wissen', 'Löse unterschiedliche bekannte Fallfamilien.', [2, 4, 8, 12, 20, 30]],
  ...[2, 3, 4, 5, 6].map(level => [`level${level}`, `Stufe ${level} gemeistert`, `Löse Tickets auf Stufe ${level} oder höher.`, [1, 3, 10, 25, 50]]),
  ...DOMAINS.map(d => [`topic-${d.id}`, `${d.name}: Einsatzprofi`, `Löse bekannte Fälle im Bereich ${d.name}.`, [1, 3, 10, 25, 50, 100]]),
];
const PERMANENT = OBJECTIVES.flatMap(([metric, title, description, targets]) => targets.map((target, i) => ({
  id: `${metric}-${target}`, metric, title: `${title} ${i + 1}`, description: `${description} Ziel: ${target}.`, target, reward: 100 + i * 75,
})));

// Each period selects different goals from a large catalogue. UTC midnight and
// Monday boundaries avoid DST, host timezone and ISO week/year ambiguities.
function pool(kind) {
  return OBJECTIVES.flatMap(([metric, title, description]) => {
    const weekly = kind === 'weekly';
    let targets;
    if (metric === 'variety') targets = weekly ? [3, 5, 8] : [2, 3];
    else if (metric.startsWith('topic-') || metric === 'score100' || metric === 'level6' || metric === 'shifts') targets = weekly ? [1, 2, 3] : [1, 2];
    else if (metric === 'streak' || metric === 'cleanStreak') targets = weekly ? [2, 3, 5] : [2, 3];
    else targets = weekly ? [3, 5, 10] : [1, 2, 3];
    return targets.map(target => ({ id: `${metric}-${target}`, metric, title, description: `${description} ${weekly ? 'Diese Woche' : 'Heute'}: ${target}.`, target,
      reward: (weekly ? 250 : 100) + target * (weekly ? 30 : 20) }));
  });
}
const POOLS = { daily: pool('daily'), weekly: pool('weekly') };
function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) { value ^= text.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}
function selections(kind, key) {
  const selected = [], metricsSeen = new Set();
  const sorted = POOLS[kind].map(def => ({ def, hash: hash(`${kind}:${key}:${def.id}`) }))
    .sort((a, b) => a.hash - b.hash || a.def.id.localeCompare(b.def.id));
  for (const { def } of sorted) {
    if (metricsSeen.has(def.metric)) continue;
    metricsSeen.add(def.metric); selected.push(def);
    if (selected.length === (kind === 'daily' ? 6 : 8)) break;
  }
  return selected;
}
function period(time, kind) {
  const date = new Date(time);
  date.setUTCHours(0, 0, 0, 0);
  if (kind === 'weekly') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return { key: date.toISOString().slice(0, 10), endsAt: new Date(date.getTime() + (kind === 'weekly' ? 7 : 1) * DAY).toISOString() };
}
function completionTime(value) {
  // Date.parse also accepts bare years and ambiguous locale dates. Completion
  // evidence must be a timestamp with an explicit timezone, as written by host.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  // Date.parse normalizes dates such as February 30 rather than rejecting them.
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== value.slice(0, 10) || Number(value.slice(11, 13)) > 23) return NaN;
  return Date.parse(value);
}
function mission(def, state, prefix) {
  const current = state[def.metric] || 0;
  return { id: `${prefix}-${def.id}`, title: def.title, description: def.description, current: Math.min(def.target, current), target: def.target, reward: def.reward, unlocked: current >= def.target };
}

const TITLE_NAMES = ['Fault Hunter', 'Signal Stalker', 'Queue Reaper', 'Packet Phantom', 'Last Safeguard', 'Silent Sentinel', 'Iron Vanguard', 'Identity Warden', 'Cloud Revenant', 'Crisis Sovereign', 'The All-Seeing', 'Deathless Operator', 'Architect of Eternity', 'Harbinger of Dawn', 'Thronebreaker', 'The Final Authority'];
// Display names change independently of reward IDs and saved ownership.
const MASTERY_TITLES = Object.freeze({
  dns: 'Sovereign of Names', dhcp: 'The Address Sovereign', backup: 'Lord of Rebirth',
  identity: 'Keeper of the True Name', network: 'Sovereign of the Wire', security: 'The Unbreachable',
  cloud: 'Sky Sovereign', virtualization: 'Worldforger', storage: 'Eternal Vaultkeeper',
  endpoint: 'The Iron Regent', monitoring: 'The All-Seeing Sovereign',
  linux: 'The Kernel Sovereign', hardware: 'The Iron Restorer', 'hardware-advice': 'The Value Architect',
});
const BADGE_NAMES = ['Erste Bereitschaft', 'Ping des Mutes', 'DNS-Siegel', 'Sichere Hände', 'Queue-Klinge', 'Backup-Schild', 'Paket-Kompass', 'Uptime-Stern', 'Identitätswappen', 'Phönix-Protokoll', 'Cluster-Krone', 'Betriebsdiamant', 'Ewige Leitstelle', 'Wiederanlauf-Siegel', 'Leitstellen-Ehrenzeichen'];
const FRAME_NAMES = { bronze: 'Bronzerahmen', silver: 'Silberrahmen', gold: 'Goldrahmen' };
// Compatibility catalog only: these former pass rewards are no longer earned.
// Existing saves snapshot their entitlement once when upgrading to catalog 2.
const LEGACY_PASS_FRAMES = Array.from({ length: 9 }, (_, index) => {
  const character = FRAME_CHARACTERS[index % 3], variant = ['bronze', 'silver', 'gold'][Math.floor(index / 3)];
  return { id: `portrait-${character}-${variant}`, name: `${ANIMALS[character]} · ${FRAME_NAMES[variant]}`, kind: 'portrait', character, variant,
    rarity: variant === 'gold' ? 'legendary' : variant === 'silver' ? 'epic' : 'rare', legacy: true,
    description: 'Bereits früher verdient. Bleibt erhalten; neue Rahmen erhältst du über die Meisterung.', formerPassLevel: (index + 1) * 4 };
});
function legacyPassFrames(level) { return LEGACY_PASS_FRAMES.filter(r => r.formerPassLevel <= level).map(r => ({ ...r })); }
function retainedPassFrames(ids) { return LEGACY_PASS_FRAMES.filter(r => Array.isArray(ids) && ids.includes(r.id)).map(r => ({ ...r })); }
const REPLACEMENT_REWARDS = [
  ['badge', 'Signalwächter'], ['title', 'Trace Reaper'], ['badge', 'Einsatzkompass'],
  ['title', 'Riftbreaker'], ['badge', 'Diagnosekern'], ['title', 'System Overlord'],
  ['badge', 'Resilienzzeichen'], ['title', 'The Undying'], ['badge', 'Operations-Krone'],
];
function rarityFor(level) { return level >= 32 ? 'legendary' : level >= 20 ? 'epic' : level >= 8 ? 'rare' : 'common'; }

// Bespoke pass cosmetics retain their original reward IDs and unlock levels.
const PASS_EMBLEMS = {
  2: ['First Spark', 'spark'], 4: ['Signal Sentinel', 'sentinel'],
  5: ['Comet Strike', 'comet'], 7: ['Oracle Sigil', 'oracle'],
  12: ['Star Compass', 'compass'], 13: ['Riftblade', 'blade'],
  15: ['Last Bastion', 'aegis'], 20: ['Arc Reactor', 'reactor'],
  21: ['Black Sun', 'eclipse'], 23: ['Phantom Crest', 'wraith'],
  28: ['Phoenix Protocol', 'phoenix'], 29: ['Void Crown', 'crown'],
  31: ['Prismatic Heart', 'prism'], 36: ['Crown of Oblivion', 'void'],
  37: ['World Eater', 'dragon'], 39: ['Singularity', 'singularity'],
};
function passPresentation(reward, level) {
  if (reward.kind === 'portrait') return { ...reward, presentation: 'Neuer Begleiter', description: 'Schalte diesen Begleiter mit eigener Spezialisierung frei.' };
  const rarity = level === 40 ? 'mythic' : reward.rarity;
  const animated = ['epic', 'legendary', 'mythic'].includes(rarity);
  if (reward.kind === 'badge') {
    const [name, emblem] = PASS_EMBLEMS[level];
    return { ...reward, name, emblem, animated, rarity,
      presentation: animated ? 'Animiertes Abzeichen' : 'Exklusives Abzeichen',
      description: animated ? 'Eigenes Emblem mit lebendiger Energie. Der Effekt bleibt auch ausgerüstet in deinem Profil sichtbar.' : 'Ein eigenständiges Emblem für dein Profil. Im Battlepass verdient, dauerhaft in deiner Sammlung.' };
  }
  return { ...reward, rarity, titleStyle: rarity, animated,
    presentation: level === 40 ? 'Finale · Mythischer Titel' : animated ? 'Animierter Titel' : 'Exklusiver Titel',
    description: level === 40 ? 'The Final Authority. Der Abschluss des Battlepass: ein mythischer Titel mit wanderndem Licht und eigener Krone.' : animated ? 'Dein Titel trägt einen animierten Lichtschein – im Profil und neben deinem Namen.' : 'Ein verdienter Name mit eigener Farbgebung für dein Profil.' };
}

const TIERS = Array.from({ length: 40 }, (_, index) => {
  const level = index + 1;
  let reward;
  const characterUnlock = CHARACTERS.find(character => character.unlockLevel === level);
  if (characterUnlock) {
    reward = { id: `portrait-${characterUnlock.id}-base`, name: characterUnlock.name, kind: 'portrait', character: characterUnlock.id,
      variant: 'base', rarity: characterUnlock.rarity };
  } else if (level % 4 === 0 && level <= 36) {
    const [kind, name] = REPLACEMENT_REWARDS[level / 4 - 1];
    reward = { id: `${kind}-pass-${level}`, name, kind, rarity: rarityFor(level) };
  } else {
    const nonFrameIndex = index - Math.min(9, Math.floor(level / 4));
    const kind = nonFrameIndex % 2 === 0 ? 'title' : 'badge';
    const names = kind === 'title' ? TITLE_NAMES : BADGE_NAMES;
    const nameIndex = Math.floor(nonFrameIndex / 2);
    // Names and IDs of unchanged tiers stay stable when animal rewards replace
    // individual title/badge tiers.
    reward = { id: `${kind}-pass-${level}`, name: names[nameIndex], kind, rarity: rarityFor(level) };
  }
  const primary = passPresentation(reward, level);
  return { level, requiredXp: level * 500, reward: primary, rewards: [primary, bonusForTier(level)] };
});
const BASE_REWARDS = [
  { id: 'title-rookie', name: 'Unbound', kind: 'title', rarity: 'common' },
  { id: 'badge-recruit', name: 'Rekrut', kind: 'badge', rarity: 'common' },
  ...CHARACTERS.filter(character => character.unlockLevel === 0).map(character => ({ id: `portrait-${character.id}-base`, name: character.name,
    kind: 'portrait', character: character.id, variant: 'base', rarity: character.rarity })),
];
const MASTERY_THRESHOLDS = [0, 300, 1000, 2000, 3500, 5000];
const MASTERY_RANKS = ['Anwärter', 'Praktiker', 'Spezialist', 'Experte', 'Meister', 'Großmeister'];
const PRESTIGE_REQUIREMENTS = {
  lord: { solved: 50, hardSolved: 10 },
  silver: { solved: 100, hardSolved: 25 },
  gold: { solved: 200, hardSolved: 60 },
  eternal: { solved: 1000, hardSolved: 400 },
  astral: { solved: 2500, hardSolved: 1000 },
};

function masteryFor(domain, solved, hardSolved, characterId) {
    const xp = solved * 100 + hardSolved * 50;
    const qualifies = requirement => solved >= requirement.solved && hardSolved >= requirement.hardSolved;
    const lordUnlocked = qualifies(PRESTIGE_REQUIREMENTS.lord);
    const silverUnlocked = qualifies(PRESTIGE_REQUIREMENTS.silver);
    const goldUnlocked = qualifies(PRESTIGE_REQUIREMENTS.gold);
    const eternalUnlocked = qualifies(PRESTIGE_REQUIREMENTS.eternal);
    const astralUnlocked = qualifies(PRESTIGE_REQUIREMENTS.astral);
    const prestige = astralUnlocked ? 'astral' : eternalUnlocked ? 'eternal' : goldUnlocked ? 'gold' : silverUnlocked ? 'silver' : lordUnlocked ? 'lord' : 'none';
    const nextPrestige = astralUnlocked ? null : eternalUnlocked ? 'astral' : goldUnlocked ? 'eternal' : silverUnlocked ? 'gold' : lordUnlocked ? 'silver' : 'lord';
    const start = prestige === 'none' ? { solved: 0, hardSolved: 0 } : PRESTIGE_REQUIREMENTS[prestige];
    const target = nextPrestige && PRESTIGE_REQUIREMENTS[nextPrestige];
    const prestigeProgress = target ? Math.floor(Math.max(0, Math.min(1,
      (solved - start.solved) / (target.solved - start.solved),
      (hardSolved - start.hardSolved) / (target.hardSolved - start.hardSolved))) * 100) : 100;
    let index = 0;
    for (let i = 1; i < MASTERY_THRESHOLDS.length; i++) if (xp >= MASTERY_THRESHOLDS[i]) index = i;
    const next = lordUnlocked ? null : MASTERY_THRESHOLDS[index + 1] ?? null;
    const progress = lordUnlocked ? prestigeProgress : next === null ? Math.min(99, prestigeProgress) : Math.floor((xp - MASTERY_THRESHOLDS[index]) * 100 / (next - MASTERY_THRESHOLDS[index]));
    return { id: domain.id, name: domain.name, ...(domain.description ? { description: domain.description } : {}), titleName: MASTERY_TITLES[domain.id], character: characterId, solved, hardSolved, xp,
      level: astralUnlocked ? 11 : eternalUnlocked ? 10 : goldUnlocked ? 9 : silverUnlocked ? 8 : lordUnlocked ? 7 : index + 1,
      rank: astralUnlocked ? 'Astral-Lord' : eternalUnlocked ? 'Ewiger Lord' : goldUnlocked ? 'Ultimativer Gold-Lord' : silverUnlocked ? 'Silber-Lord' : lordUnlocked ? 'Lord' : MASTERY_RANKS[index],
      next, progress, lordUnlocked, lordRequirements: { ...PRESTIGE_REQUIREMENTS.lord },
      prestige, silverUnlocked, goldUnlocked, eternalUnlocked, astralUnlocked, nextPrestige, prestigeProgress,
      prestigeRequirements: { silver: { ...PRESTIGE_REQUIREMENTS.silver }, gold: { ...PRESTIGE_REQUIREMENTS.gold },
        eternal: { ...PRESTIGE_REQUIREMENTS.eternal }, astral: { ...PRESTIGE_REQUIREMENTS.astral } } };
 }

function masteriesFor(all, characterId) {
  return DOMAINS.map((domain, index) => masteryFor(domain, all[`topic-${domain.id}`], all[`hard-${domain.id}`], characterId || FRAME_CHARACTERS[index % FRAME_CHARACTERS.length]));
}

function masteryPortraits(character, masteries) {
  const inventory = [];
  for (const mastery of masteries.filter(item => item.lordUnlocked)) {
    inventory.push({ id: `portrait-${character.id}-lord-${mastery.id}`, name: `${character.name} · Lord ${mastery.name}`,
      kind: 'portrait', character: character.id, variant: 'lord', masteryId: mastery.id, rarity: 'mythic' });
    for (const frame of ['silver', 'gold']) {
      if (!mastery[`${frame}Unlocked`]) continue;
      inventory.push({ id: `portrait-${character.id}-lord-${mastery.id}-${frame}`,
        name: `${character.name} · ${frame === 'silver' ? 'Silber-Lord' : 'Ultimativer Gold-Lord'} ${mastery.name}`,
        kind: 'portrait', character: character.id, variant: 'lord', frame, masteryId: mastery.id, rarity: 'mythic' });
    }
    if (mastery.eternalUnlocked) inventory.push({ id: `portrait-${character.id}-lord-${mastery.id}-eternal`,
      name: `${character.name} · Ewiger Lord ${mastery.name}`, kind: 'portrait', character: character.id, variant: 'lord', frame: 'eternal', masteryId: mastery.id, rarity: 'mythic' });
    if (mastery.astralUnlocked) inventory.push({ id: `portrait-${character.id}-lord-${mastery.id}-astral`,
      name: `${character.name} · Astral-Lord ${mastery.name}`, kind: 'portrait', character: character.id, variant: 'lord', frame: 'astral', masteryId: mastery.id, rarity: 'mythic' });
  }
  return inventory;
}

const FORM_NAMES = { lord: 'Lord', silver: 'Silber-Lord', gold: 'Ultimativer Gold-Lord', eternal: 'Ewiger Lord', astral: 'Astral-Lord' };
function canonicalPortraitId(id) {
  if (typeof id !== 'string') return id;
  for (const character of CHARACTERS) {
    const prefix = `portrait-${character.id}-lord`;
    if (id === prefix || Object.keys(FORM_NAMES).some(tier => tier !== 'lord' && id === `${prefix}-${tier}`)) return id;
    for (const domain of DOMAINS) {
      if (id === `${prefix}-${domain.id}`) return prefix;
      for (const tier of Object.keys(FORM_NAMES).filter(tier => tier !== 'lord'))
        if (id === `${prefix}-${domain.id}-${tier}`) return `${prefix}-${tier}`;
    }
  }
  return id;
}
function companionPortraits(character, form) {
  return Object.entries(FORM_NAMES).flatMap(([tier, name]) => form[`${tier}Unlocked`] ? [{
    id: `portrait-${character.id}-lord${tier === 'lord' ? '' : '-' + tier}`, name: `${character.name} · ${name}`,
    kind: 'portrait', character: character.id, variant: 'lord', ...(tier === 'lord' ? {} : { frame: tier }),
    companionForm: true, rarity: 'mythic',
  }] : []);
}
function canonicalMasteryReward(reward) {
  const character = CHARACTERS.find(character => character.id === reward.character);
  const tier = reward.frame || 'lord';
  const { masteryId, ...rest } = reward;
  return { ...rest, id: canonicalPortraitId(reward.id), name: `${character.name} · ${FORM_NAMES[tier]}`, companionForm: true };
}

function legacyMasteryRewards(game, ids) {
  const allowed = ids == null ? null : new Set(Array.isArray(ids) ? ids : []);
  return game.characters.filter(character => character.unlocked).flatMap(character =>
    masteryPortraits(character, game.masteries).filter(reward => !allowed || allowed.has(reward.id))
      .map(reward => ({ ...reward, legacy: true })));
}

function expansion(entries, now = new Date(), options = {}) {
  const parsedNow = new Date(now).getTime();
  if (!Number.isFinite(parsedNow)) throw new RangeError('Ungültiger Fortschrittszeitpunkt');
  const all = metrics(entries);
  const permanent = PERMANENT.map(def => mission(def, all, 'permanent'));
  const arcaneBonus = arcaneBonusTotals(options.arcane);
  const bonusXp = arcaneBonus.passXp;
  let passXp = bonusXp + permanent.filter(m => m.unlocked).reduce((sum, m) => sum + m.reward, 0);
  const challenges = { timezone: 'UTC', permanent };
  for (const kind of ['daily', 'weekly']) {
    const groups = new Map();
    for (const entry of entries) {
      const time = completionTime(entry.archive.completedAt);
      if (!Number.isFinite(time) || time > parsedNow) continue;
      const { key } = period(time, kind);
      if (!groups.has(key)) groups.set(key, []);
      // Archive append order is the completion sequence; timestamps select the
      // window only. Reordering after clock corrections could retract earned
      // streak rewards and produce negative completion XP.
      groups.get(key).push(entry);
    }
    const active = period(parsedNow, kind);
    let activeMissions;
    for (const [key, group] of groups) {
      const state = metrics(group);
      const missions = selections(kind, key).map(def => mission(def, state, `${kind}-${key}`));
      passXp += missions.filter(m => m.unlocked).reduce((sum, m) => sum + m.reward, 0);
      if (key === active.key) activeMissions = missions;
    }
    challenges[kind] = { ...active, missions: activeMissions || selections(kind, active.key).map(def => mission(def, {}, `${kind}-${active.key}`)) };
  }
  const masteries = masteriesFor(all);
  const secretOffsets = { ...options.companionXpOffsets };
  for (const [id, xp] of Object.entries(arcaneBonus.companionXp)) {
    const offset = Number.isSafeInteger(secretOffsets[id]) && secretOffsets[id] >= 0 ? secretOffsets[id] : 0;
    secretOffsets[id] = Math.min(Number.MAX_SAFE_INTEGER, offset + xp);
  }
  const secretUnlocked = chimeraUnlocked(entries.map(entry => entry.archive), masteries, secretOffsets);
  const level = Math.min(40, Math.floor(passXp / 500));
  const battlepass = { xp: passXp, bonusXp, level, next: level === 40 ? null : (level + 1) * 500, rewardCount: 80,
    progress: level === 40 ? 100 : Math.floor(passXp % 500 / 5), tiers: TIERS.map(tier => ({ ...tier, reward: { ...tier.reward },
      rewards: tier.rewards.map(reward => ({ ...reward })), unlocked: passXp >= tier.requiredXp })) };
  const inventory = BASE_REWARDS.map(reward => ({ ...reward }));
  if (secretUnlocked) {
    const secret = CHARACTERS.find(character => character.id === 'chimera');
    inventory.push({ id: 'portrait-chimera-base', name: secret.name, kind: 'portrait', character: secret.id,
      variant: 'base', rarity: secret.rarity });
  }
  inventory.push(...battlepass.tiers.filter(tier => tier.unlocked).flatMap(tier => tier.rewards.map(reward => ({ ...reward }))));
  const ownedIds = new Set(inventory.map(reward => reward.id));
  const characters = CHARACTERS.map(character => character.secret && !secretUnlocked ? hiddenCharacter(character) :
    { ...character, unlocked: ownedIds.has(`portrait-${character.id}-base`) });
  const companionMasteries = {}, companionForms = {};
  for (const character of characters) {
    if (character.secret && !character.unlocked) continue;
    const counters = Object.fromEntries(DOMAINS.flatMap(domain => [[`topic-${domain.id}`, 0], [`hard-${domain.id}`, 0]]));
    let solved = 0, hardSolved = 0;
    for (const entry of entries) {
      if (!validCompanionReward(entry.archive.companionReward) || entry.archive.companionReward.characterId !== character.id) continue;
      const tickets = topicsFor(entry);
      solved += tickets.length;
      hardSolved += tickets.filter(ticket => ticket.level >= 4).length;
      for (const ticket of tickets) for (const domain of ticket.domains) {
        counters[`topic-${domain}`]++;
        if (ticket.level >= 4) counters[`hard-${domain}`]++;
      }
    }
    companionMasteries[character.id] = masteriesFor(counters, character.id);
    companionForms[character.id] = masteryFor({ id: 'forms', name: 'Eigene Formen' }, solved, hardSolved, character.id);
    if (character.unlocked) inventory.push(...companionPortraits(character, companionForms[character.id]));
  }
  for (const mastery of masteries.filter(m => m.lordUnlocked)) {
    inventory.push({ id: `title-lord-${mastery.id}`, name: mastery.titleName, kind: 'title', masteryId: mastery.id, rarity: 'mythic' });
    inventory.push({ id: `badge-lord-${mastery.id}`, name: `${mastery.name} · Lord-Siegel`, kind: 'badge', masteryId: mastery.id, masteryTier: 'lord', rarity: 'mythic' });
    for (const frame of ['silver', 'gold']) {
      if (!mastery[`${frame}Unlocked`]) continue;
      inventory.push({ id: `badge-lord-${mastery.id}-${frame}`, name: `${mastery.name} · ${frame === 'silver' ? 'Silber-Lord-Siegel' : 'Ultimatives Gold-Siegel'}`,
        kind: 'badge', masteryId: mastery.id, masteryTier: frame, frame, rarity: 'mythic' });
    }
  }
  return { challenges, battlepass, masteries, companionMasteries, companionForms, inventory, characters };
}

module.exports = { expansion, DOMAINS, topicsFor, legacyPassFrames, retainedPassFrames, legacyMasteryRewards, canonicalPortraitId, canonicalMasteryReward };
