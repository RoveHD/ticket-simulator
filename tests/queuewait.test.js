'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { canWaitForArrival, waitStep } = require('../server/queue');
const { responseSchema, promptFor } = require('../server/simulation');
const WAIT = 'Bis zur nächsten Meldung warten';
const dataFrom = prompt => JSON.parse(prompt.split('<daten-json>\n')[1].split('\n</daten-json>')[0]);

function sessionFor(minutes = [0, 20, 40]) {
  const plan = minutes.map((minute, index) => ({ number: `S0${index + 1}`, minute, priority: 'P3',
    category: 'DNS', scenarioId: 'dns-resolution', briefing: 'Namensauflösung gestört.' }));
  return { id: 'run-wait', mode: 'speedrun', level: 3, duration: 60, companionId: 'snake', plan,
    messages: [{ role: 'assistant', content: 'S01 ist gelöst. Schicht: 7/60 Min.' }],
    current: { ticket: { number: 'S01', title: 'Meldung S01', priority: 'P3', description: 'Bekannte Meldung.' },
      reply: 'S01 ist gelöst. Schicht: 7/60 Min.', status: 'active', elapsed: 7, waiting: 0, report: null, summary: null,
      queue: [{ number: 'S01', title: 'Meldung S01', requester: 'Anna', department: 'Vertrieb', status: 'solved', closedAt: 7 }],
      hidden: { environment: 'Isolierte Testfirma.', active: 'S01', log: 'S01 nach Wiederherstellung geprüft, ohne Hilfen oder Fehler.',
        tickets: plan.map((row, index) => ({ number: row.number, minute: row.minute, priority: row.priority, category: row.category,
          cause: `Private Ursache ${row.number}`, configuration: 'Private Konfiguration.', consequences: 'Namensauflösung gestört.',
          referenceMinutes: 15, state: index ? 'Noch nicht eingegangen.' : 'Wiederherstellung geprüft.' })) } } };
}

function simulatedReply({ prompt }) {
  const input = dataFrom(prompt), previous = input.previous, step = input.waitStep;
  const elapsed = step ? step.elapsed : previous.elapsed + 7;
  const waiting = step ? step.waiting : previous.waiting;
  const clock = elapsed + waiting;
  const active = step?.activeNumber || previous.hidden.active;
  const queue = input.plan.filter(row => row.minute <= clock).map(row => {
    const old = previous.queue.find(entry => entry.number === row.number);
    if (old) return !step && row.number === active ? { ...old, status: 'solved', closedAt: clock } : { ...old };
    return { number: row.number, title: `Meldung ${row.number}`, requester: `Person ${row.number}`, department: 'Logistik', status: 'open', closedAt: null };
  });
  const current = queue.find(row => row.number === active), planned = input.plan.find(row => row.number === active);
  const completed = clock >= input.duration;
  return { elapsed, waiting, status: completed ? 'completed' : 'active',
    ticket: { number: active, title: current.title, priority: planned.priority, description: `Gemeldetes Zugriffsproblem von ${current.requester}.` },
    reply: `${completed ? 'Schicht beendet.' : `Aktuelle Meldung ${active}: ${current.title}.`} Schicht: ${clock}/${input.duration} Min.`, queue,
    report: completed ? `# Schicht abgeschlossen\nAktive Arbeit: ${elapsed} Min. Wartezeit: ${waiting} Min.\nGelöst: ${queue.filter(row => row.status === 'solved').length}` : null,
    summary: completed ? { score: queue.filter(row => row.status === 'solved').length * 95,
      solved: queue.some(row => row.status === 'solved'), wrongChanges: 0, unnecessaryChecks: 0, strengths: 'Gezielte Prüfung', gaps: 'Keine im Test',
      arrived: queue.length, solvedCount: queue.filter(row => row.status === 'solved').length, slaViolations: 0 } : null,
    hidden: { active, log: `${previous.hidden.log}\n${step ? 'Auf Meldung gewartet.' : 'Wiederherstellung geprüft.'}`,
      tickets: previous.hidden.tickets.map(row => ({ number: row.number, state: row.state })) } };
}

async function fixture(t, session = sessionFor(), options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-queuewait-'));
  fs.mkdirSync(path.join(root, '.sim'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Alle Aktionen simulieren. Ursachen und Pläne unverändert erhalten.');
  const file = path.join(root, '.sim', 'ui-state.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, model: 'gpt-6-luna', rewardCatalogVersion: 2, masteryCatalogVersion: 2,
    companionLevelVersion: 2, companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, environment: session.current.hidden.environment,
    archives: [], session }));
  let app, base, token, calls = 0, mutation = null;
  const inputs = [];
  const ai = async args => {
    calls++; inputs.push({ input: dataFrom(args.prompt), schema: args.schema });
    if (options.ai) return options.ai(args);
    const result = simulatedReply(args);
    return mutation ? mutation(result) : result;
  };
  async function open() {
    app = createApp({ root, ai, authCheck: async () => ({ available: options.auth !== false }) });
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
    token = (await (await fetch(`${base}/api/bootstrap`)).json()).token;
  }
  await open();
  t.after(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { file, inputs, calls: () => calls, mutate: next => { mutation = next; }, saved: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    async restart() { await app.close(); await open(); },
    async request(route = 'state', body) {
      const response = await fetch(`${base}/api/${route}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'X-Sim-Token': token, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, data: await response.json() };
    }, wait(message = WAIT) { return this.request('message', { message }); } };
}

test('host wait computes only the next actual arrival, preserves work time and supports explicit aliases', () => {
  const session = sessionFor();
  for (const message of [WAIT, 'Warten', 'auf nächstes Ticket warten', 'Auf das nächste Ticket warten.', 'Auf nächste Meldung warten']) {
    assert.deepEqual(waitStep(session, message), { elapsed: 7, waiting: 13, clock: 20, activeNumber: 'S02' });
  }
  assert.equal(waitStep(session, 'DNS prüfen'), null);
  assert.deepEqual(waitStep(sessionFor([0]), WAIT), { elapsed: 7, waiting: 53, clock: 60, activeNumber: 'S01' });
  const fraction = sessionFor(); fraction.current.elapsed = 7.1;
  const fractionalStep = waitStep(fraction, WAIT);
  assert.equal(fractionalStep.elapsed + fractionalStep.waiting, 20);
});

test('wait schema and prompt bind clock, active ticket and status without check or help penalties', () => {
  const session = sessionFor(), step = { ...waitStep(session, WAIT), duration: session.duration };
  const schema = responseSchema(session.current, session.current.hidden.environment, step);
  assert.deepEqual(schema.properties.elapsed.enum, [7]);
  assert.deepEqual(schema.properties.waiting.enum, [13]);
  assert.deepEqual(schema.properties.status.enum, ['active']);
  assert.deepEqual(schema.properties.ticket.properties.number.enum, ['S02']);
  assert.deepEqual(schema.properties.hidden.properties.active.enum, ['S02']);
  assert.equal(schema.properties.summary.type, 'null');
  const prompt = promptFor({ session, previous: session.current, message: WAIT, history: session.messages,
    rules: 'Simulationsregeln.', environment: session.current.hidden.environment, baseline: {}, waitStep: step });
  assert.deepEqual(dataFrom(prompt).waitStep, step);
  assert.match(prompt, /keine Arbeitsminute und keine Wechselminute/);
  assert.match(prompt, /weder Check noch Hilfe noch Fehlentscheidung/);
  const end = sessionFor([0]);
  const endSchema = responseSchema(end.current, end.current.hidden.environment, { ...waitStep(end, WAIT), duration: 60 });
  assert.deepEqual(endSchema.properties.status.enum, ['completed']);
  assert.equal(endSchema.properties.report.type, 'string');
  assert.equal(endSchema.properties.summary.type, 'object');
});

test('empty speedrun waits to the exact arrival, activates a visible open ticket and persists through restart', async t => {
  const session = sessionFor(), f = await fixture(t, session);
  const initial = (await f.request()).data;
  assert.equal(initial.session.canWaitForArrival, true);
  assert.ok(!JSON.stringify(initial).includes('S02'));
  const result = await f.wait();
  assert.equal(result.status, 200);
  assert.equal(result.data.session.elapsed, 20);
  assert.equal(result.data.session.ticket.number, 'S02');
  assert.match(result.data.session.messages.at(-1).content, /S02/);
  assert.equal(result.data.session.queue.find(row => row.number === 'S02').status, 'open');
  assert.equal(result.data.session.queue.find(row => row.number === 'S02').active, true);
  assert.equal(result.data.session.canWaitForArrival, false);
  assert.ok(!JSON.stringify(result.data).includes('S03'));
  assert.ok(!JSON.stringify(result.data).includes('waitStep'));
  const saved = f.saved();
  assert.equal(saved.session.current.elapsed, 7);
  assert.equal(saved.session.current.waiting, 13);
  assert.deepEqual(saved.session.plan, session.plan);
  assert.deepEqual(saved.session.current.queue[0], session.current.queue[0]);
  assert.equal(saved.archives.length, 0);
  assert.equal(result.data.game.companion.current.xp, 0);
  await f.restart();
  const restarted = (await f.request()).data;
  assert.deepEqual(restarted.session, result.data.session);
  assert.equal(restarted.game.companion.current.xp, 0);
});

test('work after waiting keeps waiting cumulative and grants XP only at shift completion', async t => {
  const f = await fixture(t, sessionFor([0, 20]));
  await f.wait('Warten');
  const worked = await f.request('message', { message: 'Wiederherstellung prüfen' });
  assert.equal(worked.status, 200);
  assert.equal(worked.data.session.elapsed, 27);
  assert.equal(worked.data.session.canWaitForArrival, true);
  assert.equal(worked.data.game.companion.current.xp, 0);
  const finished = await f.wait();
  assert.equal(finished.status, 200);
  assert.equal(finished.data.session.status, 'completed');
  assert.equal(finished.data.session.elapsed, 60);
  assert.equal(finished.data.session.canWaitForArrival, false);
  assert.match(finished.data.session.report, /Aktive Arbeit: 14 Min. Wartezeit: 46 Min./);
  const saved = f.saved(), archive = saved.archives[0];
  assert.equal(archive.elapsed, 14);
  assert.equal(archive.waiting, 46);
  assert.equal(archive.summary.solvedCount, 2);
  assert.equal(archive.summary.unnecessaryChecks, 0);
  assert.equal(archive.summary.wrongChanges, 0);
  assert.equal(finished.data.game.companion.current.xp, 300);
  assert.deepEqual(archive.completedTickets.map(row => row.number), ['S01', 'S02']);
});

test('legacy plans without future arrivals wait to the boundary and produce a complete shift report', async t => {
  const session = sessionFor([0]), f = await fixture(t, session);
  const result = await f.wait('auf nächstes Ticket warten');
  assert.equal(result.status, 200);
  assert.equal(result.data.session.status, 'completed');
  assert.equal(result.data.session.elapsed, 60);
  assert.match(result.data.session.report, /Aktive Arbeit: 7 Min. Wartezeit: 53 Min./);
  assert.deepEqual(f.saved().session.plan, session.plan);
  assert.equal(f.saved().archives[0].summary.arrived, 1);
  assert.equal(f.saved().archives[0].summary.solvedCount, 1);
  assert.equal(result.data.game.companion.current.xp, 150);
});

test('open, unknown legacy and career tickets cannot be skipped by waiting or invoke inference', async t => {
  for (const kind of ['open', 'other-open', 'unknown', 'career']) await t.test(kind, async sub => {
    const session = sessionFor(kind === 'career' ? [0] : undefined);
    if (kind === 'open') { session.current.queue[0].status = 'open'; session.current.queue[0].closedAt = null; }
    if (kind === 'other-open') {
      session.plan[1].minute = 5; session.current.hidden.tickets[1].minute = 5;
      session.current.queue.push({ number: 'S02', title: 'Andere offene Meldung', requester: 'David', department: 'Vertrieb', status: 'open', closedAt: null });
    }
    if (kind === 'unknown') delete session.current.queue;
    if (kind === 'career') { session.mode = 'career'; session.duration = null; }
    assert.equal(canWaitForArrival(session), false);
    const f = await fixture(sub, session), before = fs.readFileSync(f.file, 'utf8');
    assert.equal((await f.request()).data.session.canWaitForArrival, false);
    assert.equal((await f.wait()).status, 400);
    assert.equal(f.calls(), 0);
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  });
});

test('malformed wait results, auto-solutions and unplanned arrivals roll back the entire action', async t => {
  const f = await fixture(t), before = fs.readFileSync(f.file, 'utf8');
  for (const mutation of [
    result => { result.elapsed++; }, result => { result.waiting++; },
    result => { result.hidden.active = 'S01'; result.ticket.number = 'S01'; },
    result => { result.hidden.active = 'S03'; result.ticket.number = 'S03'; },
    result => { result.queue[1].status = 'solved'; result.queue[1].closedAt = 20; },
    result => { result.queue[1].status = 'abandoned'; result.queue[1].closedAt = 20; },
    result => { result.queue.pop(); }, result => { result.queue[1].number = 'unplanned'; },
    result => { result.queue[0].title = 'Ungefragt geändert'; },
    result => { result.hidden.tickets[0].state = 'Ungefragt geändert'; },
    result => { result.hidden.tickets[2].state = 'Zukünftigen Fall verändert'; },
    result => { result.ticket.description = ''; },
    result => { result.status = 'completed'; result.report = 'Vorzeitiger Abschluss';
      result.summary = { score: 95, solved: true, wrongChanges: 0, unnecessaryChecks: 0, strengths: '', gaps: '', arrived: 2, solvedCount: 1, slaViolations: 0 }; },
  ]) {
    f.mutate(result => { mutation(result); return result; });
    const response = await f.wait();
    assert.equal(response.status, 502, JSON.stringify(response.data));
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    assert.equal((await f.request()).data.session.elapsed, 7);
  }
});

test('a wait reaching the end cannot omit the report or claim inconsistent summary evidence', async t => {
  const f = await fixture(t, sessionFor([0])), before = fs.readFileSync(f.file, 'utf8');
  for (const mutate of [result => { result.report = null; }, result => { result.summary.solvedCount = 0; },
    result => { result.summary.solved = false; }, result => { result.status = 'active'; result.summary = null; result.report = null; }]) {
    f.mutate(result => { mutate(result); return result; });
    assert.equal((await f.wait()).status, 502);
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  }
});

test('waiting keeps authentication and AI-failure rollback intact', async t => {
  const denied = await fixture(t, sessionFor(), { auth: false });
  const before = fs.readFileSync(denied.file, 'utf8');
  assert.equal((await denied.wait()).status, 503);
  assert.equal(denied.calls(), 0);
  assert.equal(fs.readFileSync(denied.file, 'utf8'), before);
  const failed = await fixture(t, sessionFor(), { ai: async () => { throw new Error('Injected inference failure'); } });
  const original = fs.readFileSync(failed.file, 'utf8');
  assert.equal((await failed.wait()).status, 502);
  assert.equal(fs.readFileSync(failed.file, 'utf8'), original);
});

test('cancelling a pending wait leaves both clocks, plan, messages and queue unchanged', async t => {
  let started;
  const whenStarted = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, sessionFor(), { ai: async args => {
    started();
    await new Promise((resolve, reject) => args.signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true }));
  } });
  const before = fs.readFileSync(f.file, 'utf8');
  const pending = f.wait();
  await whenStarted;
  assert.equal((await f.request()).data.session.elapsed, 7);
  assert.equal((await f.request('cancel', {})).status, 200);
  assert.equal((await pending).status, 499);
  assert.equal(fs.readFileSync(f.file, 'utf8'), before);
  assert.equal((await f.request()).data.busy, false);
});
