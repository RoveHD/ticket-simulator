'use strict';
const fs = require('node:fs');
const path = require('node:path');

exports.checkAudio = async contents => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'audio.js'), 'utf8');
  return contents.executeJavaScript(`(async () => {
    let factory;
    { const module={exports:{}},window={}; ${source}
      factory=module.exports.createForTest;
    }
    async function renderSound(effect) {
      const seconds=effect?1.2:25;
      const offline=new OfflineAudioContext(1,Math.ceil(24000*seconds),24000);
      let now=0, callback=null;
      const adapter={state:'running',get currentTime(){return now;},destination:offline.destination,
        createGain:()=>offline.createGain(),createOscillator:()=>offline.createOscillator(),
        resume:async()=>{},suspend:async()=>{},close:async()=>{}};
      const audio=factory({createContext:()=>adapter,setTimeout:fn=>{callback=fn;return 1;},clearTimeout:()=>{callback=null;}});
      audio.configure({musicEnabled:!effect,musicVolume:1,effectsVolume:1});
      await audio.unlock();
      if(effect) audio.play(effect);
      else for(now=.05;now<seconds-.1;now+=.05){const fn=callback;callback=null;fn?.();}
      const buffer=await offline.startRendering(), samples=buffer.getChannelData(0);
      let peak=0,energy=0,late=0;
      for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));energy+=samples[i]**2;if(i>samples.length*.8)late+=samples[i]**2;}
      audio.dispose();
      const rms=Math.sqrt(energy/samples.length);
      if(!Number.isFinite(rms)||rms<.0001||peak>=1||(!effect&&late===0)) throw new Error('Audio signal invalid: '+effect+' '+rms+' '+peak);
      return {peak:Number(peak.toFixed(4)),rms:Number(rms.toFixed(4)),seconds};
    }
    const signals={music:await renderSound()};
    for(const effect of ['click','arrival','success','error','levelup']) signals[effect]=await renderSound(effect);
    navigate('settings');
    const slider=document.querySelector('[data-audio-control="musicVolume"]');
    slider.value='37';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));
    await audioSaveChain;
    if((await api('state')).audio.musicVolume!==.37) throw new Error('Audio slider not persisted');
    document.querySelector('[data-action="sound"]').click();await audioSaveChain;
    if(!state.audio.muted || !(await api('state')).audio.muted) throw new Error('Master mute not saved');
    await GameAudio.unlock();
    if(!GameAudio.status().supported || !GameAudio.status().unlocked || GameAudio.status().running) throw new Error('Muted WebAudio context is not suspended');
    document.querySelector('[data-action="sound"]').click();await audioSaveChain;
    const choice=document.querySelector('[data-audio-control="musicTrack"]');
    choice.value='battle';choice.dispatchEvent(new Event('change',{bubbles:true}));await audioSaveChain;
    if((await api('state')).audio.musicTrack!=='battle'||!choice.selectedOptions[0].textContent.includes('Pixel Rush'))throw Error('Soundtrack nicht gespeichert oder falsch benannt');
    const response=await fetch('/music/pixel-rush.ogg');
    if(!response.ok||response.headers.get('content-type')!=='audio/ogg')throw Error('Lokale Musik fehlt');
    const decoder=new OfflineAudioContext(2,1,44100);
    const track=await decoder.decodeAudioData(await response.arrayBuffer());
    if(!Number.isFinite(track.duration)||track.duration<1)throw Error('OGG nicht dekodierbar');
    let media;
    const visibleDocument={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
    const player=factory({document:visibleDocument,createAudio:src=>{media=new Audio(src);media.muted=true;return media;}});
    player.configure({musicTrack:'battle',musicEnabled:true});
    await player.unlock();
    await new Promise((resolve,reject)=>{
      if(!media.paused&&media.readyState>=3)return resolve();
      const cleanup=()=>{clearTimeout(timer);media.removeEventListener('playing',onPlay);media.removeEventListener('error',onError);};
      const onPlay=()=>{cleanup();resolve();};const onError=()=>{cleanup();reject(Error('OGG-Wiedergabe fehlgeschlagen'));};
      const timer=setTimeout(()=>{cleanup();reject(Error('OGG startet nicht'));},7000);
      media.addEventListener('playing',onPlay,{once:true});media.addEventListener('error',onError,{once:true});
    });
    if(!media.loop||media.paused)throw Error('Lokaler Track spielt nicht als Loop');
    player.configure({muted:true});if(!media.paused)throw Error('OGG lässt sich nicht stummschalten');
    player.dispose();
    return {signals,sliderSaved:true,muteSaved:true,localTrack:{title:'Pixel Rush',seconds:Math.round(track.duration),decoded:true,playbackVerified:true}};
  })()`, true);
};
