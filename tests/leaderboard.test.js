'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {leaderboard}=require('../server/leaderboard');
const career=(id,score=95,minutes=12)=>({id,title:'Ticket '+id,mode:'career',level:3,elapsed:minutes,reference:20,completedAt:'2026-10-21T12:00:00Z',summary:{score,solved:true},report:'SECRET-REPORT',hidden:{cause:'SECRET-CAUSE'}});
const shift=(id,duration,score)=>({...career(id,score),mode:'speedrun',duration,summary:{score,solvedCount:3}});
test('local career leaderboard sorts real records and shares places for equal scores',()=>{
 const result=leaderboard([career('a',95,20),career('b',95,10),career('c',94,8),career('a',100,1)]);
 assert.equal(result.scope,'local');assert.equal(result.total,3);
 assert.deepEqual(result.entries.map(row=>[row.id,row.rank]),[['b',1],['a',1],['c',3]]);
 assert.equal(result.entries[0].referenceRatio,.5);assert.equal(result.entries[0].minutes,10);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|hidden|report|cause/);
});
test('speedrun durations have distinct rankings and pagination retains global places',()=>{
 const archives=[shift('a',60,200),shift('b',120,900),shift('c',60,150),shift('d',240,2000),career('career')];
 const result=leaderboard(archives,{mode:'speedrun',duration:60,limit:1,offset:1});
 assert.equal(result.total,2);assert.equal(result.entries[0].id,'c');assert.equal(result.entries[0].rank,2);
 assert.equal(leaderboard(archives,{mode:'speedrun',duration:120}).entries[0].id,'b');
 assert.equal(leaderboard(archives,{mode:'speedrun'}).duration,60);
});
test('date filters include boundaries, exclude undated records, and preserve an honest empty state',()=>{
 const undated=career('old');delete undated.completedAt;
 const filtered=leaderboard([career('dated'),undated],{from:'2026-10-21T12:00:00Z',to:'2026-10-21T12:00:00Z'});
 assert.equal(filtered.total,1);assert.equal(filtered.entries[0].id,'dated');
 assert.equal(leaderboard([undated]).entries[0].completedAt,null);
 assert.deepEqual(leaderboard([]).entries,[]);assert.equal(leaderboard([]).total,0);
});
test('malformed entries cannot inject score, invalid time, or internal fields into a ranking',()=>{
 const archives=[career('ok'),{...career('bad-score'),summary:{score:Infinity,solved:true}},career('too-high',101),career('bad-time',90,-1),
   {...career('bad-level'),level:7},{...career('bad-solved'),summary:{score:90,solved:'true'}},{...career('bad-wait'),waiting:NaN},null];
 const result=leaderboard(archives);assert.equal(result.total,1);assert.equal(result.entries[0].id,'ok');
 const missingRef=career('no-reference');delete missingRef.reference;assert.equal(leaderboard([missingRef]).entries[0].referenceRatio,null);
});
test('unsupported filters fail explicitly rather than silently mixing categories',()=>{
 for(const options of [{mode:'all'},{mode:'speedrun',duration:15},{duration:60},{limit:101},{offset:-1},{limit:'20'},
  {from:'bad date'},{from:'2026-10-22',to:'2026-10-21'},{unexpected:true},null])assert.throws(()=>leaderboard([],options),error=>error.status===400);
});
