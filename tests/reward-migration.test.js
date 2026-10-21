'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../server');
const { progression } = require('../server/progression');
const { legacyPassFrames } = require('../server/challenges');
const NOW = new Date('2026-10-21T12:00:00Z');

function history(total) {
  return Array.from({ length: total }, (_, i) => ({ id: `saved-${i}`, mode: 'career', level: 3,
    ticket: { number: String(1001 + i), title: 'DNS-Testfall' }, title: 'DNS-Testfall', report: 'Abgeschlossen',
    companionReward: { version: 1, characterId: 'snake', xp: 150 },
    elapsed: 10, reference: 15, scenarioIds: ['dns-resolution'],
    completedAt: '2026-10-21T09:00:00Z', summary: { solved: true, score: 95, wrongChanges: 0, unnecessaryChecks: 0 } }));
}
async function open(root) {
  const app = createApp({ root, now: () => NOW, authCheck: async () => ({ available: false }) });
  await app.ready;
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`;
  const { token } = await (await fetch(`${url}/api/bootstrap`)).json();
  return { close: () => app.close(), async request(route, body) {
    const response = await fetch(url + '/api/' + route, { method: body ? 'POST' : 'GET',
      headers: { 'X-Sim-Token': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (route === 'state') assert.equal(response.status, 200, JSON.stringify(data));
    return { status: response.status, data };
  } };
}
function directory(t, state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-reward-migration-'));
  fs.mkdirSync(path.join(root, '.sim'));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Simulationsregeln.');
  if (state) fs.writeFileSync(path.join(root, '.sim', 'ui-state.json'), JSON.stringify(state));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('old equipped pass frames survive upgrade and reload; later pass progress grants no new legacy frames', async t => {
  const archives = history(8), passLevel = progression(archives, NOW).battlepass.level;
  const earned = legacyPassFrames(passLevel);
  assert.ok(earned.length > 0 && earned.length < 9);
  const selected = earned[0].id;
  const root = directory(t, { version: 1, model: 'gpt-6-luna', session: null, archives, companionChosen: true,
    cosmetics: { portrait: selected, title: 'title-rookie', badge: 'badge-recruit' } });
  const file = path.join(root, '.sim', 'ui-state.json'), original = fs.readFileSync(file, 'utf8');
  let app = await open(root);
  try {
    const { game } = (await app.request('state')).data;
    assert.deepEqual(game.inventory.filter(r => r.legacy).map(r => r.id), earned.map(r => r.id));
    assert.equal(game.cosmetics.portrait, selected);
    assert.equal(game.companion.activeId, 'snake');
    assert.equal(game.companion.current.xp, 4200);
    assert.equal(game.companion.current.level, 5);
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'read-only access does not rewrite save');
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: selected })).status, 200);
  } finally { await app.close(); }
  const saved = JSON.parse(fs.readFileSync(file));
  assert.equal(saved.rewardCatalogVersion, 2);
  assert.deepEqual(saved.archives, archives);
  assert.deepEqual(saved.legacyPassFrameIds, earned.map(r => r.id));
  saved.archives = history(150);
  fs.writeFileSync(file, JSON.stringify(saved));
  app = await open(root);
  try {
    const { game } = (await app.request('state')).data;
    assert.ok(game.battlepass.level > passLevel);
    assert.equal(game.cosmetics.portrait, selected);
    assert.deepEqual(game.inventory.filter(r => r.legacy).map(r => r.id), earned.map(r => r.id));
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: 'portrait-dragon-gold' })).status, 400);
    const reset = await app.request('reset', { confirmation: 'RESET' });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.game.inventory.some(r => r.legacy), false);
    assert.equal(JSON.parse(fs.readFileSync(file)).rewardCatalogVersion, 2);
  } finally { await app.close(); }
});

test('new saves only earn mastery frames even at a high battlepass level', async t => {
  const root = directory(t, { version: 1, rewardCatalogVersion: 2, model: 'gpt-6-luna', session: null,
    archives: history(150), companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' } });
  const app = await open(root);
  try {
    const { game } = (await app.request('state')).data;
    assert.ok(game.battlepass.level >= 4);
    assert.equal(game.inventory.some(r => r.legacy || ['bronze', 'silver', 'gold'].includes(r.variant)), false);
    assert.equal(game.battlepass.tiers.some(t => t.reward.frame || (t.reward.kind === 'portrait' && t.reward.variant !== 'base')), false);
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: 'portrait-snake-bronze' })).status, 400);
  } finally { await app.close(); }
});

test('fresh empty saves use the new reward catalog from the first write', async t => {
  const root = directory(t);
  const app = await open(root);
  try {
    assert.equal((await app.request('cosmetics', { kind: 'portrait', id: 'portrait-snake-base' })).status, 200);
    const saved = JSON.parse(fs.readFileSync(path.join(root, '.sim', 'ui-state.json')));
    assert.equal(saved.rewardCatalogVersion, 2);
    assert.equal(saved.masteryCatalogVersion, 2);
    assert.equal(saved.companionLevelVersion, 2);
    assert.equal(saved.legacyPassFrameIds, undefined);
  } finally { await app.close(); }
});

test('mastery migration snapshots existing global forms once, preserves levels and survives restart without granting future legacy forms', async t => {
  const archives = history(50).map((archive, i) => ({ ...archive, level: i < 10 ? 5 : 3,
    scenarioIds: [i < 10 ? 'site-vpn-dns' : 'dns-resolution'] }));
  const oldGame = progression(archives, NOW);
  const oldForms = require('../server/challenges').legacyMasteryRewards(oldGame);
  assert.ok(oldForms.some(item => item.character === 'wolf'));
  const root = directory(t, { version: 1, rewardCatalogVersion: 2, model: 'gpt-6-luna', session: null,
    archives, companionChosen: true, cosmetics: { portrait: 'portrait-wolf-lord-dns' } });
  const file = path.join(root, '.sim', 'ui-state.json'), original = fs.readFileSync(file, 'utf8');
  let app = await open(root);
  try {
    const game = (await app.request('state')).data.game;
    assert.equal(game.companionMasteries.wolf.find(item => item.id === 'dns').solved, 0);
    assert.equal(game.inventory.find(item => item.id === 'portrait-wolf-lord').legacy, true);
    assert.equal(game.cosmetics.portrait, 'portrait-wolf-lord');
    assert.equal(game.companion.characters.find(item => item.id === 'snake').level, 20);
    for (const reward of oldForms) assert.ok(game.inventory.some(item => item.id === require('../server/challenges').canonicalPortraitId(reward.id)));
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { await app.close(); }
  app = await open(root);
  try {
    assert.equal(fs.readFileSync(file, 'utf8'), original, 'restart alone also stays read-only');
    assert.equal((await app.request('cosmetics', { kind: 'title', id: 'title-lord-dns' })).status, 200);
  } finally { await app.close(); }
  const saved = JSON.parse(fs.readFileSync(file));
  assert.equal(saved.masteryCatalogVersion, 2);
  assert.equal(saved.companionLevelVersion, 2);
  assert.deepEqual(saved.legacyMasteryRewardIds, oldForms.map(item => item.id));
  assert.deepEqual(saved.archives, archives);
  const offsets = { ...saved.companionXpOffsets };
  saved.archives.push(...history(220).map((archive, i) => ({ ...archive, id: `new-${i}`, level: 5, scenarioIds: ['site-vpn-dns'] })));
  fs.writeFileSync(file, JSON.stringify(saved));
  app = await open(root);
  try {
    const game = (await app.request('state')).data.game;
    assert.ok(game.inventory.some(item => item.id === 'portrait-snake-lord-gold'));
    assert.ok(!game.inventory.some(item => item.id === 'portrait-wolf-lord-gold'));
    assert.ok(game.inventory.filter(item => item.legacy).every(item => saved.legacyMasteryRewardIds.some(id => require('../server/challenges').canonicalPortraitId(id) === item.id)));
    assert.equal((await app.request('cosmetics', { kind: 'title', id: 'title-rookie' })).status, 200);
    const persisted = JSON.parse(fs.readFileSync(file));
    assert.deepEqual(persisted.companionXpOffsets, offsets, 'XP offsets never reapply after future progress');
    assert.deepEqual(persisted.legacyMasteryRewardIds, saved.legacyMasteryRewardIds);
    const reset = await app.request('reset', { confirmation: 'RESET' });
    assert.equal(reset.status, 200);
    assert.equal(reset.data.game.inventory.some(item => item.legacy), false);
    assert.equal(reset.data.game.companion.characters.find(item => item.id === 'snake').xp, 0);
    const cleared = JSON.parse(fs.readFileSync(file));
    assert.equal(cleared.masteryCatalogVersion, 2);
    assert.equal(cleared.companionLevelVersion, 2);
    assert.equal(cleared.legacyMasteryRewardIds, undefined);
    assert.equal(cleared.companionXpOffsets, undefined);
  } finally { await app.close(); }
});

test('version-two saves never infer global form ownership or old level bonuses from later archives', async t => {
  const archives = history(50).map((archive, i) => ({ ...archive, level: i < 10 ? 5 : 3,
    scenarioIds: [i < 10 ? 'site-vpn-dns' : 'dns-resolution'] }));
  const root = directory(t, { version: 1, rewardCatalogVersion: 2, masteryCatalogVersion: 2, companionLevelVersion: 2,
    model: 'gpt-6-luna', session: null, archives, companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' } });
  const app = await open(root);
  try {
    const game = (await app.request('state')).data.game;
    assert.equal(game.inventory.some(item => item.legacy), false);
    assert.ok(game.inventory.some(item => item.id === 'portrait-snake-lord'));
    assert.ok(!game.inventory.some(item => item.id === 'portrait-wolf-lord'));
    assert.equal(game.companion.current.xp, 7500);
    assert.equal(game.companion.current.level, 6);
  } finally { await app.close(); }
});
