'use strict';

const { DOMAINS } = require('../../server/challenges');
const { SCENARIOS } = require('../../server/difficulty');
const { SWITCH_XP } = require('../../server/companions');

function cleanCareer(id, extra = {}) {
  return { id, mode: 'career', level: 4, elapsed: 10, reference: 10, ticket: { number: id },
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0, strengths: '', gaps: '', arrived: 1, solvedCount: 1, slaViolations: 0 }, ...extra };
}

function xpRun(id, characterId, xp) {
  const scenarioId = { snake: 'dns-resolution', wolf: 'dhcp-scope', dragon: 'backup-window' }[characterId];
  const solvedCount = xp / 150;
  return { id, mode: 'speedrun', level: 3, duration: 240, elapsed: 240, waiting: 0, reference: 15,
    title: `Archivierte Trainingsschicht ${characterId}`, report: 'Trainingsschicht abgeschlossen.', ticket: { number: 'S01', title: 'Trainingsfall' },
    scenarioIds: [scenarioId], completedTickets: Array.from({ length: solvedCount }, (_, index) => ({ number: `S${index + 1}`, scenarioId })),
    summary: { arrived: solvedCount, solvedCount, score: solvedCount * 95, wrongChanges: 0, unnecessaryChecks: 0,
      solved: true, strengths: 'Gezielte Diagnose', gaps: 'Keine im Test', slaViolations: 0 },
    companionReward: { version: 1, characterId, xp } };
}

function secretArchives({ astral = false } = {}) {
  const archives = [];
  for (const id of ['snake', 'wolf', 'dragon']) archives.push(xpRun(`xp-${id}`, id, 18000));
  for (let i = 0; i < 9; i++) archives.push(cleanCareer(`career-${i}`));
  archives.push({ id: 'shift', mode: 'speedrun', level: 6, duration: 60,
    summary: { arrived: 6, solvedCount: 6, score: 100, wrongChanges: 0, unnecessaryChecks: 0, solved: true, strengths: '', gaps: '', slaViolations: 0 },
    completedTickets: Array.from({ length: 6 }, (_, i) => ({ number: `S0${i + 1}`, scenarioId: 'dns-resolution' })) });
  for (const [index, domain] of DOMAINS.entries()) {
    const scenarioId = domain.scenarios.find(id => SCENARIOS.find(scenario => scenario.id === id)?.level >= 4);
    if (!scenarioId) throw new Error(`No level-four scenario for ${domain.id}`);
    for (let i = 0; i < 50; i++) archives.push(cleanCareer(`mastery-${index}-${i}`, {
      scenarioIds: [scenarioId], completedTickets: [{ number: `${index}-${i}`, scenarioId }],
    }));
  }
  if (astral) {
    const dns = DOMAINS.find(domain => domain.id === 'dns');
    const scenarioId = dns.scenarios.find(id => SCENARIOS.find(scenario => scenario.id === id)?.level >= 4);
    for (let i = 0; i < 2500; i++) archives.push(cleanCareer(`dns-prestige-${i}`, { level: 6,
      scenarioIds: [scenarioId], completedTickets: [{ number: `dns-${i}`, scenarioId }],
      companionReward: { version: 1, characterId: 'chimera', xp: 150 },
    }));
  }
  for (const id of ['snake', 'wolf', 'dragon']) for (const [index, xp] of [18000, 18000, SWITCH_XP - 54000].entries()) {
    archives.push(xpRun(`xp-${id}-${index + 1}`, id, xp));
  }
  return archives;
}

module.exports = { secretArchives };
