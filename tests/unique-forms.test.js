'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { progression } = require('../server/progression');
const { createApp } = require('../server');
const NOW = new Date('2026-10-21T12:00:00Z');

function ticket(id, scenarioId = 'site-vpn-dns', characterId = 'wolf') {
  return { id, mode: 'career', level: 5, scenarioIds: [scenarioId],
    ticket: { number: id, title: 'Testfall' }, title: 'Testfall', report: 'Abgeschlossen',
    completedTickets: [{ number: id, scenarioId }], elapsed: 10, reference: 15,
    summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 },
    companionReward: { version: 1, characterId, xp: 150 } };
}
function history(total, characterId = 'wolf') {
  return Array.from({ length: total }, (_, i) => ticket(`ticket-${i}`, i % 2 ? 'dhcp-failover' : 'site-vpn-dns', characterId));
}

test('animal forms pool DNS and DHCP once per solved ticket and never repeat an identical reward', () => {
  const archives = history(1000), game = progression(archives, NOW);
  assert.equal(game.companionForms.wolf.solved, 1000);
  assert.equal(game.companionForms.wolf.hardSolved, 1000);
  assert.equal(game.companionForms.wolf.eternalUnlocked, true);
  assert.equal(game.companionMasteries.wolf.find(m => m.id === 'dns').solved, 500);
  assert.equal(game.companionMasteries.wolf.find(m => m.id === 'network').solved, 500);
  assert.equal(game.companionMasteries.wolf.find(m => m.id === 'dhcp').solved, 500);
  assert.equal(game.companionForms.snake.solved, 0);
  const forms = game.inventory.filter(item => item.character === 'wolf' && item.companionForm);
  assert.deepEqual(forms.map(item => item.id), ['portrait-wolf-lord', 'portrait-wolf-lord-silver', 'portrait-wolf-lord-gold', 'portrait-wolf-lord-eternal']);
  assert.ok(forms.every(item => item.masteryId === undefined));
  assert.deepEqual(game, progression([...archives, ...archives], NOW));
  const gain = game.latest.companionFormGains.find(item => item.characterId === 'wolf');
  assert.equal(gain.eternalUnlocked, true);
  assert.equal(game.latest.newRewards.filter(item => item.id === 'portrait-wolf-lord-eternal').length, 1);
  const next = progression([...archives, ticket('next', 'dhcp-failover')], NOW);
  assert.equal(next.latest.companionFormGains[0].eternalUnlocked, false);
  assert.ok(!next.latest.newRewards.some(item => item.companionForm));
});

test('a speedrun form counts solved ticket identities once despite multiple domains, repeated metadata or arrival plans', () => {
  const archive = { id: 'shift', mode: 'speedrun', level: 5, summary: { solvedCount: 2 },
    companionReward: { version: 1, characterId: 'wolf', xp: 200 }, scenarioIds: ['dhcp-failover'],
    completedTickets: [{ number: 'S01', scenarioId: 'site-vpn-dns' }, { number: 'S01', scenarioId: 'site-vpn-dns' },
      { number: 'S02', scenarioId: 'dhcp-failover' }, { number: 'S03', scenarioId: 'site-vpn-dns' }] };
  const game = progression([archive], NOW);
  assert.equal(game.companionForms.wolf.solved, 2);
  assert.equal(game.companionForms.wolf.hardSolved, 2);
  assert.equal(progression([{ ...archive, completedTickets: undefined }], NOW).companionForms.wolf.solved, 0);
  assert.equal(progression([{ ...archive, companionReward: undefined }], NOW).companionForms.wolf.solved, 0);
});

async function appFor(t, state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-unique-forms-'));
  fs.mkdirSync(path.join(root, '.sim'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Simulationsregeln.');
  const file = path.join(root, '.sim', 'ui-state.json');
  fs.writeFileSync(file, JSON.stringify(state));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  async function open() {
    const app = createApp({ root, now: () => NOW, authCheck: async () => ({ available: false }) });
    await app.ready;
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${app.server.address().port}`;
    const { token } = await (await fetch(`${url}/api/bootstrap`)).json();
    return { close: () => app.close(), async request(route, body) {
      const response = await fetch(`${url}/api/${route}`, { method: body ? 'POST' : 'GET',
        headers: { 'X-Sim-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (route === 'state') assert.equal(response.status, 200, JSON.stringify(data));
      return { status: response.status, data };
    } };
  }
  return { open, file };
}

test('old equipped domain forms merge without losing ownership; aliases save canonically and remain equipped after reload', async t => {
  const { open, file } = await appFor(t, { version: 1, model: 'gpt-6-luna', session: null, rewardCatalogVersion: 2,
    masteryCatalogVersion: 2, companionLevelVersion: 2, archives: Array.from({ length: 200 }, (_, i) => ticket(`old-${i}`, 'site-vpn-dns', 'snake')),
    legacyMasteryRewardIds: ['portrait-wolf-lord-dns', 'portrait-wolf-lord-dns-gold', 'portrait-wolf-lord-network-gold'],
    cosmetics: { portrait: 'portrait-wolf-lord-dns-gold' }, companionChosen: true });
  let app = await open();
  try {
    const { game } = (await app.request('state')).data;
    assert.equal(game.cosmetics.portrait, 'portrait-wolf-lord-gold');
    assert.equal(game.companion.activeId, 'wolf');
    assert.equal(game.companionForms.wolf.solved, 0);
    assert.equal(game.inventory.filter(item => item.id === 'portrait-wolf-lord-gold').length, 1);
    assert.equal(game.inventory.find(item => item.id === 'portrait-wolf-lord-gold').legacy, true);
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: 'portrait-wolf-lord-network-gold' })).status, 200);
    assert.equal(JSON.parse(fs.readFileSync(file)).cosmetics.portrait, 'portrait-wolf-lord-gold');
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: 'portrait-wolf-lord-dns-eternal' })).status, 400);
  } finally { await app.close(); }
  app = await open();
  try {
    const { game } = (await app.request('state')).data;
    assert.equal(game.cosmetics.portrait, 'portrait-wolf-lord-gold');
    assert.equal(game.companion.activeId, 'wolf');
    assert.equal(game.inventory.filter(item => item.id === 'portrait-wolf-lord-gold').length, 1);
  } finally { await app.close(); }
});
