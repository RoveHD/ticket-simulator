'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { STARTER, PRICE, SEGMENTS, earnedDust, validArcanePersistence, arcaneView, arcaneRewards, spin } = require('../server/arcane');
const clean = id => ({ id, mode: 'career', summary: { solved: true, wrongChanges: 0, unnecessaryChecks: 0 } });
const request = count => ({ requestId: `spin-${String(count).padStart(8,'0')}`, expectedSpins: count });
const clock = '2026-10-21T12:00:00.000Z';
const selected = state => ({ companionChosen: true, cosmetics: { portrait: 'portrait-snake-base' }, ...state });
const play = (state, count, roll) => spin(selected(state), request(count), { randomInt: () => roll, now: clock });
const rejects = (fn, status) => assert.throws(fn, error => error.status === status);

test('wallet derives earnings only from deduplicated real solved archives', () => {
  const archives = [clean('a'), clean('a'), { ...clean('b'), summary: { solved: true, wrongChanges: 1, unnecessaryChecks: 0 } },
    { ...clean('c'), summary: { solved: false, wrongChanges: 0, unnecessaryChecks: 0 } },
    { id:'s', mode:'speedrun', summary:{ solvedCount:3 } }, { id:'bad',mode:'speedrun',summary:{solvedCount:'100'} }];
  assert.equal(earnedDust(archives),150);
  const view=arcaneView(selected({archives}));
  assert.equal(view.passEarned,200, 'four unlocked pass packages add 200 dust');
  assert.equal(view.balance,STARTER+150+200);assert.equal(view.price,PRICE);assert.equal(view.totalSpins,0);
  assert.equal(view.currency,'Arkanstaub');assert.equal(view.canSpin,true);
  assert.deepEqual(arcaneRewards({archives}),[]);
});
test('published weighted segments match every random bucket exactly', () => {
  assert.equal(SEGMENTS.reduce((sum,item)=>sum+item.weight,0),100);
  const counts=Array(15).fill(0);
  for(let roll=0;roll<100;roll++){
    const result=play({archives:[]},0,roll);counts[result.receipt.segmentIndex]++;
    assert.ok(validArcanePersistence(result.nextState));
    assert.equal(arcaneView(result.nextState).balance,STARTER-PRICE+result.receipt.dustAwarded);
  }
  assert.deepEqual(counts,SEGMENTS.map(segment=>segment.chance));
});
test('spin is pure, reload-safe, and a retry neither draws nor charges again', () => {
  const source={archives:[clean('a')]}, snapshot=JSON.stringify(source);
  const first=play(source,0,0);assert.equal(JSON.stringify(source),snapshot);
  assert.equal(first.nextState.arcane.spent,100);assert.equal(arcaneView(source).passEarned,50, 'first pass package adds 50 dust');assert.equal(first.receipt.balance,325);
  const saved=JSON.parse(JSON.stringify(first.nextState));
  const replay=spin(saved,request(0),{randomInt:()=>{throw Error('must not draw again')}});
  assert.equal(replay.replayed,true);assert.equal(replay.nextState,saved);assert.deepEqual(replay.receipt,first.receipt);
  rejects(()=>spin(saved,{requestId:'different-spin-id',expectedSpins:0}),409);
  assert.equal(saved.arcane.spins,1);
});
test('cosmetic wins equip through normal inventory metadata and duplicates convert to dust', () => {
  let state={archives:Array.from({length:20},(_,i)=>clean('a'+i))};
  const results=[];
  for(const roll of [61,67,71,61]){const result=play(state,state.arcane?.spins||0,roll);state=result.nextState;results.push(result.receipt)}
  const rewards=arcaneRewards(state);
  assert.deepEqual(rewards.map(r=>r.kind),['badge','badge','title']);
  assert.deepEqual(rewards.map(r=>r.rarity),['epic','legendary','mythic']);
  assert.ok(rewards.every(reward=>!reward.frame && !reward.character));
  assert.equal(results[3].duplicate,true);assert.equal(results[3].dustAwarded,150);assert.equal(rewards.length,3);
  const view=arcaneView(state);view.segments[5].reward.name='tampered';rewards[0].name='tampered';view.recent[0].balance=0;
  assert.notEqual(arcaneRewards(state)[0].name,'tampered');assert.notEqual(state.arcane.receipts.at(-1).balance,0);
});
test('wallet cannot overdraw and malformed or client-forged spin requests fail without mutation', () => {
  let state={archives:[]};for(let i=0;i<3;i++)state=play(state,i,0).nextState;
  const snapshot=JSON.stringify(state);assert.equal(arcaneView(state).balance,75);assert.equal(arcaneView(state).canSpin,false);
  rejects(()=>play(state,3,0),409);assert.equal(JSON.stringify(state),snapshot);
  for(const input of [null,{},request(-1),{requestId:'short',expectedSpins:0},{requestId:'valid-id-123',expectedSpins:0,segmentIndex:7},{requestId:'valid-id-123',expectedSpins:'0'}]) rejects(()=>spin({archives:[]},input),400);
  for(const roll of [-1,100,NaN,.5,'0']) rejects(()=>play({archives:[]},0,roll),500);
  rejects(()=>spin({archives:[]},request(0),{randomInt:()=>0,now:'bad date'}),500);
});
test('bounded receipt history rejects stale evicted retries and stale concurrent requests', () => {
  let state={archives:[]};
  for(let i=0;i<60;i++)state=play(state,i,58).nextState;
  assert.equal(state.arcane.receipts.length,50);assert.equal(state.arcane.spins,60);assert.ok(validArcanePersistence(state));
  rejects(()=>spin(state,request(0)),409);
  const retry=spin(state,request(59));assert.equal(retry.replayed,true);assert.equal(retry.nextState.arcane.spins,60);
  const one=play(state,60,0);rejects(()=>spin(one.nextState,{requestId:'concurrent-other',expectedSpins:60}),409);
});
test('corrupt ledgers and numeric overflow are rejected rather than reset', () => {
  const valid=play({archives:[]},0,61).nextState;
  const corrupt=[{...valid.arcane,spins:-1},{...valid.arcane,spent:0},{...valid.arcane,won:100},
    {...valid.arcane,owned:['title-unknown']},{...valid.arcane,receipts:[]},
    {...valid.arcane,receipts:[{...valid.arcane.receipts[0],requestId:12345678}]},
    {version:1,spins:0,spent:0,won:0,owned:['badge-arcane-oracle'],receipts:[]}];
  for(const arcane of corrupt){const state={archives:[],arcane};assert.equal(validArcanePersistence(state),false);rejects(()=>arcaneView(state),500);rejects(()=>spin(state,request(0)),500)}
  rejects(()=>arcaneView({archives:[{id:'huge',mode:'speedrun',summary:{solvedCount:Math.floor(Number.MAX_SAFE_INTEGER/20)}}]}),500);
});
