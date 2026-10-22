'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {createApp}=require('../server');
async function fixture(t,{roll=()=>0,archives=[]}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sim-arcane-api-'));fs.writeFileSync(path.join(root,'AGENTS.md'),'Nur Simulation.');fs.mkdirSync(path.join(root,'.sim'));
 fs.writeFileSync(path.join(root,'.sim/ui-state.json'),JSON.stringify({version:1,rewardCatalogVersion:2,masteryCatalogVersion:2,companionLevelVersion:2,model:'gpt-6-luna',theme:'dark',session:null,archives,companionChosen:true,cosmetics:{portrait:'portrait-snake-base'}}));
 let app,base,token;
 async function boot(){app=createApp({root,arcaneRandomInt:roll,authCheck:async()=>({available:false})});await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+app.server.address().port;token=(await(await fetch(base+'/api/bootstrap')).json()).token}await boot();
 const request=async(route,input,headers={})=>{const response=await fetch(base+route,{method:input===undefined?'GET':'POST',headers:{'X-Sim-Token':token,...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});return{status:response.status,data:await response.json()}};
 t.after(async()=>{await app.close();fs.rmSync(root,{recursive:true,force:true})});
 return{root,request,get app(){return app},async restart(){await app.close();await boot()}};
}
test('spin API books once under concurrent/repeated requests and survives restart',async t=>{
 let rolls=0;const f=await fixture(t,{roll:()=>{rolls++;return 71}});
 assert.equal((await f.request('/api/state')).data.game.arcane.balance,300);
 const first={requestId:'arcane-request-0001',expectedSpins:0};const [a,b]=await Promise.all([f.request('/api/arcane/spin',first),f.request('/api/arcane/spin',{requestId:'arcane-request-0002',expectedSpins:0})]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);const winner=a.status===200?a:b,input=a.status===200?first:{requestId:'arcane-request-0002',expectedSpins:0};
 assert.equal(winner.data.receipt.segmentIndex,7);assert.equal(winner.data.state.game.arcane.balance,200);
 assert.ok(winner.data.state.game.inventory.some(r=>r.id==='title-arcane-sovereign'));
 const repeat=await f.request('/api/arcane/spin',input);assert.equal(repeat.data.replayed,true);assert.equal(rolls,1);assert.equal(repeat.data.state.game.arcane.totalSpins,1);
 const equipped=await f.request('/api/cosmetics',{kind:'title',id:'title-arcane-sovereign'});assert.equal(equipped.status,200);
 await f.restart();const reloaded=(await f.request('/api/state')).data;assert.equal(reloaded.game.cosmetics.title,'title-arcane-sovereign');assert.equal(reloaded.game.arcane.balance,200);
 const before=fs.readFileSync(path.join(f.root,'.sim/ui-state.json'),'utf8');assert.equal((await f.request('/api/arcane/spin',{...input,expectedSpins:1,index:7})).status,400);assert.equal(fs.readFileSync(path.join(f.root,'.sim/ui-state.json'),'utf8'),before);
 assert.equal((await f.request('/api/arcane/spin',{requestId:'arcane-unauth-0001',expectedSpins:1},{'X-Sim-Token':'bad'})).status,403);
 await f.request('/api/reset',{confirmation:'RESET'});const reset=(await f.request('/api/state')).data;assert.equal(reset.game.arcane.balance,300);assert.equal(reset.game.arcane.totalSpins,0);assert.ok(!reset.game.inventory.some(r=>r.id==='title-arcane-sovereign'));
});
test('failed persistence leaves spin balance and inventory untouched',async t=>{
 const f=await fixture(t);await f.request('/api/arcane/spin',{requestId:'arcane-save-first',expectedSpins:0});
 const file=path.join(f.root,'.sim/ui-state.json'),backup=file+'.backup';fs.renameSync(file,backup);fs.mkdirSync(file);
 try{const result=await f.request('/api/arcane/spin',{requestId:'arcane-save-failed',expectedSpins:1});assert.equal(result.status,500);const current=(await f.request('/api/state')).data.game.arcane;assert.equal(current.balance,225);assert.equal(current.totalSpins,1)}finally{fs.rmdirSync(file);fs.renameSync(backup,file)}
});
test('leaderboard API is local, filtered and contains no internal ticket data',async t=>{
 const archives=[{id:'case-real',mode:'career',level:3,title:'DNS restored',elapsed:10,reference:12,report:'SECRET REPORT',hidden:{cause:'SECRET CAUSE'},summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}}];
 const f=await fixture(t,{archives});const result=await f.request('/api/leaderboard?mode=career');assert.equal(result.status,200);assert.equal(result.data.scope,'local');assert.equal(result.data.entries[0].score,95);assert.ok(!JSON.stringify(result.data).includes('SECRET'));
 assert.equal((await f.request('/api/leaderboard?duration=12')).status,400);assert.equal((await f.request('/api/leaderboard?mode=career&mode=speedrun')).status,400);assert.equal((await f.request('/api/leaderboard?fake=1')).status,400);
 assert.deepEqual((await f.request('/api/leaderboard?mode=speedrun&duration=120')).data.entries,[]);
});
test('closing the app closes an idle browser preconnection without waiting for HTTP headers',async t=>{
 const f=await fixture(t),socket=net.connect(f.app.server.address().port,'127.0.0.1');await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject)});
 const closed=new Promise(resolve=>socket.once('close',resolve));const timer=setTimeout(()=>socket.destroy(Error('Idle connection was not closed')),2500);timer.unref();
 try{await f.app.close();await closed;assert.ok(socket.destroyed);assert.equal(f.app.server.listening,false)}finally{clearTimeout(timer);socket.destroy()}
});
