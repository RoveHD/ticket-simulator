#!/usr/bin/env node
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
let sea;
try { sea = require('node:sea'); } catch {}
const { createBridge, abortError } = require('./codex');
const { progression } = require('./progression');
const { arcaneView, arcaneRewards, spin, validArcanePersistence } = require('./arcane');
const { leaderboard } = require('./leaderboard');
const { legacyPassFrames, retainedPassFrames, legacyMasteryRewards, canonicalPortraitId, canonicalMasteryReward } = require('./challenges');
const { CHARACTERS } = require('./characters');
const { RANKED_RULES_VERSION } = require('./ranked');
const { EXTRA_KINDS } = require('./pass-extras');
const { companionState, rewardForArchive, legacyLevelOffsets } = require('./companions');
const { abilityClock, activateAbility, consumeAbility, sessionAbilityReward } = require('./abilities');
const { difficultyFor } = require('./difficulty');
const { publicQueue, canWaitForArrival, waitStep } = require('./queue');
const { validAudio } = require('./audio-settings');
const { responseSchema, applyResponse, validModel, validLevel, plan, read, legacy, promptFor, loadState, saveState, fail } = require('./simulation');

function createApp(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..'));
  const assetsRoot = path.resolve(options.assetsRoot || root);
  const dataDir = path.resolve(options.dataDir || process.env.SIM_DATA_DIR || path.join(root, '.sim'));
  const stateFile = path.join(dataDir, 'ui-state.json');
  const rules = read(path.join(root, 'AGENTS.md'));
  if (!rules.trim()) fail('AGENTS.md mit den Simulationsregeln fehlt.', 500);
  let state = loadState(stateFile, process.env.SIM_MODEL);
  if (!validArcanePersistence(state)) fail('Der gespeicherte Arcane-Spielstand ist ungültig. Er wurde nicht überschrieben.', 500);
  if (state.companionLevelVersion === undefined) {
    state = { ...state, companionLevelVersion: 2, companionXpOffsets: legacyLevelOffsets(state.archives) };
  }
  if (state.rewardCatalogVersion === undefined) {
    const previousLevel = progression(state.archives, options.now ? new Date(options.now()) : new Date()).battlepass.level;
    state = { ...state, rewardCatalogVersion: 2, legacyPassFrameIds: legacyPassFrames(previousLevel).map(r => r.id) };
  }
  if (state.masteryCatalogVersion === undefined) {
    const previousGame = progression(state.archives, options.now ? new Date(options.now()) : new Date(), state);
    state = { ...state, masteryCatalogVersion: 2,
      legacyMasteryRewardIds: legacyMasteryRewards(previousGame).map(reward => reward.id) };
  }
  options.onThemeChange?.(state.theme);
  function emptyBaseline() {
    return { stats: { 'Abgeschlossene Tickets': '0', 'Erfolgreich behobene Tickets': '0',
      'Durchschnittliche Punktzahl': '–', 'Durchschnittliche Lösungszeit': '–', 'Verhältnis zur Referenzzeit': '–',
      'Unnötige Checks pro Ticket': '0', 'Fehlentscheidungen': '0', 'Stärken': 'Noch keine Auswertung', 'Wissenslücken': 'Noch keine Auswertung' }, reports: [], highscores: '' };
  }
  let baseline = state.legacyReset ? emptyBaseline() : legacy(root);
  const token = crypto.randomBytes(32).toString('hex');
  const bridge = createBridge({ root, ...options.bridge });
  const ai = options.ai || bridge.generate;
  const checkAuth = options.authCheck || bridge.connection;
  let auth = { available: false, reason: 'ChatGPT-Verbindung wird geprüft …' };
  let operation = null;
  let closing = false;
  const now = () => options.now ? new Date(options.now()) : new Date();
  let gameCache = null, publicCache = null;
  function gameState() {
    const time = now().getTime();
    if (gameCache?.state === state && time >= gameCache.time && time < gameCache.until) return gameCache.game;
    const game = progression(state.archives, new Date(time), state);
    game.inventory.push(...retainedPassFrames(state.legacyPassFrameIds), ...arcaneRewards(state));
    const ownedIds = new Set(game.inventory.map(reward => reward.id));
    for (const oldReward of legacyMasteryRewards(game, state.legacyMasteryRewardIds || [])) {
      const reward = canonicalMasteryReward(oldReward);
      if (ownedIds.has(reward.id)) continue;
      game.inventory.push(reward); ownedIds.add(reward.id);
    }
    const defaults = { portrait: 'portrait-wolf-base', title: 'title-rookie', badge: 'badge-recruit',
      ...Object.fromEntries(EXTRA_KINDS.map(kind => [kind, null])) };
    game.cosmetics = Object.fromEntries(Object.entries(defaults).map(([kind, fallback]) => [kind,
      game.inventory.some(item => item.kind === kind && item.id === (kind === 'portrait' ? canonicalPortraitId(state.cosmetics?.[kind]) : state.cosmetics?.[kind]))
        ? (kind === 'portrait' ? canonicalPortraitId(state.cosmetics[kind]) : state.cosmetics[kind]) : fallback]));
    game.companionChosen = state.companionChosen === true || (state.companionChosen === undefined &&
      game.inventory.some(item => item.kind === 'portrait' && item.id === state.cosmetics?.portrait));
    game.companion = companionState({ ...state, cosmetics: { ...state.cosmetics, portrait: canonicalPortraitId(state.cosmetics?.portrait) } }, game);
    game.companionChosen = game.companion.activeId !== null;
    game.arcane = arcaneView(state, { passLevel: game.battlepass.level, activeId: game.companion.activeId, now: new Date(time) });
    // UTC mission rollover and future-dated archives both change time-based rewards.
    let until = Math.floor(time / 86400000) * 86400000 + 86400000;
    for (const archive of state.archives) {
      const completed = Date.parse(archive.completedAt);
      if (completed > time) until = Math.min(until, completed);
    }
    gameCache = { state, time, until, game };
    return game;
  }
  const LEVELS = ['IT-Support', 'Fortgeschrittener IT-Support', 'Junior-Systemadministrator', 'Systemadministrator', 'Senior-Systemadministrator', 'Infrastruktur-Experte'];
  function careerStarted() {
    const legacyLevel = Number.parseInt(baseline.stats['Aktuelles Level'], 10);
    return state.careerBaseLevel !== undefined || state.session?.mode === 'career' || state.archives.some(item => item.mode === 'career') ||
      (validLevel(legacyLevel) && legacyLevel !== 3) ||
      Number.parseInt(baseline.stats['Abgeschlossene Tickets'], 10) > 0 || baseline.reports.some(item => item.id.startsWith('ticket-')) || hasLegacyOpenSession();
  }
  function level() {
    return gameState().ranked.level;
  }
  function stats() {
    const career = state.archives.filter(item => item.mode === 'career');
    const result = { ...baseline.stats };
    if (career.length) {
      const count = Number.parseInt(result['Abgeschlossene Tickets'], 10) || 0;
      const baseAverage = Number.parseFloat(String(result['Durchschnittliche Punktzahl']).replace(',', '.')) || 0;
      const baseMinutes = Number.parseFloat(String(result['Durchschnittliche Lösungszeit']).replace(',', '.')) || 0;
      const total = count + career.length;
      result['Abgeschlossene Tickets'] = String(total);
      result['Erfolgreich behobene Tickets'] = String((Number.parseInt(result['Erfolgreich behobene Tickets'], 10) || 0) + career.filter(item => item.summary.solved).length);
      result['Durchschnittliche Punktzahl'] = ((baseAverage * count + career.reduce((sum, item) => sum + item.summary.score, 0)) / total).toFixed(1);
      result['Durchschnittliche Lösungszeit'] = `${((baseMinutes * count + career.reduce((sum, item) => sum + item.elapsed, 0)) / total).toFixed(1)} Min.`;
      result['Fehlentscheidungen'] = String((Number.parseInt(result['Fehlentscheidungen'], 10) || 0) + career.reduce((sum, item) => sum + item.summary.wrongChanges, 0));
      const baseUnnecessary = Number.parseFloat(String(result['Unnötige Checks pro Ticket']).replace(',', '.')) || 0;
      result['Unnötige Checks pro Ticket'] = ((baseUnnecessary * count + career.reduce((sum, item) => sum + item.summary.unnecessaryChecks, 0)) / total).toFixed(1);
      const uiRatio = career.reduce((sum, item) => sum + item.elapsed / item.reference, 0);
      const baseRatio = Number.parseFloat(String(result['Verhältnis zur Referenzzeit']).replace(',', '.')) || 0;
      result['Verhältnis zur Referenzzeit'] = `${((baseRatio * count + uiRatio * 100) / total).toFixed(0)} %`;
      result['Stärken'] = career.at(-1).summary.strengths;
      result['Wissenslücken'] = career.at(-1).summary.gaps;
    }
    result['Aktuelles Level'] = `${level()} – ${LEVELS[level() - 1]}`;
    return result;
  }
  function nextNumber() {
    const fromStats = Number(String(baseline.stats['Nächste Ticketnummer'] || '').replace(/\D/g, '')) || 1001;
    const existing = [...baseline.reports.map(item => Number(item.id.replace('ticket-', '')) || 0),
      ...state.archives.filter(item => item.mode === 'career').map(item => Number(item.ticket.number) || 0)];
    return Math.max(fromStats, 1001, ...existing.map(number => number + 1));
  }
  function hasLegacyOpenSession() {
    if (state.legacyReset) return false;
    for (const [folder, pattern] of [['intern', /^ticket-\d+\.md$/], ['intern/speedrun', /^run-\d+\.json$/]]) {
      let names = [];
      try { names = fs.readdirSync(path.join(root, '.sim', folder)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (names.some(name => pattern.test(name) && !baseline.reports.some(report => report.id === name.replace(/\.(?:md|json)$/, '')))) return true;
    }
    return false;
  }
  function publicState() {
    const game = gameState(), busy = operation !== null;
    if (publicCache?.state === state && publicCache.auth === auth && publicCache.baseline === baseline &&
        publicCache.busy === busy && publicCache.value.game === game) return publicCache.value;
    const session = state.session;
    const highscores = state.archives.filter(item => item.mode === 'speedrun');
    const uiHighscores = highscores.length ? '\n\n## UI-Schichten\n| Run | Dauer | Level | Gelöst/Eingegangen | Score |\n|---|---|---|---|---|\n' +
      [...highscores].sort((a, b) => b.summary.score - a.summary.score).map(item => `| ${item.id} | ${item.duration} Min. | ${item.level} | ${item.summary.solvedCount}/${item.summary.arrived} | ${item.summary.score} |`).join('\n') : '';
    const value = { auth: { ...auth }, model: state.model, theme: state.theme, audio: { ...state.audio }, careerStartLevel: state.careerStartLevel, careerStarted: careerStarted(), level: level(),
      game, difficulties: [1, 2, 3, 4, 5, 6].map(difficultyFor), stats: { ...stats(), 'Nächste Ticketnummer': `#${nextNumber()}` },
      reports: [...state.archives].reverse().map(item => ({ id: item.id, title: item.title, content: item.report })).concat(baseline.reports),
      highscores: baseline.highscores + uiHighscores,
      session: session ? { id: session.id, level: session.level, queue: publicQueue(session), mode: session.mode, ticket: { number: session.current.ticket.number, title: session.current.ticket.title,
        priority: session.current.ticket.priority, description: session.current.ticket.description }, status: session.current.status,
        elapsed: session.current.elapsed + session.current.waiting, duration: session.duration, canWaitForArrival: canWaitForArrival(session),
        messages: session.messages.map(item => ({ role: item.role, content: item.content })), report: session.current.report,
        companionId: session.companionId || null, companionReward: session.current.status === 'completed' ? session.companionReward || null : null,
        abilityReward: { ...sessionAbilityReward(session), ...(session.current.status === 'completed' ? { companionXp: session.companionReward?.abilityXp || 0 } : {}) } } : null,
      busy };
    publicCache = { state, auth, baseline, busy, value, json: null };
    return value;
  }
  async function refresh(signal) {
    try {
      const result = await checkAuth({ signal });
      if (signal?.aborted) throw abortError();
      auth = { available: result?.available === true, reason: typeof result?.reason === 'string' ? result.reason : 'ChatGPT-Verbindung nicht verfügbar.' };
    } catch (error) {
      if (signal?.aborted) throw abortError();
      auth = { available: false, reason: 'Die lokale ChatGPT-Verbindung konnte nicht geprüft werden.' };
    }
  }
  const ready = refresh();

  async function exclusive(task, response) {
    if (operation) fail('Es läuft bereits eine Anfrage. Bitte warten oder abbrechen.', 409);
    if (closing) fail('Der Simulator wird beendet.', 503);
    const controller = new AbortController();
    operation = controller;
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', disconnected);
    try { await task(controller.signal); }
    finally { response.removeListener('close', disconnected); if (operation === controller) operation = null; }
  }
  function commit(next) {
    if (next.cosmetics?.portrait) {
      const id = canonicalPortraitId(next.cosmetics.portrait);
      if (id !== next.cosmetics.portrait) next = { ...next, cosmetics: { ...next.cosmetics, portrait: id } };
    }
    saveState(stateFile, next); state = next;
  }
  async function turn(session, message, signal, start = false) {
    if (!auth.available) fail(auth.reason, 503);
    const previous = start ? null : session.current;
    const waiting = !start ? waitStep(session, message) : null;
    const trustedWait = waiting ? { ...waiting, duration: session.duration } : null;
    const switchTarget = !start && session.mode === 'speedrun' ? message.match(/^Wechsel\s+(S\d+)$/i)?.[1].toUpperCase() : null;
    if (switchTarget) {
      const target = publicQueue(session).find(item => item.number === switchTarget);
      if (!target || !['open', 'unknown'].includes(target.status)) fail('Dieses Ticket ist nicht offen oder noch nicht eingegangen.', 400);
      if (target.active) fail('Dieses Ticket bearbeitest du bereits.', 400);
    }
    const environment = state.environment || (state.legacyReset ? '' : read(path.join(root, '.sim', 'intern', 'umgebung.md')));
    const prompt = promptFor({ rules, session, previous, message, history: session.messages,
      environment, baseline: stats(), recentCases: state.archives.slice(-6).map(item => ({ title: item.title, contacts: item.contacts || [] })), waitStep: trustedWait });
    let answer;
    try { answer = await ai({ prompt, schema: responseSchema(previous, environment, trustedWait), model: state.model, signal }); }
    catch (error) {
      if (signal.aborted) throw abortError();
      // Do not expose raw subprocess errors, prompt fragments, account details, or paths.
      fail(error.status >= 400 && error.status <= 599 ? error.message : 'Die KI-Anfrage ist fehlgeschlagen. Der bisherige Spielstand bleibt erhalten.', error.status || 502);
    }
    if (signal.aborted) throw abortError();
    const current = applyResponse(answer, previous, session, environment, trustedWait);
    if (previous && session.mode === 'speedrun') {
      const expected = waiting?.activeNumber || switchTarget || previous.hidden.active;
      if (current.status === 'active' && current.hidden.active !== expected) fail('Die KI hat das aktive Ticket unerwartet gewechselt. Der Spielstand bleibt erhalten.');
      if (switchTarget && current.elapsed + current.waiting !== Math.min(session.duration, previous.elapsed + previous.waiting + 1)) fail('Die Dauer des Ticketwechsels war widersprüchlich. Der Spielstand bleibt erhalten.');
    }
    if (state.environment && current.hidden.environment !== state.environment) fail('Die KI wollte die festgelegte Unternehmensumgebung ändern. Die Antwort wurde verworfen.');
    const companionId = session.companionId === undefined ? gameState().companion.activeId : session.companionId;
    const nextSession = { ...session, companionId, current, messages: [...session.messages,
      ...(start ? [] : [{ role: 'user', content: message }]), { role: 'assistant', content: current.reply }] };
    const next = { ...state, environment: current.hidden.environment, session: nextSession, archives: [...state.archives] };
    next.abilityState = { clock: abilityClock(state) + (previous ? current.elapsed - previous.elapsed : 0), readyAt: { ...state.abilityState?.readyAt } };
    if (previous) {
      const ability = consumeAbility(session, current);
      nextSession.abilityPending = ability.pending;
      nextSession.abilityRewards = ability.rewards;
      if (ability.message) nextSession.messages.push({ role: 'assistant', content: ability.message });
    }
    if (session.mode === 'career' && state.careerBaseLevel === undefined) {
      next.careerBaseLevel = careerStarted() ? Number.parseInt(baseline.stats['Aktuelles Level'], 10) || 3 : session.level;
    }
    if (current.status === 'completed') {
      const archive = { id: session.id, title: session.mode === 'career' ? `Ticket #${current.ticket.number} – ${current.ticket.title}` : `Speedrun ${session.duration} Minuten`,
        completedAt: now().toISOString(),
        completedTickets: current.queue.filter(item => item.status === 'solved').map(item => {
          const planned = session.plan.find(ticket => ticket.number === item.number);
          return { number: item.number, category: planned.category, scenarioId: planned.scenarioId, priority: planned.priority };
        }),
        scenarioIds: session.plan.map(item => item.scenarioId).filter(Boolean),
        caseVariants: session.plan.map(item => item.caseVariant?.fingerprint).filter(Boolean),
        contacts: current.queue.map(item => ({ requester: item.requester, department: item.department })),
        ticket: current.ticket, mode: session.mode, level: session.level, duration: session.duration, elapsed: current.elapsed,
        waiting: current.waiting, reference: current.hidden.tickets[0].referenceMinutes, summary: current.summary, report: current.report,
        abilityRewards: nextSession.abilityRewards || [], rankedRulesVersion: RANKED_RULES_VERSION };
      archive.companionReward = rewardForArchive(archive, companionId, state.archives, state.companionXpOffsets, state.arcane);
      nextSession.companionReward = archive.companionReward;
      next.archives.push(archive);
    }
    commit(next);
  }

  function sameOrigin(req, documentNavigation = false) {
    const address = server.address();
    if (!address || typeof address === 'string') return false;
    const host = req.headers.host;
    const allowed = [`127.0.0.1:${address.port}`, `localhost:${address.port}`, `[::1]:${address.port}`];
    if (!allowed.includes(host)) return false;
    if (!documentNavigation && req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
    if (!documentNavigation && req.headers.origin && req.headers.origin !== `http://${host}`) return false;
    return true;
  }
  function authenticated(req) {
    const candidate = req.headers['x-sim-token'];
    return typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate) && crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
  }
  function send(res, status, value, type = 'application/json; charset=utf-8', headers = {}) {
    if (res.destroyed) return;
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", ...headers });
    let content = value;
    if (type.startsWith('application/json')) {
      content = value === publicCache?.value ? (publicCache.json ??= JSON.stringify(value)) : JSON.stringify(value);
    }
    res.end(content);
  }
  async function body(req) {
    if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) fail('JSON-Anfrage erforderlich.', 415);
    req.setEncoding('utf8');
    let content = '';
    for await (const chunk of req) {
      content += chunk;
      if (Buffer.byteLength(content) > 32000) fail('Die Anfrage ist zu groß.', 413);
    }
    let result;
    try { result = JSON.parse(content); } catch { fail('Ungültiges JSON.', 400); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail('JSON-Objekt erforderlich.', 400);
    return result;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = url.pathname;
      const documentNavigation = ['/', '/index.html'].includes(route) && ['GET', 'HEAD'].includes(req.method) &&
        req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
      if (!sameOrigin(req, documentNavigation)) return send(res, 403, { error: 'Nur lokale Anfragen aus diesem Simulator sind erlaubt.' });
      if (route === '/api/bootstrap' && req.method === 'GET') return send(res, 200, { token });
      if (route.startsWith('/api/')) {
        if (!authenticated(req)) return send(res, 403, { error: 'Ungültiger Sitzungsschutz. Bitte lade die Seite neu.' });
        if (route === '/api/state' && req.method === 'GET') { await ready; return send(res, 200, publicState()); }
        if (route === '/api/leaderboard' && req.method === 'GET') {
          await ready;
          const filters = {};
          for (const [key, value] of url.searchParams) {
            if (!['mode','duration','limit','offset','from','to'].includes(key) || Object.hasOwn(filters, key)) fail('Ungültiger Leaderboard-Filter.', 400);
            filters[key] = ['duration','limit','offset'].includes(key) ? Number(value) : value;
          }
          return send(res, 200, leaderboard(state.archives, filters));
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'Methode nicht erlaubt.' });
        const input = await body(req);
        if (route === '/api/cancel') { operation?.abort(); return send(res, 200, publicState()); }
        if (route === '/api/arcane/spin') {
          let receipt, replayed;
          await exclusive(async () => {
            const result = spin(state, input, { randomInt: options.arcaneRandomInt, now: now() });
            if (!result.replayed) commit(result.nextState);
            receipt = result.receipt; replayed = result.replayed;
          }, res);
          return send(res, 200, { receipt, replayed, state: publicState() });
        } else if (route === '/api/connection') {
          await exclusive(async signal => { await ready; await refresh(signal); }, res);
        } else if (route === '/api/audio') {
          if (!validAudio(input.audio)) fail('Ungültige Audioeinstellungen.', 400);
          if (closing) fail('Der Simulator wird beendet.', 503);
          // A synchronous preference-only commit is safe while inference is running.
          // turn() merges the latest preferences after the AI response arrives.
          commit({ ...state, audio: { ...state.audio, ...input.audio } });
        } else if (route === '/api/cosmetics') {
          if (!['portrait', 'title', 'badge', ...EXTRA_KINDS].includes(input.kind) ||
              (typeof input.id !== 'string' && !(EXTRA_KINDS.includes(input.kind) && input.id === null))) fail('Ungültige Profilauswahl.', 400);
          await exclusive(async () => {
            const game = gameState();
            if (EXTRA_KINDS.includes(input.kind) && input.id === null) {
              commit({ ...state, cosmetics: { ...game.cosmetics, [input.kind]: null } });
              return;
            }
            const selectedId = input.kind === 'portrait' ? canonicalPortraitId(input.id) : input.id;
            const reward = game.inventory.find(item => item.id === selectedId && item.kind === input.kind);
            if (!reward) fail('Diese Belohnung ist noch nicht freigeschaltet.', 400);
            const companion = game.companion;
            if (input.kind === 'portrait' && companion.activeId && reward.character !== companion.activeId && !companion.canSwitch) fail(companion.switchReason, 409);
            const next = { ...state, cosmetics: { ...game.cosmetics, [input.kind]: reward.id },
              companionChosen: input.kind === 'portrait' ? true : game.companionChosen };
            // The initial choice can bind an already open legacy/API session.
            // Later changes of species are blocked while a session is active.
            if (input.kind === 'portrait' && !companion.activeId && state.session?.current.status === 'active') next.session = { ...state.session, companionId: reward.character };
            commit(next);
          }, res);
        } else if (route === '/api/ability') {
          if (Object.keys(input).length) fail('Die Fähigkeit wird durch deinen aktiven Begleiter bestimmt.', 400);
          await exclusive(async () => {
            const companion = gameState().companion;
            const ability = companion.ability;
            if (!ability?.canActivate) fail(ability?.blockedReason || 'Wähle zuerst einen Begleiter und starte einen Einsatz.', 409);
            commit(activateAbility(state, companion.activeId));
          }, res);
        } else if (route === '/api/settings') {
          if (!validModel(input.model)) fail('Ungültiger Modellbezeichner.', 400);
          if (input.theme !== undefined && !['light', 'dark'].includes(input.theme)) fail('Ungültige Darstellung.', 400);
          if (input.careerStartLevel !== undefined && !validLevel(input.careerStartLevel)) fail('Startlevel muss zwischen 1 und 6 liegen.', 400);
          await exclusive(async () => {
            commit({ ...state, model: input.model, theme: input.theme ?? state.theme, careerStartLevel: input.careerStartLevel ?? state.careerStartLevel });
            options.onThemeChange?.(state.theme);
          }, res);
        } else if (route === '/api/reset') {
          if (input.confirmation !== 'RESET') fail('Bitte bestätige das Zurücksetzen der Trainingsdaten.', 400);
          await exclusive(async () => {
            // Preserve a private recovery snapshot before the atomic state replacement.
            const backup = path.join(dataDir, 'backups', `before-reset-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`);
            saveState(backup, { ...state, legacySnapshot: baseline });
            commit({ version: 1, rewardCatalogVersion: 2, masteryCatalogVersion: 2, companionLevelVersion: 2, model: state.model, theme: state.theme, audio: { ...state.audio }, careerStartLevel: state.careerStartLevel,
              companionChosen: false, legacyReset: true, session: null, archives: [], environment: '' });
            baseline = emptyBaseline();
          }, res);
        } else if (route === '/api/start') {
          if (!['career', 'speedrun'].includes(input.mode)) fail('Ungültiger Spielmodus.', 400);
          if (!Number.isInteger(input.level) || input.level < 1 || input.level > 6) fail('Level muss zwischen 1 und 6 liegen.', 400);
          if (input.mode === 'speedrun' && ![60, 120, 240].includes(input.duration)) fail('Ungültige Schichtdauer.', 400);
          await exclusive(async signal => {
            await ready;
            if (state.session?.current.status === 'active') fail('Es gibt bereits eine aktive Sitzung. Setze sie fort oder gib sie im Chat auf.', 409);
            if (hasLegacyOpenSession()) fail('Ein offener Spielstand aus der bisherigen Terminal-Version ist vorhanden. Bitte schließe ihn dort ab, bevor du ein neues UI-Ticket startest. Der Altspielstand bleibt unverändert.', 409);
            const number = nextNumber();
            const duration = input.mode === 'speedrun' ? input.duration : null;
            const selectedLevel = input.mode === 'career' ? level() : input.level;
            const recentScenarioIds = state.archives.slice(-5).flatMap(item => item.scenarioIds || []);
            const usedVariants = state.archives.flatMap(item => item.caseVariants || []);
            const session = { id: input.mode === 'career' ? `ticket-${number}` : `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
              mode: input.mode, level: selectedLevel, duration, companionId: gameState().companion.activeId,
              plan: plan(input.mode, duration, number, options.random, selectedLevel, recentScenarioIds, usedVariants), messages: [] };
            await turn(session, input.mode === 'career' ? 'Start' : 'Speedrun starten', signal, true);
          }, res);
        } else if (route === '/api/message') {
          if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 16000) fail('Bitte gib eine Aktion mit höchstens 16.000 Zeichen ein.', 400);
          await exclusive(async signal => {
            await ready;
            if (!state.session || state.session.current.status !== 'active') fail('Keine aktive Sitzung. Starte ein neues Ticket.', 409);
            await turn(state.session, input.message.trim(), signal);
          }, res);
        } else return send(res, 404, { error: 'API-Endpunkt nicht gefunden.' });
        return send(res, 200, publicState());
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Methode nicht erlaubt.' });
      const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'],
        '/arcane.js': ['arcane.js', 'text/javascript; charset=utf-8'], '/arcane-effects.js': ['arcane-effects.js', 'text/javascript; charset=utf-8'], '/arcane.css': ['arcane.css', 'text/css; charset=utf-8'],
        '/pass-extras.js': ['pass-extras.js', 'text/javascript; charset=utf-8'], '/pass-extras.css': ['pass-extras.css', 'text/css; charset=utf-8'],
        '/progression.js': ['progression.js', 'text/javascript; charset=utf-8'], '/progression.css': ['progression.css', 'text/css; charset=utf-8'],
        '/passives.js': ['passives.js', 'text/javascript; charset=utf-8'],
        '/ranks.css': ['ranks.css', 'text/css; charset=utf-8'], '/viewport.css': ['viewport.css', 'text/css; charset=utf-8'],
        '/pixel.css': ['pixel.css', 'text/css; charset=utf-8'],
        '/fonts/pixel-arcade.ttf': ['fonts/pixel-arcade.ttf', 'font/ttf'],
        '/fonts/OFL-Silkscreen.txt': ['fonts/OFL-Silkscreen.txt', 'text/plain; charset=utf-8'],
        '/game.js': ['game.js', 'text/javascript; charset=utf-8'], '/game.css': ['game.css', 'text/css; charset=utf-8'],
        '/music/pixel-rush.ogg': ['music/pixel-rush.ogg', 'audio/ogg'],
        '/play.js': ['play.js', 'text/javascript; charset=utf-8'], '/play.css': ['play.css', 'text/css; charset=utf-8'],
        '/audio.js': ['audio.js', 'text/javascript; charset=utf-8'], '/menu.js': ['menu.js', 'text/javascript; charset=utf-8'], '/arcade.css': ['arcade.css', 'text/css; charset=utf-8'],
        '/style.css': ['style.css', 'text/css; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'] };
      const secretRoute = ['/characters/chimera.png', '/characters/chimera-lord.png', '/characters/chimera-lord-breakout.png', '/characters/pixel-atlas-secret.png'].includes(route);
      const secretUnlocked = secretRoute && gameState().characters.find(character => character.id === 'chimera')?.unlocked === true;
      for (const atlas of ['a','b','c','d', ...(secretUnlocked ? ['secret'] : [])]) {
        files[`/characters/pixel-atlas-${atlas}.png`] = [`characters/pixel-atlas-${atlas}.png`, 'image/png'];
      }
      for (const { id, secret } of CHARACTERS) {
        if (secret && !secretUnlocked) continue;
        for (const suffix of ['', '-lord', '-lord-breakout']) {
          files[`/characters/${id}${suffix}.png`] = [`characters/${id}${suffix}.png`, 'image/png'];
        }
      }
      const asset = Object.hasOwn(files, route) ? files[route] : null;
      if (!asset) return send(res, 404, { error: 'Datei nicht gefunden.' });
      try {
        const file = path.join(assetsRoot, 'ui', asset[0]);
        const embedded = sea?.isSea() ? sea.getAsset(`ui/${asset[0]}`, 'utf8') : null;
        const stat = embedded === null ? await fs.promises.stat(file) : null;
        const etag = stat ? `W/"${stat.size}-${stat.mtimeMs}"` : `"${crypto.createHash('sha256').update(embedded).digest('hex')}"`;
        const headers = { 'Cache-Control': 'private, max-age=0, must-revalidate', ETag: etag };
        // Authorization (including the secret companion gate) always precedes validation.
        if (req.headers['if-none-match']?.split(',').map(value => value.trim()).some(value => value === etag || value === '*')) {
          return send(res, 304, '', asset[1], headers);
        }
        const content = req.method === 'HEAD' ? '' : embedded ?? await fs.promises.readFile(file);
        send(res, 200, content, asset[1], { ...headers, 'Content-Length': stat?.size ?? Buffer.byteLength(embedded) });
      } catch { return send(res, 404, { error: 'Oberfläche nicht gefunden.' }); }
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
      send(res, status, { error: status === 500 ? 'Die Anfrage konnte nicht gespeichert oder verarbeitet werden. Der bisherige Spielstand bleibt erhalten.' : error.message });
    }
  });
  server.requestTimeout = 300000;
  server.headersTimeout = 15000;
  async function close() {
    closing = true;
    operation?.abort();
    const stopped = new Promise(resolve => server.close(resolve));
    // The window is closing: idle/preconnected sockets must not delay shutdown.
    // In-flight inference is already aborted, and all commits are atomic.
    server.closeAllConnections?.();
    await stopped;
  }
  return { server, close, ready };
}

if (require.main === module) {
  try {
    const app = createApp();
    const port = Number(process.env.PORT || 4317);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger PORT.');
    const host = process.env.HOST || '127.0.0.1';
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('HOST muss eine lokale Loopback-Adresse sein.');
    app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Der Simulator-Port wird bereits verwendet.' : 'Der Simulator konnte nicht gestartet werden.'); process.exitCode = 1; });
    app.server.listen(port, host, () => {
      const url = `http://${host === '::1' ? '[::1]' : host}:${port}`;
      console.log(`IT-Ticket-Simulator: ${url}`);
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.close().then(() => process.exit(0)); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { createApp };
