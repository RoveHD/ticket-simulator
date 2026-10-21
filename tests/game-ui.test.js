'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function ui() {
  const nodes = {};
  const context = vm.createContext({ document: { querySelector: selector => nodes[selector] ||= {}, addEventListener() {} }, window: { addEventListener() {} }, fetch: () => new Promise(() => {}) });
  for (const file of ['menu.js', 'play.js', 'game.js', 'progression.js', 'passives.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui', file), 'utf8'), context);
  return (code, data) => { context.input = data; return vm.runInContext(code, context); };
}
const queue = [
  { number: 'S01', title: '<img src=x onerror=alert(1)>', requester: 'Zoe', department: 'Vertrieb', priority: 'P3', status: 'open', age: 20, arrivalMinute: 0, remaining: 100, active: true },
  { number: 'S02', title: 'Anmeldung', requester: 'Anna', department: 'Buchhaltung', priority: 'P1', status: 'open', age: 5, arrivalMinute: 15, remaining: 25, active: false },
  { number: 'S03', title: 'Drucken', requester: 'Ben', department: 'Empfang', priority: 'P2', status: 'solved', age: 2, arrivalMinute: 10, remaining: 58, active: false },
];

test('passive ticket assistance renders automatically from the draft without altering the session', () => {
  const run = ui();
  run('state={session:{status:"active",ticket:{number:"1001",title:"Dienst ausgefallen"},messages:[]},game:{characters:[{id:"dragon"}],companion:{activeId:"dragon"}}};draft="Restart-Computer -ComputerName DC01"');
  const before = run('JSON.stringify(state)');
  const html = run('companionPassivePanel()');
  assert.match(html, /PASSIV · AUTOMATISCH AKTIV/);
  assert.match(html, /passive-attention/);
  assert.doesNotMatch(html, /data-action="companion-ability"/);
  assert.equal(run('JSON.stringify(state)'), before);
  const escaped = run('draft="Remove-Item <img src=x onerror=alert(1)>";companionPassivePanel()');
  assert.doesNotMatch(escaped, /<img\b/);
  assert.match(escaped, /&lt;img/);
  run('state.game.characters.push({id:"chimera",secret:true,unlocked:false})');
  assert.equal(run('companionPassivePreview({id:"chimera"})'), '');
  run('state.session.status="completed"');
  assert.equal(run('companionPassivePanel()'), '');
});

test('reduced motion settles an existing result card without replacing its DOM', () => {
  const run = ui();
  run(`cancelAnimationFrame=()=>{};window.matchMedia=()=>({matches:true});
    var counter={dataset:{count:'95'},textContent:'12'};
    var classes=new Set(['result-animate']);
    var card={dataset:{result:'existing'},classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)},querySelectorAll:()=>[counter]};
    document.querySelector=()=>card;animateDebrief();`);
  assert.equal(run('counter.textContent'), '95');
  assert.equal(run('classes.has("result-animate")'), false);
  assert.equal(run('classes.has("result-settled")'), true);
});

test('companion ability control follows authoritative readiness, cooldown and active buff state', () => {
  const run = ui();
  const ability = { id: 'flame', name: '<Feuerkraft>', description: 'Nächste Lösung: +125 XP', cooldownMinutes: 45, remainingMinutes: 0, ready: true, active: false, canActivate: true };
  run('state={session:{status:"active"},game:{companion:{activeId:"dragon",current:{name:"Drache"},ability:input}}}', ability);
  let html = run('companionAbilityPanel()');
  assert.match(html, /&lt;Feuerkraft&gt;/);
  assert.doesNotMatch(html, /<Feuerkraft>/);
  assert.match(html, /Fähigkeit einsetzen/);
  assert.doesNotMatch(html, /data-action="companion-ability" disabled/);
  run('state.game.companion.ability={...input,remainingMinutes:25,canActivate:false,ready:false}', ability);
  html = run('companionAbilityPanel()');
  assert.match(html, /COOLDOWN · 25 MIN/);
  assert.match(html, /data-action="companion-ability" disabled/);
  assert.match(html, /value="20"/);
  run('state.game.companion.ability.active=true');
  assert.match(run('companionAbilityPanel(true)'), /AKTIV · NÄCHSTE LÖSUNG/);
  run('state.game.companion.ability={...input};pending=true', ability);
  assert.match(run('companionAbilityPanel()'), /data-action="companion-ability" disabled/);
  assert.equal(run('state={game:{}};companionAbilityPanel()'), '');
});

test('rank overview shows the six career ranks, real RR thresholds and exactly one current rank', () => {
  const run = ui();
  const { ranked } = require('../server/ranked');
  const rank = ranked([]);
  run('state={game:{ranked:input}}', rank);
  const before = run('JSON.stringify(state)');
  const html = run('ranksScreen()');
  assert.equal((html.match(/class="rank-tier /g) || []).length, 6);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  for (const item of rank.ranks) {
    assert.ok(html.includes(item.name));
    assert.ok(html.includes(`AB ${item.index * rank.rules.rrPerRank} GESAMT-RR`));
  }
  assert.match(html, /Noch 100 RR bis Fortgeschrittener IT-Support/);
  assert.equal(run('JSON.stringify(state)'), before);
  run('state.game.ranked={...input,index:5,rr:100,totalRr:600}', rank);
  const maximum = run('ranksScreen()');
  assert.equal((maximum.match(/aria-current="step"/g) || []).length, 1);
  assert.match(maximum, /höchsten Einsatzrang erreicht/);
  assert.doesNotMatch(maximum, /Noch .* RR bis/);
});
test('queue sorts and filters independently of the active ticket and never interprets markup', () => {
  const run = ui();
  run('state = { session: { id:"run-test", status:"active", mode:"speedrun", queue: input, ticket:{number:"S01"} } }', queue);
  assert.equal(run('sortedQueue().map(t=>t.number).join(",")'), 'S02,S01');
  assert.equal(run('queueSort="waiting"; sortedQueue()[0].number'), 'S01');
  assert.equal(run('queueSort="requester"; sortedQueue()[0].number'), 'S02');
  assert.equal(run('queueFilter="closed"; sortedQueue()[0].number'), 'S03');
  assert.equal(run('queueFilter="all"; queueSearch="buchhaltung"; sortedQueue()[0].number'), 'S02');
  assert.equal(run('state.session.ticket.number'), 'S01');
  const html = run('queueSearch=""; queueRows()');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('empty speedrun queue offers a wait action without revealing future arrivals', () => {
  const run = ui();
  run('state={session:{id:"run-idle",mode:"speedrun",status:"active",elapsed:7,duration:60,canWaitForArrival:true,queue:[{...input[0],status:"solved"}]}}', queue);
  const html = run('queueBoard()');
  assert.match(html, /IN BEREITSCHAFT/);
  assert.match(html, /data-action="wait-arrival"/);
  assert.match(html, /zählt als Wartezeit/);
  assert.doesNotMatch(html, /Keine Tickets für diese Ansicht|S02|S03/);
  run('pending=true;');
  assert.match(run('queueIdle()'), /data-action="wait-arrival" disabled/);
  run('pending=false;state.session.queue.push(input[1]);', queue);
  assert.equal(run('queueIdle()'), '');
  run('state.session.queue.pop();state.session.status="completed";');
  assert.equal(run('queueIdle()'), '');
  run('state.session.status="active";state.session.mode="career";');
  assert.equal(run('queueIdle()'), '');
});
test('arrivals announce once per new ticket and reset removes old popups', () => {
  const run = ui();
  run('state={session:{id:"run-test",mode:"speedrun",status:"active",queue:input.slice(0,1)}}', queue);
  run('acceptState({session:{id:"run-test",mode:"speedrun",status:"active",queue:input.slice(0,2)}})', queue);
  assert.equal(run('arrivalNotices.map(t=>t.number).join(",")'), 'S02');
  run('acceptState({session:{id:"run-test",mode:"speedrun",status:"active",queue:input.slice(0,2)}})', queue);
  assert.equal(run('arrivalNotices.length'), 1);
  run('acceptState({session:null})');
  assert.equal(run('arrivalNotices.length'), 0);
});

test('completion sounds play once on the transition and audio drafts survive concurrent state refresh', () => {
  const run = ui();
  run('window.sounds=[]; window.GameAudio={configure(){},play(name){window.sounds.push(name)}}; state={audio:{muted:true},session:{id:"a",status:"active"}}; pendingAudioSaves=1;');
  const result = { audio: { muted: false }, session: { id: 'a', status: 'completed' }, game: { latest: { solved: true, rankUp: false }, ranked: {latest: {id: 'a', rankUp: true}} } };
  run('acceptState(input)', result);
  assert.equal(run('state.audio.muted'), true);
  assert.equal(run('window.sounds.join(",")'), 'levelup');
  run('acceptState(input)', result);
  assert.equal(run('window.sounds.length'), 1);
});

test('main menu resumes existing sessions, escapes ticket titles and does not mutate the session', () => {
  const run = ui();
  run('state={level:3,session:{status:"active",ticket:{number:"1001",title:"<script>bad</script>"}}}');
  const html = run('mainMenu()');
  assert.match(html, /data-action="resume"/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(run('state.session.status'), 'active');
});

test('result screen uses saved rewards and has distinct success and failure states', () => {
  const run=ui();
  run('state={session:{id:"a",mode:"career",status:"completed",ticket:{number:"1001"}},game:{xp:415,latest:{id:"a",mode:"career",solved:true,score:95,xp:415,baseXp:315,bonusXp:100,unlocked:[],rankUp:true,rankName:"Einsatzbereit"}}}');
  assert.match(run('resultScreen()'), /EINSATZ GESCHAFFT/);
  assert.match(run('resultScreen()'), /data-count="95"/);
  assert.match(run('resultScreen()'), /data-count="415"/);
  run('state.game.latest.solved=false;state.game.latest.xp=0;state.game.latest.rankUp=false');
  assert.match(run('resultScreen()'), /EINSATZ GESCHEITERT/);
  assert.equal(run('state.game.xp'),415);
  run('state.session.status="active"');
  assert.equal(run('resultScreen()'),'');
});

test('difficulty cards retain six real radio values and the selected level', () => {
  const run=ui(),html=run('levelPicks(6)');
  assert.equal((html.match(/name="level"/g)||[]).length,6);
  assert.match(html,/value="6" checked/);
  assert.match(html,/EXTREM/);
});
