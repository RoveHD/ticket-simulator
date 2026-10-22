'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../ui/arcane.js'),'utf8');
const segments=[16,18,16,8,3,6,4,1,3,3,3,3,3,8,5].map(weight=>({weight,chance:weight,name:'Reward'}));
function fixture(){
 const rotor={style:{transform:''}},state={game:{arcane:{segments,recent:[],balance:300,price:100,totalSpins:0}}};
 const context=vm.createContext({state,currentView:'casino',document:{addEventListener(){},querySelector:selector=>selector==='#arcane-wheel-rotor'?rotor:null},esc:String,isBusy:()=>false});
 vm.runInContext(source,context);
 return {rotor,state,run:code=>vm.runInContext(code,context)};
}
test('casino restores every weighted winning angle through CSSOM without inline HTML styles',()=>{
 const f=fixture();let start=0;
 assert.doesNotMatch(f.run('casinoScreen()'),/\sstyle=/);
 f.run('mountArcaneViews()');assert.equal(f.rotor.style.transform,'rotate(0deg)');
 for(let index=0;index<segments.length;index++){
  f.state.game.arcane.recent=[{segmentIndex:index,requestId:'receipt-'+index}];
  f.run('mountArcaneViews()');
  assert.equal(f.rotor.style.transform,`rotate(${-(start+segments[index].weight/2)*3.6}deg)`,'segment '+index);
  start+=segments[index].weight;
 }
});
test('casino mount preserves an in-flight spin and restores its saved receipt when idle',()=>{
 const f=fixture();f.state.game.arcane.recent=[{segmentIndex:14,requestId:'saved'}];
 f.rotor.style.transform='rotate(123deg)';
 f.run('arcaneBusy=true;mountArcaneViews()');assert.equal(f.rotor.style.transform,'rotate(123deg)');
 f.run('arcaneBusy=false;arcaneWheelAnimation={};mountArcaneViews()');assert.equal(f.rotor.style.transform,'rotate(123deg)');
 f.run('arcaneWheelAnimation=null;mountArcaneViews()');assert.equal(f.rotor.style.transform,'rotate(-351deg)');
});
