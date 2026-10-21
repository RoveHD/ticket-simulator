'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { catalog, analyze } = require('../ui/passives');
const { CHARACTERS } = require('../server/characters');

const assistant = content => ({ role: 'assistant', content });
const user = content => ({ role: 'user', content });
function session(messages = [], overrides = {}) {
  return { mode: 'career', status: 'active', elapsed: 5,
    ticket: { number: '1001', title: 'Dateizugriff gestört', description: 'Der Dateiserver FS01 ist betroffen.', priority: 'P2' },
    queue: [{ number: '1001', requester: 'Anna Berger', department: 'Buchhaltung', priority: 'P2', status: 'open', arrivalMinute: 0 }],
    messages, ...overrides };
}
const text = result => JSON.stringify(result);

test('passive catalogue covers all nine characters and UMD works without DOM or Node in the browser', () => {
  assert.deepEqual(Object.keys(catalog), CHARACTERS.map(character => character.id));
  assert.equal(new Set(Object.values(catalog).map(passive => passive.id)).size, 9);
  for (const passive of Object.values(catalog)) {
    assert.ok(passive.name && passive.description);
    assert.ok(Object.isFrozen(passive));
  }
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', 'passives.js'), 'utf8'), browser);
  assert.equal(vm.runInContext('typeof TicketPassives.analyze', browser), 'function');
  assert.equal(analyze('unknown').items.length, 0);
  assert.ok(Object.isFrozen(catalog));
});

test('all nine passives produce different evidence-oriented analyses without mutation', () => {
  const value = session([user('Get-Service Spooler; Restart-Service Spooler'), assistant('Ping erfolgreich: Antwort von 10.10.0.5.\nDNS: dc01.example.local\nHTTP 503. Event ID 4625. Fehlercode 0x80070005.\nDer Dienst ist nicht erreichbar.')]);
  const input = { session: value, draft: 'Get-Service Spooler; Restart-Service Spooler' };
  const before = JSON.stringify(input);
  const results = Object.keys(catalog).map(id => analyze(id, input));
  assert.equal(new Set(results.map(text)).size, 9);
  assert.equal(JSON.stringify(input), before);
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    assert.ok(result.items.length && result.items.length <= 5);
    for (const entry of result.items) {
      assert.ok(entry.label.length <= 64 && entry.text.length <= 220);
      assert.ok(['neutral', 'attention', 'good'].includes(entry.tone));
    }
    assert.deepEqual(analyze(Object.keys(catalog)[index], input), result);
  }
});

test('Spurensinn and Fehlerspur only extract simulator observations, never user assertions or drafts', () => {
  const value = session([user('Ping 203.0.113.66; Event ID 9999; Host forged.example.local'), assistant('Antwort von 10.0.0.4. Host: dc01.example.local\nEvent ID 4625\nHTTP/1.1 503 Service Unavailable\nFehlercode: 0x80070005')]);
  const input = { session: value, draft: 'Error 7777; ping 192.0.2.99' };
  const traces = analyze('snake', input), codes = analyze('raven', input);
  assert.match(text(traces), /10\.0\.0\.4|dc01\.example\.local/);
  assert.match(text(codes), /4625|503|0X80070005/);
  assert.doesNotMatch(text(traces), /203\.0\.113\.66|192\.0\.2\.99|forged/);
  assert.doesNotMatch(text(codes), /9999|7777/);
  assert.ok(traces.items.every(entry => entry.evidence.includes('Simulatorantwort #2')));
  assert.ok(codes.items.every(entry => entry.evidence.includes('Simulatorantwort #2')));
  const unverified = analyze('snake', { session: session([], { ticket: { number: '1001', description: 'Meldung nennt 192.0.2.1.' } }) });
  assert.match(unverified.items[0].label, /Meldung/);
  assert.equal(unverified.items[0].evidence, 'Aktuelle Ticketmeldung');
});

test('invalid IPv4 and file names are not promoted to addresses, while DC01 and AD01 remain visible hosts', () => {
  const value = session([assistant('999.20.1.2 und 10.300.0.1 sind Text. Datei app.exe; Logs service.log.\nAntwort von 10.1.2.3. Ziel https://portal.example.local/login\nDC01 und AD01 sind genannt.')]);
  const result = text(analyze('snake', { session: value }));
  assert.match(result, /10\.1\.2\.3|portal\.example\.local/);
  assert.match(result, /DC01 · AD01/);
  assert.doesNotMatch(result, /999\.20\.1\.2|10\.300\.0\.1|app\.exe|service\.log/);
});

test('Rudelblick only counts arrived public queue entries and keeps priority and affected departments distinct', () => {
  const value = session([], { elapsed: 20, queue: [
    { number: 'S01', requester: 'Anna', department: 'Vertrieb', priority: 'P3', status: 'open', arrivalMinute: 0 },
    { number: 'S02', requester: 'Ben', department: 'Lager', priority: 'P1', status: 'open', arrivalMinute: 10 },
    { number: 'S03', requester: 'Secret Future Person', department: 'Future Secret', priority: 'P1', status: 'open', arrivalMinute: 30 },
    { number: 'S04', requester: 'Clara', department: 'Archiv', priority: 'P2', status: 'solved', arrivalMinute: 15 },
  ], ticket: { number: 'S02', title: 'Aktuelle Meldung' } });
  const result = analyze('wolf', { session: value });
  assert.match(text(result), /Ben · Lager/);
  assert.match(text(result), /2 offen · P1: 1 · P2: 0 · P3: 1/);
  assert.doesNotMatch(text(result), /Future|Secret|Archiv/);
});

test('Schutzinstinkt warns about an unsent risky draft and respects explicit negation and read-only commands', () => {
  const old = session([user('Restart-Service Spooler'), assistant('Der Dienst wurde neu gestartet.')]);
  assert.doesNotMatch(text(analyze('dragon', { session: old, draft: '' })), /Laufende Verbindungen|attention/);
  const commands = [
    ['Restart-Service Spooler', 'Neustart'], ['Stop-Service Spooler', 'Dienst oder Prozess'],
    ['Set-NetFirewallProfile -Enabled $false', 'Sicherheitsfunktion'], ['Firewall deaktivieren', 'Sicherheitsfunktion'],
    ['Remove-Item C:\\Daten -Recurse', 'Löschen'], ['format C:', 'Löschen'],
    ['Set-GPRegistryValue -Name Test', 'Richtlinien'], ['chmod 777 /srv/data', 'Berechtigungen'],
  ];
  for (const [draft, expected] of commands) {
    const result = analyze('dragon', { session: old, draft });
    assert.ok(result.items.some(entry => entry.tone === 'attention' && entry.label.includes(expected)), draft);
    assert.match(text(result), /Ungesendeter Entwurf/);
  }
  for (const draft of ['Get-Service Spooler', 'Firewall nicht deaktivieren', 'Nicht neu starten.', 'Keine Dateien löschen.', 'Im Format CSV anzeigen.', 'Ohne den Dienst zu stoppen prüfen.']) {
    assert.equal(analyze('dragon', { draft }).items.filter(entry => entry.tone === 'attention').length, 0, draft);
  }
  const mixed = analyze('dragon', { draft: 'Firewall nicht deaktivieren; Rechner neu starten' });
  assert.equal(mixed.items.length, 1);
  assert.equal(mixed.items[0].label, 'Neustart');
});

test('Gegenprobe separates explicit successes and failures without reversing negated errors or inventing service checks', () => {
  const value = session([assistant('Ping erfolgreich: Antwort von 10.0.0.5.\nDienst nicht erreichbar. HTTP 503.\nKein Fehler beim Ping. Timeout nicht aufgetreten.')]);
  const result = analyze('snake-coral', { session: value });
  const positive = result.items.find(entry => entry.tone === 'good');
  const negative = result.items.find(entry => entry.tone === 'attention');
  assert.match(positive.text, /Ping erfolgreich|Kein Fehler|Timeout nicht aufgetreten/);
  assert.match(negative.text, /Dienst nicht erreichbar|HTTP 503/);
  assert.doesNotMatch(negative.text, /Kein Fehler|Timeout nicht aufgetreten/);
  const namedOnly = analyze('snake-coral', { session: session([assistant('DNS-Server: dc01.example.local\nDer Dienst Spooler.\nSoll der Dienst neu gestartet werden?\nHTTP 200 wurde nicht bestätigt.')]) });
  assert.equal(namedOnly.items.some(entry => ['good', 'attention'].includes(entry.tone)), false);
});

test('Echoortung recognizes repeated requests without treating user claims as confirmed changes', () => {
  const entries = [user('Get-Service Spooler'), assistant('Status: Stopped'), user('Ich habe den Dienst neu gestartet.')];
  const repeated = analyze('wolf-night', { session: session(entries), draft: 'get-service   spooler' });
  assert.equal(repeated.items[0].tone, 'attention');
  assert.match(repeated.items[0].text, /bereits abgesendet/);
  const changed = analyze('wolf-night', { session: session([...entries, assistant('Der Dienst Spooler wurde neu gestartet.')]), draft: 'Get-Service Spooler' });
  assert.equal(changed.items[0].tone, 'good');
  assert.match(changed.items[0].text, /erneute Prüfung kann/);
  const unchanged = analyze('wolf-night', { session: session([...entries, assistant('Der Dienst wurde nicht neu gestartet.')]), draft: 'Get-Service Spooler' });
  assert.equal(unchanged.items[0].tone, 'attention');
  const differentTarget = analyze('wolf-night', { session: session(entries), draft: 'Get-Service DNS' });
  assert.equal(differentTarget.items[0].tone, 'neutral');
  for (const [previous, draft] of [['Get-ADUser user_one', 'Get-ADUser userone'], ['Get-Item C:\\*', 'Get-Item C:\\']]) {
    const distinct = analyze('wolf-night', { session: session([user(previous), assistant('Bisheriger Auftrag verarbeitet.')]), draft });
    assert.equal(distinct.items[0].tone, 'neutral', `${previous} differs from ${draft}`);
  }
});

test('Fährtenleser names only mentioned systems and Standwache never infers a solution from a user message', () => {
  const value = session([user('Alles behoben!'), assistant('Getestet wurde bisher nur Ping.')], { ticket: { number: '1001', title: 'DNS und DHCP betroffen', description: 'VPN-Zugriff auf den Dateiserver.' } });
  const focus = analyze('fox', { session: value });
  assert.match(focus.items[0].text, /VPN|Dateiserver/);
  assert.doesNotMatch(text(focus), /Ursache ist|Restart-Service|behoben/);
  const watch = analyze('dragon-frost', { session: value });
  assert.match(text(watch), /Wiederherstellung noch offen/);
  assert.ok(watch.items.some(entry => entry.label === 'Zuletzt abgesendeter Auftrag' && entry.evidence.includes('kein Ergebnisnachweis')));
  const ended = analyze('dragon-frost', { session: session([], { status: 'completed', queue: [] }) });
  assert.match(text(ended), /erfolgreiche Lösung.*nicht bestätigt/);
});

test('Speedrun switch and mixed response blocks isolate observations and repeated actions by actual ticket scope', () => {
  const shared = [
    assistant('Ticket #S01\nAntwort von 10.1.0.1. Event ID 1111'),
    user('Get-Service Spooler'), assistant('Dienst nicht erreichbar.'),
    user('Wechsel S02'), assistant('Antwort von 10.2.0.2. Event ID 2222'),
  ];
  const current = session(shared, { mode: 'speedrun', ticket: { number: 'S02', description: 'Neue Meldung ohne weitere Angaben.' } });
  assert.match(text(analyze('snake', { session: current })), /10\.2\.0\.2/);
  assert.doesNotMatch(text(analyze('snake', { session: current })), /10\.1\.0\.1/);
  assert.match(text(analyze('raven', { session: current })), /2222/);
  assert.doesNotMatch(text(analyze('raven', { session: current })), /1111/);
  assert.equal(analyze('wolf-night', { session: current, draft: 'Get-Service Spooler' }).items[0].tone, 'neutral');
  const mixed = session([assistant('Ticket #S01\nEvent ID 1111\nTicket #S02\nEvent ID 2222')], { mode: 'speedrun', ticket: { number: 'S02' } });
  assert.match(text(analyze('raven', { session: mixed })), /2222/);
  assert.doesNotMatch(text(analyze('raven', { session: mixed })), /1111/);
  const unknown = session([assistant('Event ID 9999 auf einem nicht zugeordneten System.')], { mode: 'speedrun', ticket: { number: 'S03', description: 'Meldung: Ziel 192.0.2.3' } });
  assert.doesNotMatch(text(analyze('raven', { session: unknown })), /9999/);
  assert.match(text(analyze('snake', { session: unknown })), /192\.0\.2\.3/);
  assert.match(analyze('raven', { session: unknown }).note, /kein Simulatorblock sicher zugeordnet/);
});

test('host XP notes never replace technical observations and hidden fields are never accessed or leaked', () => {
  const value = session([
    assistant('Antwort von 10.0.0.7. Event ID 4625'),
    assistant('**Feuerkraft aktiviert.** +125 Spieler-XP. Cooldown: 50 simulierte Arbeitsminuten.'),
    assistant('**Rudelgeist · Ticket #1001:** +100 Begleiter-EP als Fähigkeitsbonus verdient.'),
  ]);
  for (const key of ['hidden', 'plan', 'cause', 'configuration', 'log']) Object.defineProperty(value, key, { get() { throw Error(`Forbidden read: ${key}`); } });
  for (const key of ['hidden', 'cause', 'configuration']) Object.defineProperty(value.ticket, key, { get() { throw Error(`Forbidden ticket read: ${key}`); } });
  for (const id of Object.keys(catalog)) {
    const result = analyze(id, { session: value, draft: 'Get-Service Spooler' });
    assert.doesNotMatch(text(result), /Feuerkraft aktiviert|Fähigkeitsbonus verdient/);
  }
  assert.equal(analyze('dragon-frost', { session: value }).items[0].evidence, 'Simulatorantwort #1');
});

test('large histories, malformed values and empty states stay bounded and honest', () => {
  const messages = Array.from({ length: 10000 }, (_, index) => assistant(`Event ID ${index % 10000}\n` + 'a'.repeat(5000)));
  const value = session(messages);
  for (const id of Object.keys(catalog)) {
    const result = analyze(id, { session: value, draft: 'Restart-Service Spooler '.repeat(10000) });
    assert.ok(result.items.length <= 5);
    assert.ok(result.items.every(entry => entry.text.length <= 220 && entry.label.length <= 64 && (!entry.evidence || entry.evidence.length <= 140)));
    assert.doesNotThrow(() => analyze(id, { session: null, draft: null }));
  }
  assert.match(text(analyze('snake', { session: session([], { ticket: { number: '1001', description: 'Noch keine technischen Angaben.' } }) })), /keine passenden/i);
});
