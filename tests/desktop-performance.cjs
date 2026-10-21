'use strict';
module.exports=async contents=>contents.executeJavaScript(`(()=>{
 const savedState=state,savedDraft=draft,savedView=currentView;
 try{
  const text='## Diagnose\\n'+('Eintrag mit **Messwert** und nslookup.\\n'.repeat(16));
  state={...state,session:{id:'performance-fixture',mode:'career',level:3,elapsed:0,queue:[],ticket:{number:'1001',title:'Performance-Test',priority:'P3',description:'Isolierter Test'},...state.session,status:'active',report:null,messages:Array.from({length:120},(_,i)=>({role:i%2?'user':'assistant',content:i+' '+text}))}};
  draft='Noch nicht gesendete Diagnose';navigate('simulation');
  const measure=force=>{const samples=[];for(let i=0;i<12;i++){if(force)renderedHtml.delete(main);const start=performance.now();render();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return +samples[6].toFixed(2);};
  const rebuildMedianMs=measure(true),reuseMedianMs=measure(false);
  const input=document.querySelector('#message'),message=document.querySelector('.message'),dock=document.querySelector('.companion-dock-button');
  if(!input||!message||!dock)throw Error('Performance test misses live UI');
  input.focus();input.setSelectionRange(5,12);const log=document.querySelector('#messages');log.scrollTop=0;
  const observer=new MutationObserver(()=>{});observer.observe(main,{childList:true});observer.observe(document.querySelector('#companion-dock'),{childList:true});
  for(let i=0;i<10;i++)render();
  const replacements=observer.takeRecords().length;observer.disconnect();
  if(replacements||document.querySelector('.message')!==message||document.querySelector('.companion-dock-button')!==dock)throw Error('Unchanged UI was rebuilt');
  if(document.activeElement!==input||input.selectionStart!==5||input.selectionEnd!==12||log.scrollTop!==0)throw Error('Refresh lost draft focus, selection or scroll');
  if(markdownCacheSize>500000)throw Error('Markdown cache exceeds memory budget');
  return{messages:120,unchangedRenders:10,replacements,draftFocusPreserved:true,rebuildMedianMs,reuseMedianMs};
 }catch(error){return{error:error.message,stack:error.stack}}finally{state=savedState;draft=savedDraft;navigate(savedView);}
})()`).then(result=>{if(result.error)throw Error(result.error+'\n'+result.stack);return result});
