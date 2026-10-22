'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {createApp}=require('../server');
async function fixture(t,archives=[]){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sim-perf-test-'));fs.mkdirSync(path.join(root,'ui/characters'),{recursive:true});fs.mkdirSync(path.join(root,'.sim'));
 fs.writeFileSync(path.join(root,'AGENTS.md'),'Nur Simulation.');fs.writeFileSync(path.join(root,'ui/style.css'),'body{color:red}');
 for(const suffix of ['', '-lord', '-lord-breakout'])fs.writeFileSync(path.join(root,'ui/characters/chimera'+suffix+'.png'),'SECRET-ART');
 fs.writeFileSync(path.join(root,'ui/characters/pixel-atlas-secret.png'),'SECRET-PIXEL-ART');
 fs.writeFileSync(path.join(root,'.sim/ui-state.json'),JSON.stringify({version:1,rewardCatalogVersion:2,masteryCatalogVersion:2,companionLevelVersion:2,model:'gpt-6-luna',session:null,archives,companionChosen:false}));
 let clock=Date.parse('2026-10-21T12:00:00Z'),available=true;
 const app=createApp({root,now:()=>clock,authCheck:async()=>({available})});await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port,{token}=await (await fetch(base+'/api/bootstrap')).json();
 const request=(route,input,headers={})=>fetch(base+route,{method:input===undefined?'GET':'POST',headers:{'X-Sim-Token':token,...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},...(input===undefined?{}:{body:JSON.stringify(input)})});
 t.after(async()=>{await app.close();fs.rmSync(root,{recursive:true,force:true});});
 return{root,base,request,clock:time=>{clock=Date.parse(time)},auth:value=>{available=value}};
}
test('cached state invalidates for preferences, auth, UTC rollover, future timestamps and reset',async t=>{
 const future={id:'future',mode:'career',level:3,completedAt:'2026-10-21T13:00:00Z',scenarioIds:['site-vpn-dns'],ticket:{number:'1001'},elapsed:12,reference:20,summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0}};
 const f=await fixture(t,[future]);const read=async()=>await(await f.request('/api/state')).json();
 const before=await read();assert.deepEqual(await read(),before);
 f.clock('2026-10-21T13:00:00Z');const after=await read();assert.notDeepEqual(after.game.challenges.daily,before.game.challenges.daily);
 f.clock('2026-10-21T11:00:00Z');assert.deepEqual((await read()).game.challenges.daily,before.game.challenges.daily);
 f.clock('2026-10-22T00:00:00Z');assert.notEqual((await read()).game.challenges.daily.key,before.game.challenges.daily.key);
 await f.request('/api/settings',{model:'gpt-6-luna',theme:'light'});assert.equal((await read()).theme,'light');
 f.auth(false);await f.request('/api/connection',{});assert.equal((await read()).auth.available,false);
 await f.request('/api/reset',{confirmation:'RESET'});assert.equal((await read()).game.solved,0);
});
test('asset revalidation avoids transferring unchanged bytes and keeps gated assets private',async t=>{
 const f=await fixture(t);const first=await f.request('/style.css');assert.equal(first.status,200);const etag=first.headers.get('etag');assert.ok(etag);assert.match(first.headers.get('cache-control'),/must-revalidate/);assert.equal(await first.text(),'body{color:red}');
 const cached=await f.request('/style.css',undefined,{'If-None-Match':etag});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
 fs.writeFileSync(path.join(f.root,'ui/style.css'),'body{color:purple}');const updated=await f.request('/style.css',undefined,{'If-None-Match':etag});assert.equal(updated.status,200);assert.notEqual(updated.headers.get('etag'),etag);assert.equal(await updated.text(),'body{color:purple}');
 // Keep the HEAD client scoped and close its sockets before fixture shutdown.
 const http=require('node:http'), agent=new http.Agent({keepAlive:true});
 let head;
 try {
   head=await new Promise((resolve,reject)=>{
     const req=http.request(f.base+'/style.css',{method:'HEAD',agent},res=>{
       let body='';res.on('data',chunk=>body+=chunk);
       res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));res.on('error',reject);
     });req.on('error',reject);req.end();
   });
 } finally { agent.destroy(); }
 assert.equal(head.status,200);assert.equal(head.headers['content-length'],String(Buffer.byteLength('body{color:purple}')));assert.equal(head.body,'');
 for(const suffix of ['', '-lord', '-lord-breakout']){
   const secret=await f.request('/characters/chimera'+suffix+'.png',undefined,{'If-None-Match':'*'});assert.equal(secret.status,404);assert.equal(secret.headers.get('etag'),null);await secret.text();
 }
 const pixelSecret=await f.request('/characters/pixel-atlas-secret.png',undefined,{'If-None-Match':'*'});assert.equal(pixelSecret.status,404);assert.equal(pixelSecret.headers.get('etag'),null);await pixelSecret.text();
 const state=await f.request('/api/state');assert.equal(state.headers.get('cache-control'),'no-store');
});
test('unchanged DOM fragments survive rendering and Markdown cache remains safe and bounded',()=>{
 const context=vm.createContext({menuArtwork:'',document:{querySelector:()=>({}),addEventListener(){}},window:{addEventListener(){}},fetch:()=>new Promise(()=>{})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../ui/app.js'),'utf8'),context);
 vm.runInContext(`var writes=0;var element={set innerHTML(value){writes++}};replaceHtml(element,'<p>one</p>');replaceHtml(element,'<p>one</p>');`,context);assert.equal(vm.runInContext('writes',context),1);
 vm.runInContext(`replaceHtml(element,'<p>two</p>')`,context);assert.equal(vm.runInContext('writes',context),2);
 const source='<script>alert(1)</script>\n**hello**';context.source=source;const expected=vm.runInContext('markdown(source)',context);assert.doesNotMatch(expected,/<script>/);assert.match(expected,/<strong>hello/);assert.equal(vm.runInContext('markdown(source)',context),expected);
 vm.runInContext(`for(let i=0;i<200;i++)markdown(String(i)+'x'.repeat(5000))`,context);assert.ok(vm.runInContext('markdownCache.size<=128 && markdownCacheSize<=500000',context));
});
