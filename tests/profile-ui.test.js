'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { progression } = require('../server/progression');
const { companionState } = require('../server/companions');
const { DOMAINS } = require('../server/challenges');

function renderer() {
  const game = progression([]);
  game.cosmetics = { portrait: 'portrait-dragon-base', title: 'title-rookie', badge: 'badge-recruit' };
  game.companionChosen = true;
  game.companion = companionState({ archives: [], cosmetics: game.cosmetics, companionChosen: true }, game);
  const nodes = {};
  const context = vm.createContext({
    document: { querySelector: selector => nodes[selector] ||= {}, addEventListener() {} },
    window: { addEventListener() {} }, fetch: () => new Promise(() => {}), input: game,
  });
  for (const file of ['menu.js', 'play.js', 'game.js', 'progression.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', file), 'utf8'), context);
  }
  vm.runInContext('state = { game: input, level: 1 };', context);
  return source => vm.runInContext(source, context);
}

test('missions, battlepass, mastery and profile have independent navigation destinations', () => {
  const run = renderer();
  const nav = run('gameNavigation()');
  for (const view of ['missions', 'battlepass', 'mastery', 'profile', 'reports', 'speedrun']) {
    assert.match(nav, new RegExp(`data-view="${view}"`));
  }
  const missions = run('progressionHub()');
  assert.match(missions, /data-progression-tab="daily"/);
  assert.doesNotMatch(missions, /data-progression-tab="(?:pass|mastery|collection)"/);
  assert.match(run('mainMenu()'), /class="profile-quick"[^>]*data-view="profile"/);
});

test('pixel portraits do not require inline styles for their atlas coordinates', () => {
  const run = renderer();
  for (const id of ['snake','wolf','dragon','snake-coral','fox','wolf-night','raven','dragon-frost']) {
    for (const lord of [false,true]) {
      const html = run(`progressionPixelSprite('${id}',${lord})`);
      assert.match(html, new RegExp(`data-character="${id}" data-variant="${lord ? 'lord' : 'base'}"`));
      assert.doesNotMatch(html, /\bstyle=/);
    }
  }
});

test('profile defaults to companions, explains level lock and permits selection after max level', () => {
  const run = renderer();
  assert.match(run('companionProfile()'), /data-profile-tab="companions" aria-current="page"/);
  assert.doesNotMatch(run('companionProfile()'), /progression-reward-grid/);
  assert.match(run('companionChoices()'), /data-reward-id="portrait-wolf-base"[^>]*disabled[^>]*>Wechsel ab Stufe 20/);
  run('state.game.companion.canSwitch=true; state.game.companion.current.switchUnlocked=true;');
  assert.match(run('companionChoices()'), /data-reward-id="portrait-wolf-base" aria-pressed="false" >Begleiter wechseln/);
  run('state.game.companion.canSwitch=false;');
  assert.match(run('companionChoices()'), /Einsatz zuerst beenden/);
});

test('profile reward categories and ownership filter do not hide titles behind a species filter', () => {
  const run = renderer();
  run("profileTab='title'; progressionCollectionKind='title'; progressionCollectionSpecies='dragon';");
  const titles = run('progressionCollection()');
  assert.match(titles, /data-reward-id="title-rookie"/);
  assert.doesNotMatch(titles, /is-locked|data-reward-id="portrait-|id="progression-species-filter"/);
  run("progressionCollectionStatus='locked';");
  const locked = run('progressionCollection()');
  assert.match(locked, /is-locked/);
  assert.doesNotMatch(locked, /data-reward-id="title-rookie"/);
});

test('locked rewards lead to their exact battlepass tier or mastery, base species before lord forms', () => {
  const run = renderer();
  const level = run("state.game.battlepass.tiers.find(t => t.reward.id === 'portrait-fox-base').level");
  const baseLink = run("progressionUnlock({id:'portrait-fox-base',kind:'portrait',character:'fox'})");
  assert.match(baseLink, new RegExp(`data-unlock-pass="${level}"`));
  const lordLink = run("progressionUnlock({id:'portrait-fox-lord-dns',kind:'portrait',character:'fox',masteryId:'dns'})");
  assert.match(lordLink, new RegExp(`data-unlock-pass="${level}"`));
  assert.match(run("progressionUnlock({id:'portrait-dragon-lord-dns',kind:'portrait',character:'dragon',masteryId:'dns'})"), /data-unlock-mastery="dns"/);
  assert.match(run('progressionMastery()'), /id="mastery-dns" tabindex="-1"/);
});

test('mastery portraits, personal form counters and account titles stay separate', () => {
  const run = renderer();
  run(`state.game.companion.current={id:'snake',name:'Schlange',level:21,switchUnlocked:true};
    state.game.companion.activeId='snake';
    const own=state.game.companionMasteries.snake.find(m=>m.id==='dns');own.solved=7;own.xp=700;
    const account=state.game.masteries.find(m=>m.id==='dns');account.solved=50;account.hardSolved=10;account.lordUnlocked=true;
    state.game.inventory.push({id:'title-lord-dns',name:account.titleName,kind:'title',rarity:'mythic'});`);
  const markup = run('progressionMastery()');
  assert.match(markup, /data-mastery-character="snake" aria-pressed="true"/);
  assert.match(markup, /data-mastery-character="wolf"/);
  assert.doesNotMatch(markup, /data-mastery-character="chimera"|\/characters\/chimera/);
  const dns = markup.slice(markup.indexOf('id="mastery-dns"'), markup.indexOf('</article>', markup.indexOf('id="mastery-dns"')));
  assert.match(dns, /data-character="snake" data-variant="base"/);
  assert.match(dns, /\/characters\/pixel-atlas-a.png/);
  assert.match(dns, /Schlange · 7 EIGENE FÄLLE/);
  assert.match(dns, /100 Basis-EP \+ 50 Bonus-EP pro gelöstem Fall/);
  assert.match(dns, /50 Fälle insgesamt · 10 auf Stufe 4/);
  assert.match(dns, /data-reward-id="title-lord-dns"/);
  assert.doesNotMatch(dns, /data-reward-id="portrait-snake-lord-dns"|Maximalstufe/);
  const before=run('JSON.stringify(state.game.cosmetics)');
  run("progressionMasterySpecies='wolf';");
  const other=run('progressionMastery()');
  assert.match(other, /Wolf · 0 EIGENE FÄLLE/);
  assert.match(other, /Sammelt gerade keinen eigenen Fortschritt/);
  assert.equal(run('JSON.stringify(state.game.cosmetics)'),before);
  assert.equal(run('state.game.companion.activeId'),'snake');
});

test('Linux and hardware mastery descriptions render safely without changing companion progress', () => {
  const run = renderer();
  for (const id of ['linux', 'hardware', 'hardware-advice']) {
    const domain = DOMAINS.find(item => item.id === id);
    const account = run(`state.game.masteries.find(item => item.id === '${id}')`);
    assert.equal(account.description, domain.description, `${id} backend description is present`);
    run(`Object.assign(state.game.masteries.find(item => item.id === '${id}'), { solved: 3, hardSolved: 1 });
      Object.assign(state.game.companionMasteries.snake.find(item => item.id === '${id}'), { solved: 2, xp: 200 });`);
  }
  run(`state.game.masteries.find(item => item.id === 'linux').description = 'Linux <Dienste> & Rechte';
    state.game.companionMasteries.snake.find(item => item.id === 'linux').description = 'Linux <Dienste> & Rechte';
    state.game.companion.current={id:'snake',name:'Schlange',level:2,switchUnlocked:true};
    state.game.companion.activeId='snake';`);
  const markup = run('progressionMastery()');
  for (const id of ['linux', 'hardware', 'hardware-advice']) {
    const start = markup.indexOf(`id="mastery-${id}"`);
    const card = markup.slice(start, markup.indexOf('</article>', start));
    assert.ok(start >= 0, `${id} mastery card is rendered`);
    assert.match(card, /Schlange · 2 EIGENE FÄLLE/);
  }
  const linux = markup.slice(markup.indexOf('id="mastery-linux"'), markup.indexOf('</article>', markup.indexOf('id="mastery-linux"')));
  assert.match(linux, /Linux &lt;Dienste&gt; &amp; Rechte/);
  assert.doesNotMatch(linux, /Linux <Dienste>/);
  assert.match(markup, /Preis-Leistung, Kompatibilität und Folgekosten prüfen; Kauf oder Nichtkauf/);
});

test('legacy forms stay usable independently of new personal counters', () => {
  const run=renderer();
  run(`state.game.inventory.push({id:'portrait-dragon-lord-dns-astral',kind:'portrait',character:'dragon',variant:'lord',frame:'astral',masteryId:'dns',legacy:true});`);
  assert.equal(run("progressionRewardOwned({id:'portrait-dragon-lord-dns-astral',kind:'portrait',character:'dragon',variant:'lord',frame:'astral',masteryId:'dns'})"),true);
  assert.equal(run("state.game.companionMasteries.dragon.find(m=>m.id==='dns').solved"),0);
});

test('each companion form appears exactly once across mastery domains and profile previews', () => {
  const run = renderer();
  run("progressionMasterySpecies='wolf'; progressionCollectionKind='portrait'; progressionCollectionSpecies='wolf'; progressionCollectionStatus='all';");
  const mastery = run('progressionMastery()');
  for (const tier of ['lord','silver','gold','eternal','astral']) {
    assert.equal((mastery.match(new RegExp('eternal-mastery tier-' + tier + ' ', 'g')) || []).length, 1, tier);
  }
  assert.match(mastery, /Alle Fachgebiete zählen zusammen/);
  assert.doesNotMatch(mastery.slice(mastery.indexOf('id="mastery-dns"')), /eternal-mastery/);
  const collection = run('progressionCollection()');
  assert.equal((collection.match(/class="progression-reward /g) || []).length, 6, 'base plus five unique forms');
  assert.equal((collection.match(/<h3>Wolf · Ewiger Lord<\/h3>/g) || []).length, 1);
  assert.doesNotMatch(collection, /Wolf · Ewiger Lord DNS|Wolf · Ewiger Lord DHCP/);
  assert.match(run("progressionUnlock({id:'portrait-wolf-lord-eternal',kind:'portrait',character:'wolf',companionForm:true})"), /data-unlock-mastery="forms" data-unlock-character="wolf"/);
  run("state.game.companionForms.wolf.solved=999;state.game.companionForms.wolf.hardSolved=400;");
  assert.doesNotMatch(run('progressionMastery()'), /data-reward-id="portrait-wolf-lord-eternal"/);
});

test('level displays continue above twenty without cap messaging', () => {
  const run=renderer();
  run('state.game.companion.current.level=101;state.game.companion.current.remainingXp=30500;');
  const markup=run('companionProfile()');
  assert.match(markup,/Stufe 101/);
  assert.match(markup,/30500 EP bis zum Aufstieg/);
  assert.doesNotMatch(markup,/Maximalstufe|\/ 20/);
  run('renderCompanionDock();');
  assert.doesNotMatch(run("document.querySelector('#companion-dock').innerHTML"),/\/ 20|MAX ·/);
});

test('every animated companion uses an isolated foreground in cards and equipped portraits', () => {
  const run=renderer();
  run("state.game.characters.forEach(c=>c.unlocked=true);state.game.companionForms.chimera={...state.game.companionForms.snake};");
  for(const character of ['snake','wolf','wolf-night','fox','raven','dragon','dragon-frost','snake-coral','chimera']) {
    run('state.game.inventory.push('+JSON.stringify({id:'portrait-'+character+'-base',kind:'portrait',character,variant:'base'})+');');
    for(const frame of ['eternal','astral']) {
      const reward={id:'portrait-'+character+'-lord-'+frame,kind:'portrait',character,variant:'lord',frame,companionForm:true};
      const card=run('progressionRewardArt('+JSON.stringify(reward)+')');
      assert.match(card,new RegExp('character-breakout breakout-'+character));
      assert.match(card,/class="portrait-scene-background"/);
      assert.ok(card.includes('class="pixel-sprite portrait-creature" data-character="'+character+'" data-variant="lord"'));
      assert.ok(!card.includes('src="/characters/'+character+'-lord.png"'));
      run('state.game.inventory.push('+JSON.stringify(reward)+');state.game.companionForms['+JSON.stringify(character)+'].'+frame+'Unlocked=true;state.game.cosmetics.portrait='+JSON.stringify(reward.id)+';');
      for(const size of ['small','hero','dock'])assert.match(run("equippedCharacter('"+size+"')"),/portrait-creature/);
    }
    for(const frame of ['base','lord','silver','gold'])assert.doesNotMatch(run('progressionRewardArt('+JSON.stringify({kind:'portrait',character,variant:'lord',frame})+')'),/character-breakout/);
  }
  assert.equal(run("progressionCharacterBreakout('../unknown','astral')"),'');
  run("state.game.characters.find(c=>c.id==='chimera').unlocked=false;");
  assert.equal(run("progressionCharacterBreakout('chimera','astral')"),'');
});

test('profile displays escaped cosmetic labels and preserves the persistent companion dock', () => {
  const run = renderer();
  run("state.game.inventory.find(r=>r.id==='title-rookie').name='<img src=x onerror=alert(1)>'; ");
  assert.doesNotMatch(run('companionProfile()'), /<img src=x/);
  assert.match(run('companionProfile()'), /&lt;img src=x/);
  assert.match(run('profileQuickButton()'), /&lt;img src=x/);
  run('renderCompanionDock();');
  assert.equal(run("document.querySelector('#companion-dock').hidden"), false);
  assert.match(run("document.querySelector('#companion-dock').innerHTML"), /avatar-dock/);
  run('state.game.companionChosen=false;');
  assert.match(run('companionProfile()'), /Auf Stufe 20 kannst du den nächsten Begleiter wählen/);
  assert.equal((run('companionProfile()').match(/data-progression-equip="portrait"/g) || []).length, 3);
});

test('secret companion stays anonymous in choices, filters, artwork and form previews', () => {
  const run = renderer();
  run(`state.game.characters = state.game.characters.filter(c => c.id !== 'chimera');
    state.game.characters.push({id:'chimera',name:'Nyxar',secret:true,unlocked:false,unlockLevel:null,
      baseImage:'/characters/chimera.png',lordImage:'/characters/chimera-lord.png'});`);
  const choices = run('companionChoices()');
  assert.match(choices, /secret-choice/);
  assert.match(choices, /aria-label="Unbekannter geheimer Begleiter"/);
  assert.match(choices, /Freischaltung unbekannt/);
  assert.doesNotMatch(choices, /Nyxar|\/characters\/chimera|portrait-chimera-base/);
  assert.doesNotMatch(run('companionChoices(true)'), /secret-choice/);
  assert.equal(run("progressionCharacterImage('chimera')"), '');
  assert.equal(run("progressionCharacterImage('chimera', true)"), '');
  run("progressionCollectionKind='portrait'; progressionCollectionSpecies='chimera'; progressionCollectionStatus='locked';");
  const collection = run('progressionCollection()');
  assert.equal((collection.match(/class="progression-reward /g) || []).length, 1);
  assert.match(collection, /<option value="chimera"[^>]*>\?\?\?<\/option>/);
  assert.doesNotMatch(collection, /Nyxar|\/characters\/chimera|Lord|data-unlock-pass|data-unlock-mastery/);
  assert.doesNotMatch(run("progressionUnlock({character:'chimera',kind:'portrait',masteryId:'dns'})"), /<button/);
});

test('discovered secret uses all existing forms and appears in its earned reveal', () => {
  const run = renderer();
  run(`state.game.characters = state.game.characters.filter(c => c.id !== 'chimera');
    state.game.characters.push({id:'chimera',name:'Nyxar',secret:true,unlocked:true,unlockLevel:null});
    state.game.inventory.push({id:'portrait-chimera-base',name:'Nyxar',kind:'portrait',character:'chimera',variant:'base',rarity:'mythic'});
    for (const frame of ['lord','silver','gold','eternal','astral']) {
      state.game.companionForms.chimera ||= {...state.game.companionForms.dragon,character:'chimera'};
      const mastery=state.game.companionForms.chimera;
      mastery[frame+'Unlocked']=true;
      state.game.inventory.push({id:'portrait-chimera-lord'+(frame==='lord'?'':'-'+frame),name:'Nyxar '+frame,
        kind:'portrait',character:'chimera',variant:'lord',companionForm:true,...(frame==='lord'?{}:{frame}),rarity:'mythic'});
    }
    state.game.companion.canSwitch=true;
    progressionCollectionKind='portrait'; progressionCollectionSpecies='chimera'; progressionCollectionStatus='owned';`);
  assert.match(run('companionChoices()'), /data-reward-id="portrait-chimera-base"/);
  const collection = run('progressionCollection()');
  for (const frame of ['lord','silver','gold','eternal','astral']) {
    assert.match(collection, new RegExp('data-reward-id="portrait-chimera-lord'+(frame==='lord'?'':'-'+frame)+'"'));
  }
  assert.match(collection, /data-character="chimera" data-variant="lord"/);
  assert.match(collection, /\/characters\/pixel-atlas-secret.png/);
  assert.doesNotMatch(collection, /Battlepassstufe null|Battlepassstufe 0|secret-art/);
  const reveal = run('progressionSecretReveal([state.game.inventory.find(r=>r.id==="portrait-chimera-base")])');
  assert.match(reveal, /DAS SIEGEL IST GEBROCHEN/);
  assert.match(reveal, /Nyxar/);
  assert.equal(run('progressionSecretReveal([])'), '');
});
