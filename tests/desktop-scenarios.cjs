'use strict';
// Deterministic local-only AI substitute for the hidden Electron smoke window.
function smokeAI({ prompt, schema }) {
  const input = JSON.parse(prompt.split('<daten-json>\n')[1].split('\n</daten-json>')[0]);
  const previous = input.previous;
  const switched = input.playerAction.match(/^Wechsel (S\d+)$/)?.[1];
  const active = input.waitStep?.activeNumber || switched || previous?.hidden.active || input.plan[0].number;
  const waiting = input.waitStep?.waiting ?? previous?.waiting ?? 0;
  const elapsed = input.waitStep?.elapsed ?? (previous ? Math.min((input.duration || Infinity) - waiting, previous.elapsed + (switched ? 1 : 10)) : 0);
  const clock = elapsed + waiting;
  const solved = input.playerAction === 'Abschluss prüfen';
  const completed = input.mode === 'career' && (solved || input.playerAction === 'Aufgeben') || input.playerAction === 'Schicht beenden' || input.mode === 'speedrun' && clock >= input.duration;
  const people = [['Anna Berger', 'Buchhaltung', 'Zugriff auf Monatsabschluss fehlt'], ['David Kaya', 'Logistik', 'Scanner erreichen Lagerdienst nicht'], ['Mia Huber', 'Vertrieb', 'Kundenportal lädt nicht'], ['Jonas Weiss', 'Personal', 'Anmeldung an Zeiterfassung scheitert']];
  const queue = input.plan.filter(item => item.minute <= clock).map((item, i) => {
    const old = previous?.queue?.find(row => row.number === item.number);
    const person = people[i % people.length];
    return { number: item.number, requester: person[0], department: person[1], title: person[2],
      status: solved && item.number === active ? 'solved' : old?.status || 'open',
      closedAt: solved && item.number === active ? clock : old?.closedAt ?? null };
  });
  const selected = queue.find(item => item.number === active);
  const result = { reply: `**${selected.requester} · ${selected.department}**\n\n${solved ? 'Wiederherstellung geprüft und bestätigt.' : selected.title}\n\n⏱️ Simulierte Arbeitszeit: ${elapsed} Min. · Störungsdauer seit Meldung: ${elapsed} Min.`,
    ticket: { number: active, title: selected.title, priority: input.plan.find(item => item.number === active).priority, description: `${selected.requester} meldet: ${selected.title}.` }, queue,
    status: completed ? 'completed' : 'active', elapsed, waiting,
    report: completed ? '# Einsatz abgeschlossen\n\nWiederherstellung geprüft.\n\n| Kategorie | Punkte |\n|---|---|\n| Gesamt | 95 |' : null,
    summary: completed ? { score: solved ? 95 : 0, solved: queue.some(item => item.status === 'solved'), unnecessaryChecks: 0, wrongChanges: 0, strengths: 'Gezielte Prüfungen', gaps: 'Keine im Test', arrived: queue.length, solvedCount: queue.filter(item => item.status === 'solved').length, slaViolations: 0 } : null,
    hidden: { active, log: 'Isolierter UI-Test', tickets: input.plan.map(item => previous ? { number: item.number, state: 'Testzustand' } : { number: item.number, minute: item.minute, priority: item.priority, category: item.category, cause: 'Fiktive Testursache', configuration: 'Fiktive Testkonfiguration', consequences: 'Fiktive Testfolgen', referenceMinutes: 15, state: 'Testzustand' }) } };
  if (schema.properties.hidden.properties.environment) result.hidden.environment = 'Isolierte Testfirma mit mehreren Abteilungen.';
  return result;
}
module.exports = { smokeAI };
