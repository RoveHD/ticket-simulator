'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { progression } = require('../server/progression');
const empty = progression([]);
const earned = progression(Array.from({length:250},(_,i)=>({id:'pass-'+i,mode:'career',level:5,elapsed:12,reference:20,summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}})));
test('pass cosmetics retain unlock IDs and metadata from locked preview to earned inventory', () => {
  assert.equal(empty.battlepass.tiers.length, 40);
  assert.equal(earned.battlepass.level, 40);
  for (const tier of empty.battlepass.tiers) {
    const reward = tier.reward;
    assert.equal(tier.requiredXp, tier.level * 500);
    assert.ok(!tier.unlocked);
    assert.deepEqual(earned.inventory.find(item=>item.id===reward.id),reward);
    if(reward.kind!=='portrait') assert.equal(reward.id,`${reward.kind}-pass-${tier.level}`);
    assert.ok(!reward.frame);
  }
  const badges=empty.battlepass.tiers.map(t=>t.reward).filter(r=>r.kind==='badge');
  assert.equal(badges.length,16);
  assert.equal(new Set(badges.map(r=>r.emblem)).size,16);
  assert.ok(badges.every(r=>r.emblem && typeof r.animated==='boolean'));
  assert.equal(empty.battlepass.tiers[39].reward.rarity,'mythic');
});
test('equipped pass effects match their preview and safely escape cosmetic names', () => {
  const context=vm.createContext({state:{game:earned},document:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync(require.resolve('../ui/progression.js'),'utf8'),context);
  for(const reward of earned.battlepass.tiers.map(t=>t.reward).filter(r=>r.kind==='badge')){
    context.reward=reward;
    const html=vm.runInContext('progressionBadgeArt(reward)',context);
    assert.match(html,new RegExp('emblem-'+reward.emblem));
    earned.cosmetics={badge:reward.id};
    assert.match(vm.runInContext('equippedBadge()',context),new RegExp('emblem-'+reward.emblem));
  }
  earned.cosmetics={title:'title-pass-40'};
  assert.match(vm.runInContext('equippedTitleMarkup()',context),/title-mythic/);
  context.reward={kind:'title',name:'<img src=x onerror=alert(1)>',rarity:'\" onclick=alert(1)'};
  const html=vm.runInContext('progressionTitleMarkup(reward)',context);
  assert.doesNotMatch(html,/<img|class="[^"]*onclick/);
  assert.match(html,/&lt;img/);
  assert.match(html,/title-common/);
});
