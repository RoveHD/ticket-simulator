'use strict';
// Short, bounded canvas bursts. No idle render loop and no input interception.
(() => {
  let canvas, context, frame=0, particles=[], lastTime=0;
  const colors=['#c69aff','#78eadc','#f5d88b','#9ca8ff'];
  function clear(){if(frame)cancelAnimationFrame(frame);frame=0;particles=[];if(context)context.clearRect(0,0,innerWidth,innerHeight)}
  function resize(){if(!canvas)return;const scale=Math.min(1.5,devicePixelRatio||1);canvas.width=Math.round(innerWidth*scale);canvas.height=Math.round(innerHeight*scale);context.setTransform(scale,0,0,scale,0,0)}
  function draw(time){
    const delta=Math.min(.04,(time-lastTime)/1000||.016);lastTime=time;
    context.clearRect(0,0,innerWidth,innerHeight);
    particles=particles.filter(p=>p.life>0);
    for(const p of particles){p.life-=delta;p.x+=p.dx*delta;p.y+=p.dy*delta;p.dy+=18*delta;p.angle+=delta*p.turn;context.save();context.globalAlpha=Math.max(0,p.life/p.duration);context.translate(p.x,p.y);context.rotate(p.angle);context.strokeStyle=p.color;context.fillStyle=p.color;context.lineWidth=1.4;
      if(p.rune){context.strokeRect(-p.size,-p.size,p.size*2,p.size*2);context.beginPath();context.moveTo(-p.size,0);context.lineTo(p.size,0);context.moveTo(0,-p.size);context.lineTo(0,p.size);context.stroke()}
      else{context.fillRect(-p.size/2,-p.size/2,p.size,p.size)}context.restore();
    }
    frame=particles.length?requestAnimationFrame(draw):0;
  }
  function emit(kind='click',x=innerWidth/2,y=innerHeight/2){
    if(document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
    if(!canvas){canvas=document.createElement('canvas');canvas.id='arcane-fx';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);context=canvas.getContext('2d');if(!context){canvas.remove();canvas=null;return false}resize()}
    const count=kind==='jackpot'?60:kind==='spell'?30:kind==='portal'?22:10;
    particles=particles.slice(-Math.max(0,100-count));
    for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,speed=(kind==='jackpot'?65:35)+Math.random()*85,duration=.35+Math.random()*(kind==='jackpot'?1.1:.55);particles.push({x,y,dx:Math.cos(angle)*speed,dy:Math.sin(angle)*speed-15,life:duration,duration,size:2+Math.random()*3,color:colors[i%colors.length],angle:angle,turn:(i%2?1:-1)*1.5,rune:i%5===0})}
    if(!frame){lastTime=performance.now();frame=requestAnimationFrame(draw)}return true;
  }
  document.addEventListener('click',event=>{const target=event.target.closest('button,a[data-view]');if(!target||target.disabled||target.dataset.action==='sound')return;const box=target.getBoundingClientRect();emit(target.dataset.action==='ability'?'spell':'click',event.detail?event.clientX:box.left+box.width/2,event.detail?event.clientY:box.top+box.height/2)},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
  window.addEventListener('resize',()=>{clear();resize()});
  window.addEventListener('pagehide',clear);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',clear);
  window.ArcaneFX={emit,clear};
})();
