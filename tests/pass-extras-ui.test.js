'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const { progression } = require('../server/progression');
const { BONUS_CATALOG, EXTRA_KINDS } = require('../server/pass-extras');

function renderer(game = progression([])) {
  const events = {}, nodes = [], animations = [];
  let reduced = false, time = 0;
  function node() {
    return { dataset: {}, style: { setProperty(name,value) { this[name]=value; } }, setAttribute() {}, remove() { this.removed = true; },
      querySelectorAll(selector) { return selector === '.finisher-particle' ? (this.particles ||= Array.from({length:24},()=>({style:{setProperty(name,value){this[name]=value;}}}))) : []; },
      getAnimations() { return this.animations || []; },
      animate() { const animation = { finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
        (this.animations ||= []).push(animation); animations.push(animation); return animation; } };
  }
  const document = { hidden: false, addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    querySelector() { return null; }, querySelectorAll() { return []; }, createElement: node,
    body: { dataset: {}, classList: { toggle() {} }, append(value) { nodes.push(value); } } };
  const window = { addEventListener(name, fn) { (events[name] ||= []).push(fn); },
    matchMedia: () => ({ get matches() { return reduced; }, addEventListener(name, fn) { (events.motion ||= []).push(fn); } }) };
  const context = vm.createContext({ document, window, state: { game }, currentView: 'simulation',
    performance: { now: () => time }, isBusy: () => false });
  for (const file of ['progression.js','pass-extras.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui',file),'utf8'),context);
  return { document, nodes, animations, context, api: window.PassExtrasFX, mount: window.mountPassExtras,
    run(source, data) { context.input = data; return vm.runInContext(source,context); },
    dispatch(name, data) { for(const fn of events[name] || [])fn(data); },
    get live() { return nodes.filter(value=>!value.removed); },
    set reduced(value) { reduced=value; }, tick() { time+=35; } };
}

test('all eighty pass rewards render with distinct bonus previews and locked cosmetics cannot be equipped', () => {
  const ui=renderer();
  for(let page=0;page<10;page++) {
    const html=ui.run(`progressionPassPage=${page};progressionPass()`);
    assert.match(html,/80 BELOHNUNGEN/);
    assert.equal((html.match(/class="pass-bonus-item"/g)||[]).length,4);
    assert.doesNotMatch(html,/data-progression-equip=/);
  }
  for(const reward of BONUS_CATALOG) {
    const art=ui.run('passExtraArt(input)',reward);
    assert.ok(art.includes('extra-'+reward.kind));
    assert.doesNotMatch(art,/<i\s+style=/);
    if(['aura','trail','finisher'].includes(reward.kind)) {
      assert.equal((art.match(/class="extra-particle-\d+"/g)||[]).length,8);
    }
  }
  const art=ui.run('passExtraArt(input)',{kind:'scene',variant:'1" onclick=alert(1)',name:'<img src=x>'});
  assert.doesNotMatch(art,/<img|onclick=/);assert.match(art,/&lt;img/);
});

test('the collection offers all twenty cosmetics, banner and neutral controls without assigning a companion', () => {
  const game=progression(Array.from({length:250},(_,i)=>({id:'extra-ui-'+i,mode:'career',level:5,elapsed:12,reference:20,
    summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}})));
  game.cosmetics=Object.fromEntries(EXTRA_KINDS.map(kind=>[kind,`pass-${kind}-4`]));
  const ui=renderer(game),before=JSON.stringify(game);
  const html=ui.run('passExtrasCollection()');
  assert.equal((html.match(/class="pass-extra-group"/g)||[]).length,5);
  assert.equal((html.match(/data-pass-preview=/g)||[]).length,20);
  assert.equal((html.match(/data-pass-unequip=/g)||[]).length,5);
  assert.match(ui.run('passExtraBanner()'),/Ewiger Kosmos/);
  assert.equal(JSON.stringify(game),before);
});

test('trail particles are bounded, ignore touch and dragging, and clear for hidden or reduced motion', () => {
  const reward=BONUS_CATALOG.find(r=>r.kind==='trail');
  const ui=renderer({inventory:[reward],cosmetics:{trail:reward.id}});ui.mount();
  assert.equal(ui.nodes.length,0);
  const move={pointerType:'mouse',buttons:0,clientX:100,clientY:200};
  for(let i=0;i<100;i++){ui.tick();ui.dispatch('pointermove',move);}
  assert.equal(ui.api.status().motes,24);assert.equal(ui.live.length,24);
  ui.tick();ui.dispatch('pointermove',{...move,pointerType:'touch'});assert.equal(ui.nodes.length,100);
  ui.tick();ui.dispatch('pointermove',{...move,buttons:1});assert.equal(ui.nodes.length,100);
  ui.document.hidden=true;ui.dispatch('visibilitychange');assert.equal(ui.live.length,0);
  ui.document.hidden=false;ui.reduced=true;ui.tick();ui.dispatch('pointermove',move);assert.equal(ui.live.length,0);
  assert.equal(ui.api.burst(4),false);
});

test('victory finishers run only for a new successful completion and previews never grant ownership', () => {
  const reward=BONUS_CATALOG.find(r=>r.kind==='finisher');
  const ui=renderer({inventory:[reward],cosmetics:{finisher:reward.id},latest:{id:'case-a',solved:true}});
  ui.run('state.session={id:"case-a",status:"completed"}');ui.mount();assert.equal(ui.live.length,0);
  ui.run('state.session={id:"case-b",status:"active"};state.game.latest.id="case-b"');ui.mount();
  ui.run('state.session.status="completed"');ui.mount();assert.equal(ui.live.length,1);
  assert.doesNotMatch(ui.live[0].innerHTML,/<i\s+style=/);
  assert.equal(ui.live[0].particles.length,24);
  assert.deepEqual(ui.live[0].particles.map(p=>[p.style['--i'],p.style['--x'],p.style['--drift']]).slice(0,3),
    [['0','0%','-35px'],['1','37%','40px'],['2','74%','-45px']]);
  ui.mount();assert.equal(ui.live.length,1);
  const before=ui.run('JSON.stringify(state)');
  for(let i=0;i<50;i++)ui.api.burst(4,true);
  assert.equal(ui.live.length,1);assert.equal(ui.run('JSON.stringify(state)'),before);
  ui.api.clear();assert.equal(ui.live.length,0);
  assert.ok(ui.animations.every(animation=>animation.cancelled));
});

test('exclusive spinwheel looks join the collection and every current wheel segment has a correct stop angle', () => {
  const exclusive={id:'finisher-arcane-supernova',kind:'finisher',variant:5,name:'Arkane Supernova'};
  const ui=renderer({inventory:[exclusive],cosmetics:{finisher:exclusive.id},battlepass:{tiers:[]},arcane:{segments:[{reward:exclusive}]}});
  assert.equal((ui.run('passExtrasCollection()').match(/data-pass-preview=/g)||[]).length,1);
  assert.match(ui.run('passExtraArt(input)',exclusive),/extra-tone-5/);
  ui.context.esc=String;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/arcane.js'),'utf8'),ui.context);
  const weights=[16,18,16,8,3,6,4,1,3,3,3,3,3,8,5];
  const segments=weights.map(weight=>({weight,chance:weight}));
  for(let i=0;i<segments.length;i++) {
    const expected=-(weights.slice(0,i).reduce((a,b)=>a+b,0)+weights[i]/2)*3.6;
    assert.equal(ui.run(`arcaneWheelAngle(input,${i})`,segments),expected);
  }
  assert.match(ui.run('arcaneWheel(input)',segments),/15 möglichen Belohnungen/);
  assert.match(ui.run('arcaneReceiptText(input)',{grant:{kind:'passXp',amount:250}}),/250 Pass-EP/);
  assert.match(ui.run('arcaneReceiptText(input)',{grant:{kind:'companionXp',amount:150,characterId:'snake'}}),/150 Begleiter-EP/);
});
