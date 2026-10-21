'use strict';
// Isolated, repeatable HTTP benchmark; never reads a player's save.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {createApp}=require('../server');
(async()=>{
 const results=[];
 for(const count of [10,1000]){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ticket-performance-'));
  fs.writeFileSync(path.join(root,'AGENTS.md'),'Nur Simulation.');
  fs.mkdirSync(path.join(root,'.sim'));
  const archives=Array.from({length:count},(_,i)=>({id:'perf-'+i,mode:'career',level:3,completedAt:'2026-10-20T12:00:00Z',scenarioIds:['site-vpn-dns'],title:'DNS incident '+i,ticket:{number:String(1001+i)},elapsed:12,reference:20,report:'# Bericht\n'+('Diagnose und Lösung. '.repeat(100)),summary:{solved:true,score:95,wrongChanges:0,unnecessaryChecks:0,strengths:'Diagnose',gaps:''}}));
  fs.writeFileSync(path.join(root,'.sim/ui-state.json'),JSON.stringify({version:1,rewardCatalogVersion:2,masteryCatalogVersion:2,companionLevelVersion:2,model:'gpt-6-luna',session:null,archives,companionChosen:false}));
  const app=createApp({root,now:()=>Date.parse('2026-10-21T12:00:00Z'),authCheck:async()=>({available:true})});
  try{
   await app.ready;await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
   const base='http://127.0.0.1:'+app.server.address().port;
   const {token}=await (await fetch(base+'/api/bootstrap')).json();
   const samples=[];let bytes=0;
   for(let i=0;i<16;i++){
    const start=performance.now();const text=await (await fetch(base+'/api/state',{headers:{'X-Sim-Token':token}})).text();
    if(i>=4)samples.push(performance.now()-start);bytes=Buffer.byteLength(text);
   }
   samples.sort((a,b)=>a-b);results.push({archives:count,medianMs:+samples[Math.floor(samples.length/2)].toFixed(2),p95Ms:+samples[Math.floor(samples.length*.95)].toFixed(2),responseBytes:bytes});
  }finally{await app.close();fs.rmSync(root,{recursive:true,force:true});}
 }
 console.log(JSON.stringify({results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
