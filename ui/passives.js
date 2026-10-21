(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TicketPassives = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const catalog = Object.freeze(Object.fromEntries([
    ['snake', 'trace-sense', 'Spurensinn', 'Bündelt im aktuellen Ticket sichtbar genannte IP-Adressen und Rechnernamen mit ihrer Quelle.'],
    ['wolf', 'pack-view', 'Rudelblick', 'Ordnet meldende Personen, Abteilungen und Prioritäten der bereits eingegangenen Tickets.'],
    ['dragon', 'protective-instinct', 'Schutzinstinkt', 'Markiert mögliche Risiken in deinem noch nicht abgesendeten Entwurf.'],
    ['snake-coral', 'cross-check', 'Gegenprobe', 'Stellt eindeutige positive und negative Testaussagen der letzten zugeordneten Simulatorantwort gegenüber.'],
    ['fox', 'trail-reader', 'Fährtenleser', 'Bündelt im aktuellen Ticket genannte Systeme und Dienste zu einem kurzen Fokus.'],
    ['wolf-night', 'echo-location', 'Echoortung', 'Erkennt identische frühere Prüfaufträge und berücksichtigt seitdem bestätigte Änderungen.'],
    ['raven', 'error-trace', 'Fehlerspur', 'Sammelt sichtbare Fehlercodes, Ereignis-IDs und HTTP-Status mit ihren Fundstellen.'],
    ['dragon-frost', 'watchkeeper', 'Standwache', 'Zeigt die letzte zugeordnete Simulatorbeobachtung neben deinem letzten gesendeten Auftrag.'],
    ['chimera', 'triad', 'Dreiklang', 'Verbindet sichtbare Netzspuren, Fehlercodes und die Risikoprüfung deines Entwurfs.'],
  ].map(([character, id, name, description]) => [character, Object.freeze({ id, name, description })])));

  const MAX_HISTORY = 40, MAX_MESSAGE = 4000, MAX_HISTORY_TEXT = 32000;
  const string = (value, max = MAX_MESSAGE) => typeof value === 'string' ? value.slice(0, max) : '';
  const compact = (value, max = 220) => string(value, MAX_MESSAGE).replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  const unique = values => [...new Set(values)];
  const source = index => `Simulatorantwort #${index + 1}`;
  const item = (label, text, tone = 'neutral', evidence) => ({ label, text, tone, ...(evidence ? { evidence } : {}) });
  const empty = label => [item(label, 'Noch keine passenden, eindeutig zugeordneten Beobachtungen vorhanden.')];

  // These are host reward messages, not technical observations. Anchor to the
  // active ability names rather than filtering genuine "Firewall aktiviert" logs.
  const hostNote = /^\s*\*\*(?:Präzisionsbiss|Rudelgeist|Feuerkraft|Doppelbiss|Flinke Pfoten|Nachtjagd|Rückenwind|Frostkern|Konvergenz)(?:\s+aktiviert\.|\s*·\s*Ticket\s+#)/i;
  function ticketIds(text) {
    return unique((text.match(/\bS\d{1,4}\b/gi) || []).map(id => id.toUpperCase()));
  }
  function headingId(line) {
    const clean = line.replace(/^\s*(?:#{1,6}\s*)?(?:\*\*)?/, '');
    return clean.match(/^(?:Ticket\s*#?\s*|#\s*)(S\d{1,4})\b/i)?.[1].toUpperCase()
      || clean.match(/^(S\d{1,4})\s*[:–—-]/i)?.[1].toUpperCase() || null;
  }
  function currentBlocks(text, number) {
    const blocks = [];
    let selected = false, lines = [];
    const flush = () => { if (selected && lines.length) blocks.push(lines.join('\n')); lines = []; };
    for (const line of text.split('\n')) {
      const id = headingId(line);
      if (id) { flush(); selected = id === number; }
      // A differently numbered ticket inside a block makes that line ambiguous.
      const ids = ticketIds(line);
      if (selected && ids.some(value => value !== number)) { flush(); selected = false; }
      else if (selected) lines.push(line);
    }
    flush();
    return blocks;
  }

  function context(input) {
    const session = input && typeof input === 'object' ? input : {};
    const publicTicket = session.ticket && typeof session.ticket === 'object' ? session.ticket : {};
    const ticket = { number: string(publicTicket.number, 30).toUpperCase(), title: string(publicTicket.title, 500), description: string(publicTicket.description, MAX_MESSAGE), priority: string(publicTicket.priority, 2) };
    const elapsed = Number.isFinite(session.elapsed) && session.elapsed >= 0 ? session.elapsed : 0;
    const queue = (Array.isArray(session.queue) ? session.queue : []).slice(0, 120).filter(row => row && typeof row === 'object')
      .filter(row => !Number.isFinite(row.arrivalMinute) || row.arrivalMinute <= elapsed)
      .map(row => ({ number: string(row.number, 30).toUpperCase(), requester: string(row.requester, 150), department: string(row.department, 150),
        priority: /^P[1-4]$/.test(row.priority) ? row.priority : '', status: string(row.status, 20), title: string(row.title, 500) }));
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const history = [];
    let budget = MAX_HISTORY_TEXT;
    for (let index = messages.length - 1; index >= Math.max(0, messages.length - MAX_HISTORY) && budget > 0; index--) {
      const entry = messages[index];
      if (!entry || !['assistant', 'user'].includes(entry.role)) continue;
      const text = string(entry.content, Math.min(MAX_MESSAGE, budget));
      budget -= text.length;
      if (text.trim()) history.unshift({ role: entry.role, text, index });
    }
    const speedrun = session.mode === 'speedrun' || /^S\d{1,4}$/.test(ticket.number);
    let scope = null;
    const observations = [], actions = [];
    for (const entry of history) {
      if (entry.role === 'user') {
        const switched = entry.text.trim().match(/^Wechsel\s+(S\d{1,4})[.!]?$/i);
        if (switched) scope = switched[1].toUpperCase();
        if (!speedrun || scope === ticket.number) actions.push(entry);
        continue;
      }
      if (hostNote.test(entry.text)) continue;
      if (!speedrun) { observations.push(entry); continue; }
      const ids = ticketIds(entry.text);
      if (ids.length > 1) {
        for (const block of currentBlocks(entry.text, ticket.number)) observations.push({ ...entry, text: block });
        scope = null;
      } else if (ids.length === 1) {
        scope = ids[0];
        if (scope === ticket.number) observations.push(entry);
      } else if (scope === ticket.number) observations.push(entry);
    }
    return { ticket, queue, observations, actions, latest: observations.at(-1) || null,
      status: string(session.status, 20), speedrun, isolated: speedrun && !observations.length };
  }

  function evidenceText(ctx, { latest = false, includeTicket = false } = {}) {
    const rows = latest ? (ctx.latest ? [ctx.latest] : []) : ctx.observations;
    const values = rows.map(entry => ({ text: entry.text, evidence: source(entry.index) }));
    if (includeTicket && ctx.ticket.description) values.unshift({ text: ctx.ticket.description, evidence: 'Aktuelle Ticketmeldung' });
    return values;
  }
  function namedAddresses(text) {
    const ips = unique((text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])
      .filter(ip => ip.split('.').every(part => Number(part) <= 255)));
    const hosts = [];
    for (const raw of text.split(/\s+/).slice(0, 1200)) {
      const candidate = raw.replace(/^[`'"([{<]+|[`'"\])}>.,;]+$/g, '').replace(/^https?:\/\//i, '').split(/[\/?#:=]/)[0];
      if (candidate.length <= 253 && /^(?:[a-z0-9-]{1,63}\.)+[a-z][a-z0-9-]{1,62}$/i.test(candidate) && !/\.(?:exe|dll|log|txt|csv|json|xml|md|ps1|bat|cmd|conf|config)$/i.test(candidate)) hosts.push(candidate);
      else if (/^[A-Z][A-Z0-9-]{1,62}$/.test(candidate) && /[A-Z]/.test(candidate) && /\d/.test(candidate)) hosts.push(candidate);
    }
    return { ips, hosts: unique(hosts) };
  }
  function traces(ctx) {
    let rows = evidenceText(ctx);
    let reported = false;
    if (!rows.length && ctx.ticket.description) { rows = evidenceText(ctx, { includeTicket: true }); reported = true; }
    const ips = [], hosts = [], sources = [];
    for (const row of rows) {
      const found = namedAddresses(row.text);
      if (found.ips.length || found.hosts.length) sources.push(row.evidence);
      ips.push(...found.ips); hosts.push(...found.hosts);
    }
    const evidence = unique(sources).slice(-3).join(' · ');
    const result = [];
    if (ips.length) result.push(item(reported ? 'IP-Adressen in der Meldung' : 'Sichtbar genannte IP-Adressen', unique(ips).slice(0, 10).join(' · '), 'neutral', evidence));
    if (hosts.length) result.push(item(reported ? 'Rechnernamen in der Meldung' : 'Sichtbar genannte Rechnernamen', unique(hosts).slice(0, 8).join(' · '), 'neutral', evidence));
    return result.length ? result : empty('Spurensinn');
  }

  function pack(ctx) {
    const rows = ctx.queue.filter(row => ['open', 'unknown'].includes(row.status));
    const active = ctx.queue.find(row => row.number === ctx.ticket.number);
    const result = [];
    if (active?.requester || active?.department) result.push(item('Aktuelle Meldung', [active.requester, active.department].filter(Boolean).join(' · '), 'neutral', 'Öffentliche Queue des aktuellen Tickets'));
    if (ctx.queue.length) {
      const counts = ['P1', 'P2', 'P3', 'P4'].map(priority => `${priority}: ${rows.filter(row => row.priority === priority).length}`);
      result.push(item('Offene eingegangene Meldungen', `${rows.length} offen · ${counts.join(' · ')}`, rows.some(row => row.priority === 'P1') ? 'attention' : 'neutral', 'Öffentliche Queue; keine künftigen Tickets'));
      const departments = unique(rows.map(row => row.department).filter(Boolean));
      if (departments.length) result.push(item('Betroffene Abteilungen', departments.join(' · '), 'neutral', 'Abteilungen der offenen Queue-Einträge'));
    }
    if (!result.length && ctx.ticket.title) result.push(item('Aktuelle Meldung', ctx.ticket.title, 'neutral', 'Aktuelles Ticket; Betroffene noch nicht erfasst'));
    return result.length ? result : empty('Rudelblick');
  }

  const risks = [
    ['Neustart', /\b(?:Restart-(?:Computer|Service)|reboot|shutdown(?:\.exe)?|neu\s+(?:zu\s+)?starten|neustarten|Neustart)\b/gi, 'Der Entwurf erwähnt einen Neustart. Laufende Verbindungen oder Dienste können dabei unterbrochen werden.'],
    ['Dienst oder Prozess stoppen', /\b(?:Stop-(?:Service|Process)|taskkill|systemctl\s+stop|net\s+stop|(?:Dienst|Service|Prozess)[^\n.;]{0,45}(?:stoppen|beenden|anhalten))\b/gi, 'Der Entwurf erwähnt einen Dienst- oder Prozessstopp. Davon abhängige Funktionen können ausfallen.'],
    ['Sicherheitsfunktion ändern', /\b(?:ufw\s+disable|(?:Firewall)[^\n.;]{0,55}(?:deaktivieren|abschalten|ausschalten|disabled?|off)|(?:deaktivieren|abschalten|ausschalten)[^\n.;]{0,55}Firewall|Set-NetFirewallProfile[^\n;]{0,100}-Enabled\s+\$?false|netsh[^\n;]{0,80}state\s+off)\b/gi, 'Der Entwurf erwähnt das Abschalten einer Firewall. Dadurch kann sich der Schutz des betroffenen Systems verringern.'],
    ['Löschen oder formatieren', /\b(?:Remove-(?:Item|ADUser|ADComputer|GPO)|rm\s+-[a-z]*r[a-z]*|del|delete|Format-Volume|format(?=\s+(?:[a-z]:|[-/]))|formatieren|löschen|diskpart[^\n;]{0,40}\bclean|wipe)\b/gi, 'Der Entwurf enthält eine Lösch- oder Formatierungsaktion. Daten oder Konfiguration können dabei verloren gehen.'],
    ['Richtlinien ändern oder anwenden', /\b(?:Set-GP[A-Za-z]+|New-GPO|Remove-GPO|gpupdate[^\n;]{0,35}\/force|(?:GPO|Gruppenrichtlinie)[^\n.;]{0,50}(?:ändern|deaktivieren|löschen|anpassen))\b/gi, 'Der Entwurf erwähnt eine Richtlinienänderung oder erzwungene Anwendung. Der Wirkungsbereich kann mehrere Benutzer und Rechner betreffen.'],
    ['Berechtigungen ändern', /\b(?:Set-Acl|chmod|chown|icacls[^\n;]{0,100}\/(?:grant|deny|reset)|Berechtigung(?:en)?[^\n.;]{0,50}(?:vergeben|ändern|entfernen))\b/gi, 'Der Entwurf erwähnt eine Berechtigungsänderung. Zugriffe können dadurch erweitert oder entzogen werden.'],
  ];
  function negated(text, start, end) {
    const before = text.slice(Math.max(0, start - 70), start).split(/[,;\n.!?]|\b(?:aber|sondern|jedoch)\b/i).at(-1);
    const match = text.slice(start, end);
    const after = text.slice(end, end + 35).split(/[,;\n.!?]/)[0];
    return /\b(?:nicht|niemals|keine?[nmr]?|vermeide(?:n)?)\b/i.test(match)
      || /\b(?:nicht|niemals|keine?[nmr]?|ohne|vermeide(?:n)?)\b[^,;\n.!?]{0,35}$/i.test(before)
      || /^\s+(?:nicht|niemals|vermeiden|unterlassen)\b/i.test(after);
  }
  function draftRisks(draft) {
    const text = string(draft);
    const result = [];
    if (!text.trim()) return [item('Ungesendeter Entwurf', 'Noch kein Entwurf vorhanden. Bereits abgesendete Aufträge werden hier nicht als neue Aktion behandelt.')];
    for (const [label, pattern, explanation] of risks) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text))) {
        if (negated(text, match.index, match.index + match[0].length)) continue;
        result.push(item(label, explanation, 'attention', `Ungesendeter Entwurf: „${compact(text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 35), 100)}“`));
        break;
      }
    }
    return result.length ? result : [item('Entwurfsprüfung', 'Keine der erfassten riskanten Änderungen im Entwurf erkannt. Das ist keine vollständige Risikoprüfung und bestätigt keine Freigabe.')];
  }

  function clauses(text) {
    return string(text).split(/\n+|[,;]|\b(?:aber|jedoch)\b|[.!?]\s+(?=[A-ZÄÖÜ])/).slice(0, 140).map(value => compact(value, 400)).filter(Boolean);
  }
  function crossCheck(ctx) {
    if (!ctx.latest) return empty('Gegenprobe');
    const positive = [], negative = [];
    for (const clause of clauses(ctx.latest.text)) {
      if (/\?|\b(?:sollte|soll|würde|geplant|vorgeschlagen|vermutlich|vielleicht)\b|\bnicht\s+(?:geprüft|getestet|bestätigt|ausgeführt)\b/i.test(clause)) continue;
      const noIssue = /\b(?:kein(?:e|en)?|ohne)\s+(?:Fehler|Timeouts?|Zeitüberschreitungen|Probleme)\b|\b(?:Fehler|Timeouts?|Zeitüberschreitung)\s+(?:ist\s+)?nicht\s+(?:aufgetreten|vorhanden|erkennbar)\b|\bFehler\s*[:=]\s*0\b/i;
      const scrubbed = clause.replace(new RegExp(noIssue.source, 'gi'), '');
      const bad = /\b(?:nicht\s+(?:erreichbar|verfügbar|erfolgreich|gestartet)|keine\s+(?:Antwort|Verbindung|Auflösung)|fehlgeschlagen|failed|refused|unreachable|Zeitüberschreitung|Timeout|timed?\s+out|schlägt\s+fehl|Port\s+\d+\s+(?:ist\s+)?geschlossen|Fehler(?:code)?\s*[:=]?\s*(?:0x[0-9a-f]+|[1-9]\d*))\b|\bHTTP(?:\/\d(?:\.\d)?)?\s*[:=]?\s*[45]\d{2}\b/i.test(scrubbed);
      const good = !/\bnicht\s+ohne\b/i.test(clause) && (noIssue.test(clause)
        || !/\b(?:kann|können|könnte)\b/i.test(clause) && /\b(?:erfolgreich|erreichbar|verfügbar|funktioniert|gestartet|Antwort\s+von|Reply\s+from|Port\s+\d+\s+(?:ist\s+)?offen|TcpTestSucceeded\s*[:=]\s*True|Verloren\s*=\s*0)\b|\bHTTP(?:\/\d(?:\.\d)?)?\s*[:=]?\s*2\d{2}\b/i.test(clause));
      if (bad) negative.push(clause);
      else if (good) positive.push(clause);
    }
    const result = [];
    if (positive.length) result.push(item('Positive Textaussagen', positive.slice(0, 3).join(' · '), 'good', source(ctx.latest.index)));
    if (negative.length) result.push(item('Negative Textaussagen', negative.slice(0, 3).join(' · '), 'attention', source(ctx.latest.index)));
    return result.length ? result : empty('Gegenprobe');
  }

  const services = ['DNS', 'DHCP', 'Active Directory', 'LDAP', 'Kerberos', 'SMB', 'Dateiserver', 'Druckdienst', 'Spooler', 'Microsoft 365', 'M365', 'Exchange', 'Entra ID', 'VPN', 'Firewall', 'Routing', 'VMware', 'Hyper-V', 'ESXi', 'vCenter', 'Veeam', 'Backup', 'NAS', 'RAID', 'Storage', 'IIS', 'HTTP', 'HTTPS', 'SQL', 'RDP', 'SSH', 'systemd', 'Samba', 'Nginx', 'Apache', 'Docker', 'Kubernetes', 'Windows Update', 'GPO', 'Gruppenrichtlinie'];
  function trail(ctx) {
    const rows = evidenceText(ctx, { latest: true, includeTicket: true });
    const names = [], sources = [];
    for (const row of rows) for (const name of services) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(row.text)) { names.push(name); sources.push(row.evidence); }
    }
    if (names.length) return [item('Benannte Systeme und Dienste', unique(names).slice(0, 12).join(' · '), 'neutral', unique(sources).join(' · '))];
    const result = [];
    if (ctx.ticket.description || ctx.ticket.title) result.push(item('Ausgangspunkt der Meldung', compact(ctx.ticket.description || ctx.ticket.title), 'neutral', 'Aktuelle Ticketmeldung'));
    if (ctx.latest) result.push(item('Neueste Textbeobachtung', compact(ctx.latest.text), 'neutral', source(ctx.latest.index)));
    return result.length ? result : empty('Fährtenleser');
  }

  const normalized = text => string(text).trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
  function confirmedChange(text) {
    return clauses(text).some(clause => {
      if (/\b(?:nicht|kein(?:e|en)?|geplant|könnte|würde|soll|fehlgeschlagen)\b/i.test(clause)) return false;
      return /\b(?:wurde[n]?|ist|sind)\b.{0,90}\b(?:neu gestartet|gestoppt|aktiviert|deaktiviert|geändert|angepasst|gesetzt|aktualisiert|entfernt|installiert|wiederhergestellt)\b/i.test(clause)
        || /\b(?:Änderung|Neustart|Anpassung|Installation)\s+(?:wurde\s+)?erfolgreich\s+(?:abgeschlossen|durchgeführt|angewendet)\b/i.test(clause);
    });
  }
  function echo(ctx, draft) {
    const text = string(draft).trim();
    if (!text) return [item('Echoortung', 'Noch kein ungesendeter Prüfauftrag vorhanden.')];
    if (!/\b(?:ping|ipconfig|nslookup|Get-[a-z]+|Test-[a-z]+|Resolve-[a-z]+|tracert|traceroute|dig|netstat|curl|journalctl|prüf(?:e|en|ung)?|kontrollier(?:e|en)|analysier(?:e|en)|zeige|check|status|Ereignisanzeige)\b/i.test(text)) return [item('Echoortung', 'Im Entwurf ist kein eindeutiger Prüfauftrag erkennbar. Es wird keine bereits ausgeführte Prüfung behauptet.')];
    const previous = [...ctx.actions].reverse().find(entry => normalized(entry.text) === normalized(text));
    if (!previous) return [item('Prüfauftrag im Entwurf', 'In den zugeordneten sichtbaren Aufträgen wurde keine identische frühere Eingabe erkannt. Ältere oder anders formulierte Prüfungen sind damit nicht ausgeschlossen.')];
    const changed = ctx.observations.find(entry => entry.index > previous.index && confirmedChange(entry.text));
    return [item(changed ? 'Wiederholung nach Änderung' : 'Identischer Prüfauftrag bereits gesendet', changed
      ? 'Seit diesem Auftrag enthält eine zugeordnete Simulatorantwort eine bestätigte Änderung. Eine erneute Prüfung kann der Kontrolle dienen.'
      : 'Diesen Prüfauftrag hast du bereits abgesendet. Seitdem wurde keine eindeutige Änderung erkannt. Eine Wiederholungsmessung kann trotzdem sinnvoll sein.', changed ? 'good' : 'attention', `Gesendeter Auftrag #${previous.index + 1}${changed ? ` · Änderung in ${source(changed.index)}` : ''}`)];
  }

  function errors(ctx) {
    const found = new Map();
    const patterns = [
      ['Fehlercode', /\b(?:Fehler(?:code)?|Error(?:\s+code)?|Win32(?:\s+error)?)\s*[:=#]?\s*(0x[0-9a-f]{2,8}|\d{1,6})\b/gi],
      ['Ereignis-ID', /\b(?:Event(?:\s*-?\s*ID)?|Ereignis(?:\s*-?\s*ID)?)\s*[:=#]?\s*(\d{1,6})\b/gi],
      ['HTTP-Status', /\bHTTP(?:\/\d(?:\.\d)?)?(?:\s+(?:Status|Fehler|Error))?\s*[:=]?\s*([1-5]\d{2})\b/gi],
      ['Fehlercode', /\b(0x[0-9a-f]{4,8})\b/gi],
    ];
    for (const row of evidenceText(ctx)) for (const [label, pattern] of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(row.text))) {
        const code = match[1].toUpperCase(), key = label + code;
        const existing = found.get(key);
        if (existing) { existing.evidence = unique([...existing.evidence.split(' · '), row.evidence]).slice(-3).join(' · '); continue; }
        if (found.size >= 12) continue;
        const lineStart = row.text.lastIndexOf('\n', match.index) + 1;
        const lineEnd = row.text.indexOf('\n', match.index);
        const line = compact(row.text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd));
        const tone = label === 'HTTP-Status' ? Number(code) >= 400 ? 'attention' : 'good' : 'neutral';
        found.set(key, item(`${label} ${code}`, `Im Simulatortext: ${line}`, tone, row.evidence));
      }
    }
    return found.size ? [...found.values()].slice(-5) : empty('Fehlerspur');
  }

  function watch(ctx) {
    const result = [];
    if (ctx.latest) result.push(item('Letzte Simulatorbeobachtung', compact(ctx.latest.text), 'neutral', source(ctx.latest.index)));
    const action = ctx.actions.at(-1);
    if (action) result.push(item('Zuletzt abgesendeter Auftrag', compact(action.text), 'neutral', `Benutzereingabe #${action.index + 1}; kein neuer Entwurf und kein Ergebnisnachweis`));
    const row = ctx.queue.find(entry => entry.number === ctx.ticket.number);
    if (row?.status === 'solved') result.push(item('Öffentlicher Ticketstatus', `Ticket #${ctx.ticket.number} ist in der öffentlichen Queue als gelöst markiert.${ctx.status === 'active' && ctx.speedrun ? ' Die Schicht läuft weiter.' : ''}`, 'good', 'Öffentliche Queue; keine zusätzliche Prüfung'));
    else if (row?.status === 'abandoned') result.push(item('Öffentlicher Ticketstatus', 'Das aktuelle Ticket wurde laut öffentlicher Queue aufgegeben; eine Wiederherstellung ist damit nicht bestätigt.', 'attention', 'Öffentliche Queue'));
    else result.push(item('Wiederherstellung noch offen', ctx.status === 'completed' ? 'Der Einsatz ist beendet. Eine erfolgreiche Lösung ist aus den hier verfügbaren öffentlichen Angaben nicht bestätigt.' : 'Das aktuelle Ticket ist offen. Eine Wiederherstellung wird hier nicht als bestätigt ausgegeben.', 'neutral', 'Öffentlicher Einsatz- und Queue-Status'));
    return result;
  }

  function analyze(characterId, input = {}) {
    if (!Object.hasOwn(catalog, characterId)) return { items: [], note: 'Kein passiver Begleiter ausgewählt.' };
    const ctx = context(input?.session);
    const draft = string(input?.draft);
    let items;
    switch (characterId) {
      case 'snake': items = traces(ctx); break;
      case 'wolf': items = pack(ctx); break;
      case 'dragon': items = draftRisks(draft); break;
      case 'snake-coral': items = crossCheck(ctx); break;
      case 'fox': items = trail(ctx); break;
      case 'wolf-night': items = echo(ctx, draft); break;
      case 'raven': items = errors(ctx); break;
      case 'dragon-frost': items = watch(ctx); break;
      case 'chimera': {
        const trace = traces(ctx), codes = errors(ctx), warnings = draftRisks(draft).filter(entry => entry.tone === 'attention');
        items = [...trace.slice(0, 1), ...codes.slice(0, warnings.length ? 2 : 3), ...warnings.slice(0, 2)];
        break;
      }
    }
    return { items: items.slice(0, 5).map(entry => ({ label: compact(entry.label, 64), text: compact(entry.text), tone: entry.tone,
      ...(entry.evidence ? { evidence: compact(entry.evidence, 140) } : {}) })),
      note: ctx.isolated ? 'Für dieses Speedrun-Ticket ist kein Simulatorblock sicher zugeordnet. Andere Ticketverläufe bleiben unberücksichtigt.'
        : characterId === 'dragon' ? 'Nur Entwurfshinweise. Es wird nichts ausgeführt oder am Ticket geändert.'
          : 'Auswertung sichtbarer Angaben; keine neue Prüfung, kein Ursachenbeweis und keine automatische Lösung.' };
  }

  return Object.freeze({ catalog, analyze });
});
