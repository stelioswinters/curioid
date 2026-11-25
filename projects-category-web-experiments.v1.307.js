/* CURIOID v1.307 category bundle: web-experiments. Generated from the v1.306 monolith. */
(() => {
  'use strict';
  const window = globalThis.window;

function gravityMarkup() {
    return projectFrame('Web experiment / 02', 'Gravity Garden', 'A living field of flower-planets. Drag blooms into new orbits, change the spin of the whole frame and watch a rare black-hole flower consume anything it touches.', `<div class="tool-canvas-wrap"><canvas class="tool-canvas gravity-canvas" aria-label="Gravity simulation"></canvas><div class="canvas-overlay"><span>DRAG A FLOWER-PLANET · TAP TO PLANT</span><span data-stat="gravity">FIELD ACTIVE</span></div></div><div class="tool-button-row">${action('＋ Add bloom','add-planet',true)}${action('Ⅱ Pause','pause-gravity')}${action('↺ Reset system','reset-gravity')}${action('Clear trails','clear-trails')}</div>`, panel('Field settings', range('Gravity','gravity',25,220,105,'%')+range('Orbital speed','speed',35,180,100,'%')+range('Frame rotation','rotation',0,100,0,'%')+range('Trail length','trail',5,95,55,'%')+`<div class="tool-readout"><span>Objects in the field</span><strong data-stat="bodies">07 / 20</strong></div><p class="tool-small">Drag a flower-planet to move it. Tap empty space or use “Add bloom” to plant another. Small blooms leave more room to orbit. Frame rotation uses centrifugal and Coriolis terms in a co-rotating reference frame. A rare black-hole flower may appear as the field fills; it consumes other blooms on contact but never the central flower. Maximum: 20 bodies.</p>`), 'A deliberately simplified 2D gravitational model with softened Newtonian attraction. Rotation adds the standard centrifugal and Coriolis terms for a rotating frame; it is a visual sandbox, not a full astrophysics simulator.');
  }

function bindGravity(root) {
    const canvas = $('.gravity-canvas', root), stat = $('[data-stat="bodies"]', root), state = $('[data-stat="gravity"]', root);
    let bodies = [], burns = [], paused = false, drag = null, trail = 55, gravity = 105, speed = 100, rotation = 0, lastW = 1, lastH = 1;
    const omega = () => (rotation / 100) * .055;
    function updateCount(){stat.textContent=`${bodies.length} / 20${bodies.some(b=>b.isBlackHole)?' · SINGULARITY':''}`;}
    const reset = () => {
      const aspect = Math.max(.55, lastW / Math.max(1, lastH));
      const centralMass = 34;
      const G = .00062 * (gravity / 100);
      burns = [];
      bodies = [{x:.5,y:.5,vx:0,vy:0,m:centralMass,r:18,c:'#d6ff69',fixed:true,trail:[],petals:13,phase:0,size:1.15},
        ...[0,1,2,3,4,5].map((i)=>{
          const a=i*(Math.PI*2/6)+rand(-.12,.12),r=.17+i*.038;
          const v=Math.sqrt(G*centralMass/r)*(speed/100), spin=omega();
          const x=.5+Math.cos(a)*r/aspect,y=.5+Math.sin(a)*r;
          // Convert the initial near-circular inertial velocity into the rotating frame.
          const vx=-Math.sin(a)*v + spin*(y-.5);
          const vy=Math.cos(a)*v - spin*((x-.5)*aspect);
          return {x,y,vx,vy,m:rand(2,8),r:rand(4.8,7.1),c:pick(palettes.mineral),trail:[],petals:6+Math.floor(rand(0,7)),phase:rand(0,Math.PI*2),size:rand(.68,.9)};
        })];
      updateCount(); sim.redraw();
    };
    let sim = fitCanvas(canvas, (ctx,w,h,t,dt,initial) => {
      lastW=w; lastH=h;
      ctx.fillStyle='#10131a'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(214,255,105,.055)'; ctx.lineWidth=1;
      for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
      for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      if(!initial && !paused && dt>0){
        const G=.00062*(gravity/100), soft=.018, step=Math.min(.028,dt)*(speed/100), aspect=Math.max(.55,w/Math.max(1,h)), spin=omega();
        burns.forEach(b=>b.age+=dt); burns=burns.filter(b=>b.age<b.duration);
        for(let i=1;i<bodies.length;i++){
          const b=bodies[i]; let ax=0,ay=0;
          for(let j=0;j<bodies.length;j++){
            if(i===j)continue;
            const a=bodies[j],dx=(a.x-b.x)*aspect,dy=a.y-b.y,d2=dx*dx+dy*dy+soft*soft,inv=1/Math.pow(d2,1.5);
            ax+=G*a.m*dx*inv; ay+=G*a.m*dy*inv;
          }
          // Rotating-frame inertial terms: outward centrifugal acceleration Ω²r
          // and Coriolis acceleration -2 Ω×v. The attraction itself remains Newtonian.
          if(spin>0){const rx=(b.x-.5)*aspect,ry=b.y-.5;ax+=spin*spin*rx+2*spin*b.vy;ay+=spin*spin*ry-2*spin*b.vx;}
          b.vx+=ax*step; b.vy+=ay*step;
        }
        for(let i=1;i<bodies.length;i++){
          const b=bodies[i]; b.x+=b.vx*step/aspect; b.y+=b.vy*step;
          b.trail.push([b.x*w,b.y*h]); if(b.trail.length>Math.round(22+trail*1.7))b.trail.shift();
          if(b.x<.035||b.x>.965)b.vx*=-.92; if(b.y<.055||b.y>.945)b.vy*=-.92;
          b.x=clamp(b.x,.035,.965); b.y=clamp(b.y,.055,.945);
        }
        // A black-hole flower is unique and eats any orbiting bloom it touches.
        // The fixed central flower is deliberately excluded from collisions.
        const hole=bodies.find((b,i)=>i>0&&b.isBlackHole);
        if(hole){
          for(let j=bodies.length-1;j>0;j--){
            const other=bodies[j];
            if(other===hole||other.isBlackHole)continue;
            const d=Math.hypot((other.x-hole.x)*w,(other.y-hole.y)*h);
            if(d<hole.r+other.r*1.25+4){
              hole.m=Math.min(22,hole.m+other.m*.22); hole.absorbed=(hole.absorbed||0)+1;
              burns.push({x:other.x,y:other.y,age:0,duration:.58,color:other.c||'#f0a15c',seed:rand(0,Math.PI*2)});
              bodies.splice(j,1);
            }
          }
        }
      }
      bodies.forEach((b,i)=>{
        if(b.trail.length>1){ctx.beginPath();b.trail.forEach((p,j)=>j?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=b.isBlackHole?'rgba(184,139,220,.7)':b.c+'88';ctx.lineWidth=Math.max(1,b.r*.34);ctx.stroke();}
        const x=b.x*w,y=b.y*h;
        if(b.isBlackHole){const halo=ctx.createRadialGradient(x,y,1,x,y,b.r*5.8);halo.addColorStop(0,'rgba(6,5,12,.98)');halo.addColorStop(.28,'rgba(24,14,35,.82)');halo.addColorStop(.58,'rgba(163,104,203,.22)');halo.addColorStop(1,'rgba(120,80,180,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,b.r*5.8,0,Math.PI*2);ctx.fill();ctx.save();ctx.translate(x,y);ctx.rotate(t*.7);ctx.strokeStyle='rgba(211,170,255,.8)';ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(0,0,b.r*2.8,b.r*1.05,.12,0,Math.PI*2);ctx.stroke();ctx.restore();}
        else {const glow=ctx.createRadialGradient(x,y,1,x,y,b.r*(i===0?4.2:2.8));glow.addColorStop(0,b.c+'99');glow.addColorStop(1,b.c+'00');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,b.r*(i===0?4.2:2.8),0,Math.PI*2);ctx.fill();}
        ctx.save();ctx.translate(x,y);ctx.rotate((b.phase||0)+t*(i===0?.045:.24+rotation*.002));
        const count=b.petals||7,petalLength=b.r*(b.isBlackHole?1.48:i===0?1.22:1.24)*(b.size||1),petalWidth=b.r*(b.isBlackHole?.5:i===0?.52:.54)*(b.size||1);
        for(let p=0;p<count;p++){ctx.save();ctx.rotate(p*Math.PI*2/count);ctx.beginPath();ctx.ellipse(0,-b.r*.82,petalWidth,petalLength,0,0,Math.PI*2);ctx.fillStyle=b.isBlackHole?(p%2?'#4a334f':'#746080'):b.c;ctx.globalAlpha=.84;ctx.fill();ctx.strokeStyle=b.isBlackHole?'#b79acb88':'#fff7';ctx.lineWidth=.75;ctx.stroke();ctx.restore();}
        if(b.isBlackHole){ctx.globalAlpha=1;ctx.fillStyle='#030207';ctx.beginPath();ctx.arc(0,0,b.r*.86,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#c9a1ed';ctx.lineWidth=1.2;ctx.stroke();ctx.fillStyle='#d9c0f4';ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(-b.r*.28,-b.r*.24,Math.max(1,b.r*.12),0,Math.PI*2);ctx.fill();}
        else {const core=ctx.createRadialGradient(-b.r*.28,-b.r*.3,1,0,0,b.r*1.1);core.addColorStop(0,'#fff4');core.addColorStop(.28,b.c);core.addColorStop(1,'#171923');ctx.globalAlpha=1;ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,b.r*(i===0?1.02:.78),0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff9';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#fff7';ctx.beginPath();ctx.arc(-b.r*.22,-b.r*.2,Math.max(1.2,b.r*.12),0,Math.PI*2);ctx.fill();}
        ctx.restore();
      });
      // A swallowed bloom briefly flashes into embers at the event horizon.
      burns.forEach(b=>{const q=clamp(1-b.age/b.duration,0,1),x=b.x*w,y=b.y*h,r=(5+(1-q)*13)*q;ctx.save();ctx.globalAlpha=q;const fire=ctx.createRadialGradient(x,y,1,x,y,Math.max(2,r*2.4));fire.addColorStop(0,'#fff4bd');fire.addColorStop(.26,'#ffb45f');fire.addColorStop(.62,b.color);fire.addColorStop(1,'rgba(244,91,56,0)');ctx.fillStyle=fire;ctx.beginPath();ctx.arc(x,y,r*2.4,0,Math.PI*2);ctx.fill();for(let k=0;k<5;k++){const a=b.seed+k*Math.PI*2/5+ b.age*3,dist=5+b.age*28;ctx.fillStyle=k%2?'#ffd27c':'#fff3d2';ctx.beginPath();ctx.arc(x+Math.cos(a)*dist,y+Math.sin(a)*dist,Math.max(.6,1.8*q),0,Math.PI*2);ctx.fill();}ctx.restore();});
      updateCount(); if(!initial)state.textContent=paused?'FIELD PAUSED':bodies.some(b=>b.isBlackHole)?'SINGULARITY IN FIELD':'FIELD ACTIVE';
    }, true);
    reset();
    const onRange = (key, fn) => {const el=$(`[data-range="${key}"]`,root);el.addEventListener('input',()=>fn(Number(el.value)));};
    onRange('gravity',v=>gravity=v);onRange('speed',v=>speed=v);onRange('trail',v=>trail=v);onRange('rotation',v=>rotation=v);
    function addBodyAt(point){
      if(bodies.length>=20){toast(null,'The field is full. Reset the system to begin a new garden.');return;}
      const aspect=Math.max(.55,lastW/Math.max(1,lastH)),dx=(point.x-.5)*aspect,dy=point.y-.5,r=Math.max(.08,Math.hypot(dx,dy)),a=Math.atan2(dy,dx),spin=omega(),orbitalSpeed=Math.sqrt(.00062*(gravity/100)*34/r)*(speed/100),isBlackHole=!bodies.some(b=>b.isBlackHole)&&bodies.length>=8&&Math.random()<(.035+Math.max(0,bodies.length-8)*.009);
      const body={x:clamp(point.x,.05,.95),y:clamp(point.y,.07,.93),vx:-Math.sin(a)*orbitalSpeed+spin*dy,vy:Math.cos(a)*orbitalSpeed-spin*dx,m:isBlackHole?12:rand(2,8),r:isBlackHole?3.8:rand(4.8,7.1),c:isBlackHole?'#51405f':pick(palettes.mineral),trail:[],petals:isBlackHole?7:6+Math.floor(rand(0,7)),phase:rand(0,Math.PI*2),size:isBlackHole?.78:rand(.68,.9),isBlackHole};
      bodies.push(body);updateCount();sim.redraw();toast(null,isBlackHole?'A rare black-hole flower has entered the garden. Keep it away from the central bloom.':'A new body entered the field.');
    }
    $('[data-action="add-planet"]',root).addEventListener('click',()=>{const a=rand(0,Math.PI*2),r=rand(.17,.43);addBodyAt({x:.5+Math.cos(a)*r,y:.5+Math.sin(a)*r});});
    $('[data-action="pause-gravity"]',root).addEventListener('click',e=>{paused=!paused;e.currentTarget.textContent=paused?'▶ Resume':'Ⅱ Pause';state.textContent=paused?'FIELD PAUSED':'FIELD ACTIVE';});
    $('[data-action="reset-gravity"]',root).addEventListener('click',reset);
    $('[data-action="clear-trails"]',root).addEventListener('click',()=>bodies.forEach(b=>b.trail=[]));
    function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};}
    canvas.addEventListener('pointerdown',/** @param {CurioidDOMEvent} e */ e=>{const p=pos(e);let best=null,dist=1e9;bodies.slice(1).forEach(b=>{const d=Math.hypot((b.x-p.x)*lastW,(b.y-p.y)*lastH);if(d<dist){dist=d;best=b;}});if(best&&dist<24){drag=best;canvas.setPointerCapture(e.pointerId);}else if(Math.hypot((.5-p.x)*lastW,(.5-p.y)*lastH)>30){addBodyAt(p);}});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=pos(e);drag.x=clamp(p.x,.04,.96);drag.y=clamp(p.y,.06,.94);drag.vx=0;drag.vy=0;drag.trail=[];});
    const end=()=>drag=null;canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
    return ()=>sim.stop();
  }

function patternMarkup(){return projectFrame('Web experiment / 03','Pattern Engine','Make a pattern, then push the color and geometry past their polite settings. Seeds keep the accidents repeatable.',`<div class="tool-canvas-wrap art-canvas-wrap"><canvas class="tool-canvas pattern-canvas" aria-label="Generated geometric pattern"></canvas><div class="canvas-overlay"><span>GENERATIVE STUDY / COLOR FIELD</span><span data-pattern-seed>SEED 0001</span></div></div><div class="tool-button-row">${action('↻ New pattern','new-pattern',true)}${action('Go vivid','pattern-vivid')}${action('Copy seed','copy-pattern-seed')}${action('↓ Save PNG to Vault','export-pattern')}</div>`,panel('Pattern controls',select('Geometry','geometry',[['mixed','Mixed geometry'],['petal','Petal field'],['orbit','Orbit marks'],['shard','Broken shards'],['rings','Nested rings'],['fractal','Fractal bloom'],['interference','Interference grid']])+range('Symmetry','symmetry',3,28,12)+range('Density','density',8,120,64)+range('Distortion','distortion',0,100,72)+range('Vibrance','pattern-vibrance',80,200,158,'%')+range('Bloom','pattern-bloom',0,100,68,'%')+select('Palette','palette',[['mineral','Mineral study'],['bruise','Bruised velvet'],['dusk','Last light'],['sterile','Quiet laboratory'],['signal','Signal error'],['ultraviolet','Ultraviolet'],['toxic','Toxic garden'],['infrared','Infrared'],['archive','Archive paper'],['abyss','Abyss'],['candy','Candy glass'],['oxidized','Oxidized metal'],['lunar','Lunar dust'],['fever','Fever dream'],['sediment','Sediment']])+`<label class="tool-control"><span>Recreate a seed</span><input type="number" data-pattern-seed-input min=0 max=999999 step=1 value=1></label><div class="tool-button-row">${action('Apply seed','apply-pattern-seed')}</div><p class="tool-small">Vibrance and bloom affect the actual artwork, not just the preview. Copy a seed to recreate a composition later.</p>`),'A little too much color is sometimes exactly enough.');}

function bindPattern(root){
    const canvas=$('.pattern-canvas',root);let seed=Math.floor(Math.random()*999999);
    const obs=fitCanvas(canvas,(ctx,W,H)=>{
      const palette=(palettes[$('[data-select="palette"]',root).value]||palettes.signal).slice();
      const vibrance=+$('[data-range="pattern-vibrance"]',root).value/100,bloom=+$('[data-range="pattern-bloom"]',root).value/100;
      const symmetry=+$('[data-range="symmetry"]',root).value,density=+$('[data-range="density"]',root).value,dist=+$('[data-range="distortion"]',root).value/100,geometry=$('[data-select="geometry"]',root).value;
      const satBoost=(hex)=>{const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,max=Math.max(r,g,b)/255,min=Math.min(r,g,b)/255,l=(max+min)/2,d=max-min;let h=0,ss=0;if(d){ss=d/(1-Math.abs(2*l-1));if(max===r/255)h=((g/255-b/255)/d)%6;else if(max===g/255)h=(b/255-r/255)/d+2;else h=(r/255-g/255)/d+4;h=(h*60+360)%360;}ss=clamp(ss*vibrance,0,1);const c=(1-Math.abs(2*l-1))*ss,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let q=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+q.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');};
      const colors=palette.map(satBoost);let state=seed>>>0;const rr=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
      const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#090b16');bg.addColorStop(.45,'#171126');bg.addColorStop(1,'#090e17');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
      const cx=W/2,cy=H/2,R=Math.min(W,H)*(.39+dist*.04);ctx.save();ctx.translate(cx,cy);
      for(let ring=0;ring<Math.ceil(density/10);ring++){
        const radius=R*(.08+ring/Math.max(1,Math.ceil(density/10))*.92),items=Math.max(1,Math.ceil(symmetry*(.7+rr()*1.5)));
        for(let i=0;i<items;i++){
          const a=i*Math.PI*2/items+(rr()-.5)*dist*1.05,rad=radius+(rr()-.5)*dist*R*.65,size=R*(.012+rr()*.045)*(1+dist*2.5),col=colors[Math.floor(rr()*colors.length)],alpha=.35+rr()*.62;
          ctx.save();ctx.translate(Math.cos(a)*rad,Math.sin(a)*rad);ctx.rotate(a+(rr()-.5)*dist*3);ctx.globalAlpha=alpha;ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=.7+rr()*(2+bloom*7);ctx.shadowColor=col;ctx.shadowBlur=bloom*(7+rr()*26);
          const kind=geometry==='mixed'?Math.floor(rr()*5):geometry;
          if(kind==='rings'||kind===4){ctx.beginPath();ctx.arc(0,0,size*(1+rr()*2.8),0,Math.PI*2);ctx.stroke();}
          else if(kind==='petal'||kind===1){ctx.beginPath();ctx.ellipse(0,0,size*(.25+rr()),size*(1+rr()*4),rr()*Math.PI,0,Math.PI*2);ctx.fill();}
          else if(kind==='orbit'||kind===2){ctx.beginPath();ctx.ellipse(0,0,size*(1+rr()*3),size*(.2+rr()),rr()*Math.PI,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(size,0,Math.max(1,size*.13),0,Math.PI*2);ctx.fill();}
          else if(kind==='fractal'||kind===5){for(let k=0;k<5;k++){ctx.rotate(Math.PI*2/5);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(size*(1+dist*2),-size*.18);ctx.lineTo(size*(.35+rr()),size*.6);ctx.closePath();ctx.fill();}}
          else if(kind==='interference'||kind===6){ctx.beginPath();for(let k=0;k<12;k++){const q=k/12*Math.PI*2,r=size*(.55+Math.sin(q*5+seed)*.4);k?ctx.lineTo(Math.cos(q)*r,Math.sin(q)*r):ctx.moveTo(Math.cos(q)*r,Math.sin(q)*r);}ctx.closePath();ctx.stroke();}
          else{ctx.beginPath();const sides=3+Math.floor(rr()*5);for(let k=0;k<sides;k++){const q=k/sides*Math.PI*2,rrr=size*(.4+rr()*(1+dist*2));k?ctx.lineTo(Math.cos(q)*rrr,Math.sin(q)*rrr):ctx.moveTo(Math.cos(q)*rrr,Math.sin(q)*rrr);}ctx.closePath();ctx.fill();}
          ctx.restore();
        }
      }
      ctx.restore();
      // A few overprinted arcs make the image feel like a physical print run gone slightly wrong.
      ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<Math.round(3+dist*18);i++){const col=colors[i%colors.length],rad=R*(.18+rr()*.9),start=rr()*Math.PI*2;ctx.strokeStyle=col;ctx.globalAlpha=.08+bloom*.14;ctx.lineWidth=1+rr()*6;ctx.beginPath();ctx.arc(cx+(rr()-.5)*dist*W*.28,cy+(rr()-.5)*dist*H*.28,rad,start,start+Math.PI*(.3+rr()*1.55));ctx.stroke();}ctx.restore();
      const vignette=ctx.createRadialGradient(cx,cy,R*.15,cx,cy,R*1.25);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,8,.76)');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    },false);
    const seedField=$('[data-pattern-seed-input]',root);const applySeed=value=>{seed=clamp(Math.floor(Number(value)||0),0,999999);seedField.value=String(seed);$('[data-pattern-seed]',root).textContent='SEED '+String(seed).padStart(6,'0');obs.redraw();};
    const update=()=>applySeed(Math.floor(Math.random()*999999));
    $('[data-action="new-pattern"]',root).addEventListener('click',update);$('[data-action="pattern-vivid"]',root).addEventListener('click',()=>{$('[data-range="pattern-vibrance"]',root).value='200';$('[data-range="pattern-bloom"]',root).value='96';$('[data-range="density"]',root).value='110';$('[data-range="distortion"]',root).value='88';$('[data-select="palette"]',root).value='fever';update();});
    $('[data-action="apply-pattern-seed"]',root).addEventListener('click',()=>applySeed(seedField.value));seedField.addEventListener('change',()=>applySeed(seedField.value));seedField.addEventListener('keydown',/** @param {CurioidDOMEvent} e */ e=>{if(e.key==='Enter')applySeed(seedField.value);});
    $('[data-action="copy-pattern-seed"]',root).addEventListener('click',async()=>{const text=String(seed).padStart(6,'0');try{await curioidClipboard.writeText(text);toast(null,'Pattern seed copied.');}catch(e){downloadBlob(new Blob([text],{type:'text/plain'}),'curioid-pattern-seed.txt');}});
    ['symmetry','density','distortion','pattern-vibrance','pattern-bloom'].forEach(k=>$(`[data-range="${k}"]`,root).addEventListener('input',()=>obs.redraw()));$('[data-select="geometry"]',root).addEventListener('change',()=>obs.redraw());$('[data-select="palette"]',root).addEventListener('change',()=>obs.redraw());$('[data-action="export-pattern"]',root).addEventListener('click',()=>saveCanvas(canvas,'curioid-pattern.png'));applySeed(seedField.value||seed);return()=>obs.stop();
  }

const paradoxOptions=[['triangle','Penrose triangle'],['stairs','Returning staircase'],['fork','Three-way fork'],['cube','Impossible cube'],['bridge','Bridge with no far side'],['arch','Unfinished arch'],['ladder','Looping ladder'],['window','Window into itself'],['pillar','Split pillar'],['knot','Impossible knot'],['helix','Staircase helix'],['trident','Three-way trident'],['frame','Broken perspective frame'],['ring','Closed-end ring'],['fold','Folded room'],['hourglass','Inverted hourglass'],['spiral','Unending spiral'],['orbit','Orbiting platform'],['nested','Nested room'],['cantilever','Unsupported cantilever'],['stairbridge','Staircase bridge'],['levitate','Floating plinth'],['tunnel','Tunnel with two exits'],['openring','Open ring, closed path'],['mobius','Möbius walkway'],['infiniteframe','Frame with no inside'],['splitbridge','Bridge crossing itself'],['foldroom','Room folded through itself'],['stairwell','Stairwell with two ground floors'],['nesteddoors','Nested doorways'],['suspendedcube','Suspended cube with a missing face'],['torsion','Twisted load-bearing column'],['impossiblegate','Gate that closes from both sides'],['looparch','Arch returning to its keystone'],['offsettower','Tower with a displaced centre'],['crossing','Four-way crossing with three roads']];

function impossibleMarkup(){return projectFrame('Web experiment / 05','Impossible Objects','Rotate the construction until the perspective fails. Some of these settings are deliberately unreasonable.',`<div class="tool-canvas-wrap paradox-wrap"><canvas class="tool-canvas paradox-canvas" aria-label="Impossible geometry illustration"></canvas><div class="canvas-overlay"><span>DRAG TO ROTATE</span><span data-paradox-label>PENROSE TRIANGLE</span></div></div><div class="tool-button-row">${action('↻ Change viewpoint','paradox-view',true)}${action('＋ Next structure','paradox-next')}${action('Go impossible','paradox-extreme')}${action('Randomize scene','paradox-random')}${action('↓ Save PNG to Vault','paradox-export')}</div>`,panel('Construction controls',select('Structure','paradox-shape',paradoxOptions)+range('Perspective','perspective',0,100,76)+range('Edge thickness','paradox-edge',2,30,12,' px')+range('Reality warp','paradox-warp',0,100,72,'%')+range('Depth inversion','paradox-depth',0,100,64,'%')+`<label class="tool-check"><input type="checkbox" data-paradox-seams checked> Show construction seams</label><p class="tool-small">Try the extreme preset, then drag the object. It should become harder to tell which edge belongs to which face.</p>`),'Thirty-six constructions, now with more ways to break their perspective.');}

function bindImpossible(root){
    const canvas=$('.paradox-canvas',root);let angle=0;
    function paint(ctx,w,h){
      ctx.fillStyle='#11131a';ctx.fillRect(0,0,w,h);const cx=w/2,cy=h/2,warp=+$('[data-range="paradox-warp"]',root).value/100,depth=+$('[data-range="paradox-depth"]',root).value/100,scale=Math.min(w,h)*(.0037+warp*.00125),mode=$('[data-select="paradox-shape"]',root).value,per=+$('[data-range="perspective"]',root).value/100,seams=$('[data-paradox-seams]',root).checked,edge=+$('[data-range="paradox-edge"]',root).value;
      ctx.save();ctx.translate(cx,cy);ctx.rotate(angle*(1+warp*1.8));ctx.transform(1,(per-.5)*(.55+warp*2.1),(per-.5)*(.34+warp*1.65),1,0,0);ctx.scale(scale*(1+depth*.55),scale*(1-depth*.42));ctx.lineJoin=warp>.65?'bevel':'round';ctx.lineCap='round';ctx.shadowColor=depth>.52?'#baa7ff':'#d6ff69';ctx.shadowBlur=warp*depth*13;
      const poly=(pts,fill,stroke='#101015',lw=edge)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();};
      const line=(pts,color='#e9e5d8',lw=5)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=color;ctx.lineWidth=lw;ctx.stroke();};
      const beam=(x1,y1,x2,y2,width,color,depth=17)=>{const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,nx=-dy/len*width/2,ny=dx/len*width/2,ox=-dy/len*depth,oy=dx/len*depth;poly([[x1+nx,y1+ny],[x2+nx,y2+ny],[x2+nx+ox,y2+ny+oy],[x1+nx+ox,y1+ny+oy]],color);poly([[x1+nx,y1+ny],[x2+nx,y2+ny],[x2-nx,y2-ny],[x1-nx,y1-ny]],color==='#d6ff69'?'#a6c84b':color==='#baa7ff'?'#8270c0':'#7d9c49');};
      if(mode==='triangle'){
        poly([[-180,155],[0,-180],[-45,-98],[-135,155]],'#8aab4c');poly([[0,-180],[180,155],[85,155],[0,-15]],'#baa7ff');poly([[-180,155],[180,155],[100,75],[-100,75]],'#d6ff69');line([[-115,92],[-58,92],[0,-12],[61,92],[116,92]],'#e9e5d8',3);
      } else if(mode==='stairs'){
        for(let i=0;i<13;i++){const a=i*Math.PI*2/13,r=65+i*7,x=Math.cos(a)*r,y=Math.sin(a)*r;ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);poly([[-30,-12],[30,-12],[42,0],[-18,0]],i%2?'#baa7ff':'#d6ff69');poly([[-18,0],[42,0],[42,17],[-18,17]],i%2?'#77679f':'#879e45');ctx.restore();}ctx.strokeStyle='#d7d0bd';ctx.lineWidth=12;ctx.beginPath();ctx.arc(0,0,148,.12,Math.PI*1.85);ctx.stroke();
      } else if(mode==='fork'){
        beam(-160,135,-18,-15,45,'#d6ff69');beam(-18,-15,95,-150,45,'#baa7ff');beam(-18,-15,170,145,45,'#85e6da');beam(-18,-15,-145,-155,35,'#8aab4c');
      } else if(mode==='cube'){
        poly([[-115,-105],[0,-165],[120,-105],[0,-42]],'#d6ff69');poly([[-115,-105],[0,-42],[0,112],[-115,45]],'#78934a');poly([[0,-42],[120,-105],[120,45],[0,112]],'#baa7ff');poly([[-50,-85],[0,-112],[57,-82],[0,-50]],'#14151d','#e4e0d5',4);line([[-50,-85],[-50,20],[0,48],[57,18],[57,-82]],'#f5eedf',3);
      } else if(mode==='bridge'){
        beam(-190,-58,-22,-58,43,'#d6ff69');beam(22,-58,190,-58,43,'#baa7ff');beam(-165,110,-22,110,35,'#78934a');beam(22,110,165,110,35,'#85e6da');beam(-22,-58,-22,110,28,'#baa7ff',12);beam(22,-58,22,110,28,'#d6ff69',12);line([[-190,-58],[-190,110],[-165,110]],'#f1efe6',3);line([[190,-58],[190,110],[165,110]],'#f1efe6',3);
      } else if(mode==='arch'){
        poly([[-155,150],[-155,-38],[-104,-105],[-52,-38],[-52,150]],'#d6ff69');poly([[52,150],[52,-38],[104,-105],[155,-38],[155,150]],'#baa7ff');poly([[-155,-38],[-104,-105],[104,-105],[155,-38],[105,-6],[-104,-6]],'#85e6da');line([[-104,-105],[-104,-20],[104,-20],[104,-105]],'#f3eddf',5);line([[-155,150],[-52,150],[52,150],[155,150]],'#11131a',4);
      } else if(mode==='ladder'){
        const left=[],right=[];for(let i=0;i<7;i++){const y=-165+i*55,x=Math.sin(i/6*Math.PI*2)*90;left.push([x-38,y]);right.push([x+38,y]);}line(left,'#d6ff69',15);line(right,'#baa7ff',15);for(let i=0;i<7;i++){const y=-165+i*55,x=Math.sin(i/6*Math.PI*2)*90;beam(x-38,y,x+38,y,11,i%2?'#85e6da':'#d6ff69',7);}line([left[0],right[6],right[0],left[6]],'#e6e0d4',3);
      } else if(mode==='window'){
        poly([[-150,-135],[120,-135],[150,-102],[-120,-102]],'#b4ca72');poly([[-150,-135],[-120,-102],[-120,120],[-150,87]],'#879e45');poly([[-120,-102],[150,-102],[150,120],[-120,120]],'#baa7ff');poly([[-72,-54],[94,-54],[94,70],[-72,70]],'#171923','#e5e1d8',8);line([[-72,8],[94,8],[14,-54],[14,70]],'#d6ff69',5);line([[94,-54],[14,8],[-72,-54]],'#85e6da',4);
      } else if(mode==='pillar'){
        for(let i=0;i<7;i++){const y=-160+i*48,shift=(i%2?82:-82);poly([[-53+shift,y],[53+shift,y],[85+shift,y+24],[-21+shift,y+24]],i%2?'#baa7ff':'#d6ff69');poly([[-21+shift,y+24],[85+shift,y+24],[85+shift,y+49],[-21+shift,y+49]],i%2?'#8170b5':'#859e4a');}line([[-130,-160],[130,176]],'#f0ece0',4);
      } else if(mode==='knot'){
        ctx.lineWidth=38;ctx.strokeStyle='#d6ff69';ctx.beginPath();ctx.moveTo(-170,-90);ctx.bezierCurveTo(170,-220,170,220,-170,90);ctx.stroke();ctx.strokeStyle='#baa7ff';ctx.beginPath();ctx.moveTo(170,-90);ctx.bezierCurveTo(-170,-220,-170,220,170,90);ctx.stroke();ctx.lineWidth=4;ctx.strokeStyle='#13151b';ctx.beginPath();ctx.moveTo(-20,-120);ctx.lineTo(22,-82);ctx.moveTo(20,120);ctx.lineTo(-22,82);ctx.stroke();
      } else if(mode==='helix'){
        for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=65+i*8,x=Math.cos(a)*r,y=Math.sin(a)*r;beam(x-24,y-28,x+24,y+28,18,i%2?'#baa7ff':'#d6ff69',12);}ctx.strokeStyle='#e9e5d8';ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(0,0,160,94,.45,0,Math.PI*2);ctx.stroke();
      } else if(mode==='trident'){
        beam(0,150,0,-35,54,'#d6ff69');beam(0,-35,-145,-165,40,'#baa7ff');beam(0,-35,0,-190,40,'#85e6da');beam(0,-35,145,-165,40,'#d6ff69');poly([[-65,-5],[0,-74],[65,-5],[0,65]],'#baa7ff');
      } else if(mode==='frame'){
        poly([[-165,-130],[95,-130],[165,-72],[-95,-72]],'#d6ff69');poly([[-165,-130],[-95,-72],[-95,155],[-165,90]],'#849f4a');poly([[-95,-72],[165,-72],[165,155],[-95,155]],'#baa7ff');poly([[-118,-45],[118,-45],[118,125],[-118,125]],'#11131a','#f0eadf',8);line([[-165,-130],[0,0],[165,-72]],'#85e6da',3);
      } else if(mode==='ring'){
        for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const x=Math.cos(a)*125,y=Math.sin(a)*125;ctx.save();ctx.translate(x,y);ctx.rotate(a);poly([[-32,-13],[32,-13],[48,0],[-16,0]],i%2?'#baa7ff':'#d6ff69');poly([[-16,0],[48,0],[48,22],[-16,22]],i%2?'#77669e':'#829b45');ctx.restore();}ctx.strokeStyle='#e8e3d8';ctx.lineWidth=8;ctx.beginPath();ctx.arc(0,0,150,0,Math.PI*2);ctx.stroke();
      } else if(mode==='hourglass'){
        beam(-145,-150,145,150,34,'#d6ff69');beam(145,-150,-145,150,34,'#baa7ff');beam(-145,-150,-145,150,25,'#85e6da');beam(145,-150,145,150,25,'#859d4b');beam(-145,0,145,0,20,'#baa7ff');
      } else if(mode==='spiral'){
        for(let i=0;i<13;i++){const a=i*.54,r=25+i*11,x=Math.cos(a)*r,y=Math.sin(a)*r;beam(x,y,x+Math.cos(a+.8)*40,y+Math.sin(a+.8)*40,17,i%3===0?'#85e6da':i%2?'#baa7ff':'#d6ff69',10);}ctx.strokeStyle='#e9e5d8';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,158,.1,Math.PI*1.82);ctx.stroke();
      } else if(mode==='orbit'){
        poly([[-165,0],[0,-90],[165,0],[0,90]],'#d6ff69');poly([[-165,0],[0,90],[0,155],[-165,65]],'#819b49');poly([[0,90],[165,0],[165,65],[0,155]],'#baa7ff');ctx.strokeStyle='#e9e5d8';ctx.lineWidth=13;ctx.beginPath();ctx.ellipse(0,0,205,75,-.4,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#85e6da';ctx.beginPath();ctx.arc(0,-7,29,0,Math.PI*2);ctx.fill();
      } else if(mode==='nested'){
        for(let i=0;i<5;i++){const r=170-i*28;ctx.strokeStyle=i%2?'#baa7ff':'#d6ff69';ctx.lineWidth=15-i*1.5;ctx.strokeRect(-r*.72,-r*.55,r*1.44,r*1.1);}line([[-122,-92],[125,94]],'#85e6da',7);line([[125,-92],[-122,94]],'#e9e5d8',5);
      } else if(mode==='cantilever'){
        beam(-160,125,-160,-120,34,'#85e6da');beam(-160,-120,165,-120,38,'#d6ff69');beam(165,-120,165,120,30,'#baa7ff');beam(-160,0,165,0,18,'#baa7ff');line([[0,-120],[0,0]],'#e9e5d8',4);beam(-155,125,5,125,35,'#8aab4c');
      } else if(mode==='stairbridge'){
        for(let i=0;i<8;i++){const x=-170+i*44,y=100-i*28;beam(x,y,x+45,y,22,i%2?'#baa7ff':'#d6ff69',14);beam(x+45,y,x+45,y-28,17,'#85e6da',10);}line([[-170,100],[180,-96]],'#e9e5d8',5);line([[-170,125],[180,-71]],'#baa7ff',5);
      } else if(mode==='levitate'){
        poly([[-145,15],[-25,-58],[108,-12],[-22,63]],'#d6ff69');poly([[-22,63],[108,-12],[120,37],[-10,114]],'#8da64e');poly([[-145,15],[-22,63],[-10,114],[-155,65]],'#6a8341');ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,160,130,19,0,0,Math.PI*2);ctx.fill();line([[-15,115],[-3,150]],'#baa7ff',4);line([[35,102],[42,147]],'#85e6da',3);
      } else if(mode==='tunnel'){
        for(let i=0;i<8;i++){const f=i/8,r=20+f*180;ctx.strokeStyle=i%2?'#baa7ff':'#d6ff69';ctx.lineWidth=12;ctx.beginPath();ctx.ellipse(0,0,r,r*.62,0,0,Math.PI*2);ctx.stroke();}line([[-180,-110],[180,-110]],'#85e6da',4);line([[-180,110],[180,110]],'#85e6da',4);
      } else if(mode==='openring'){
        for(let i=0;i<9;i++){const a=i/8*Math.PI*1.72-.86,x=Math.cos(a)*135,y=Math.sin(a)*135;ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);beam(-26,0,26,0,26,i%2?'#baa7ff':'#d6ff69',13);ctx.restore();}line([[-50,-174],[30,-174],[95,-132]],'#85e6da',9);line([[50,174],[-30,174],[-95,132]],'#e9e5d8',6);
      } else if(mode==='mobius'){
        ctx.strokeStyle='#d6ff69';ctx.lineWidth=37;ctx.beginPath();ctx.ellipse(0,0,155,90,-.28,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#baa7ff';ctx.lineWidth=16;ctx.beginPath();ctx.ellipse(0,0,155,90,-.28,Math.PI*.1,Math.PI*1.05);ctx.stroke();line([[-160,-8],[-80,-45],[0,-5],[80,40],[160,4]],'#f0eadd',4);
      } else if(mode==='infiniteframe'){
        for(let i=0;i<4;i++){const d=i*24;poly([[-160+d,-120+d],[120-d,-120+d],[160-d,-80+d],[160-d,120-d],[-120+d,120-d],[-160+d,80-d]],i%2?'#baa7ff':'#d6ff69');line([[-160+d,-120+d],[160-d,120-d]],'#85e6da',3);}
      } else if(mode==='splitbridge'){
        beam(-175,105,-25,-20,35,'#d6ff69');beam(-25,-20,145,105,35,'#baa7ff');beam(-175,-105,-25,20,35,'#85e6da');beam(-25,20,145,-105,35,'#d6ff69');poly([[-45,-22],[0,-55],[45,-22],[0,11]],'#baa7ff');
      } else if(mode==='foldroom'){
        poly([[-165,-105],[0,-165],[165,-105],[0,-45]],'#d6ff69');poly([[-165,-105],[0,-45],[0,130],[-165,65]],'#819b49');poly([[0,-45],[165,-105],[165,65],[0,130]],'#baa7ff');poly([[-70,-10],[0,-60],[70,-10],[0,40]],'#85e6da');line([[0,-165],[0,-45],[0,130]],'#f0eadf',5);line([[-165,-105],[0,-10],[165,-105]],'#f0eadf',4);
      } else if(mode==='stairwell'){
        for(let i=0;i<9;i++){const x=-160+i*40,y=95-i*22;beam(x,y,x+48,y,19,i%2?'#baa7ff':'#d6ff69',12);beam(x+48,y,x+48,y-22,16,'#85e6da',10);}for(let i=0;i<8;i++){const x=160-i*40,y=-95+i*22;beam(x,y,x-48,y,19,i%2?'#d6ff69':'#baa7ff',12);beam(x-48,y,x-48,y+22,16,'#85e6da',10);}
      } else if(mode==='nesteddoors'){
        for(let i=0;i<5;i++){const x=-145+i*34,y=-140+i*27,w=290-i*68,h=280-i*54;ctx.strokeStyle=['#d6ff69','#baa7ff','#85e6da','#e9e5d8'][i%4];ctx.lineWidth=13-i;ctx.strokeRect(x,y,w,h);ctx.fillStyle='#11131a';ctx.fillRect(x+w*.72,y+h*.48,5,5);}
      } else if(mode==='suspendedcube'){
        poly([[-115,-110],[0,-170],[120,-110],[0,-48]],'#d6ff69');poly([[-115,-110],[0,-48],[0,105],[-115,42]],'#819b49');line([[0,-48],[120,-110],[120,42],[0,105]],'#baa7ff',18);line([[-115,-110],[-115,42],[0,105]],'#e9e5d8',5);line([[0,-170],[0,-48]],'#85e6da',5);ctx.strokeStyle='#baa7ff';ctx.lineWidth=9;ctx.beginPath();ctx.arc(0,0,188,.1,Math.PI*1.9);ctx.stroke();
      } else if(mode==='torsion'){
        for(let i=0;i<10;i++){const y=-160+i*34,shift=Math.sin(i*.65)*54;poly([[-52+shift,y],[52+shift,y-8],[77+shift,y+13],[-27+shift,y+22]],i%2?'#baa7ff':'#d6ff69');line([[-52+shift,y],[-27+shift,y+22]],'#e9e5d8',3);}line([[-52,-160],[62,165]],'#85e6da',4);
      } else if(mode==='impossiblegate'){
        beam(-140,125,-140,-125,34,'#d6ff69');beam(-140,-125,140,-125,34,'#baa7ff');beam(140,-125,140,125,34,'#85e6da');beam(-140,125,140,125,34,'#d6ff69');beam(-95,90,-95,-90,13,'#e9e5d8');beam(95,-90,95,90,13,'#e9e5d8');line([[-140,125],[0,0],[140,125],[0,-125],[-140,125]],'#f0eadf',4);
      } else if(mode==='looparch'){
        for(let i=0;i<3;i++){ctx.strokeStyle=['#d6ff69','#baa7ff','#85e6da'][i];ctx.lineWidth=23-i*5;ctx.beginPath();ctx.arc(0,15-i*19,130-i*22,Math.PI*.04,Math.PI*1.96);ctx.stroke();}beam(-130,15,0,-125,22,'#d6ff69');beam(0,-125,130,15,22,'#baa7ff');line([[-130,15],[0,15],[130,15]],'#e9e5d8',4);
      } else if(mode==='offsettower'){
        for(let i=0;i<8;i++){const y=-160+i*43,shift=Math.sin(i*.9)*75;poly([[-52+shift,y],[52+shift,y-12],[85+shift,y+12],[-20+shift,y+25]],i%2?'#baa7ff':'#d6ff69');poly([[-20+shift,y+25],[85+shift,y+12],[85+shift,y+43],[-20+shift,y+56]],'#7c8d50');}line([[-100,-160],[120,185]],'#85e6da',4);
      } else if(mode==='fold'){
        // A room that folds through itself: the back wall is drawn as the floor.
        poly([[-170,-135],[-25,-165],[148,-108],[20,-72]],'#baa7ff');
        poly([[-170,-135],[20,-72],[20,118],[-170,68]],'#839d4a');
        poly([[20,-72],[148,-108],[148,80],[20,118]],'#d6ff69');
        poly([[-170,68],[20,118],[148,80],[4,25]],'#85e6da');
        line([[-25,-165],[-25,25],[4,25],[4,-147],[148,-108]],'#f0ece1',5);
        line([[-170,-135],[4,25],[148,80]],'#171923',3);
      } else if(mode==='crossing'){
        beam(-170,-115,0,0,38,'#d6ff69');beam(0,0,170,115,38,'#baa7ff');beam(-170,115,0,0,38,'#85e6da');beam(0,0,170,-115,38,'#d6ff69');poly([[-42,-26],[0,-52],[42,-26],[0,2]],'#baa7ff');line([[-170,-115],[170,115]],'#f0eadf',4);line([[-170,115],[170,-115]],'#f0eadf',4);
      } else {
        poly([[-165,-115],[-45,-155],[20,-70],[-100,-28]],'#d6ff69');poly([[-100,-28],[20,-70],[145,-15],[25,28]],'#baa7ff');poly([[25,28],[145,-15],[165,105],[42,145]],'#85e6da');poly([[-100,-28],[25,28],[42,145],[-82,100]],'#819b49');line([[-165,-115],[-65,-58],[20,-70],[145,-15],[165,105]],'#f1ecdf',4);
      }
      if(warp>.45){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=(warp-.4)*.32;ctx.strokeStyle=depth>.5?'#ff9cba':'#85e6da';ctx.lineWidth=7+warp*13;ctx.beginPath();ctx.ellipse(Math.sin(angle*2)*24,Math.cos(angle)*18,190+warp*110,70+depth*105,angle*.8,0,Math.PI*2);ctx.stroke();ctx.restore();}
      if(seams){ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=2.5+warp*4;ctx.setLineDash([5+warp*12,6]);ctx.beginPath();ctx.arc(0,0,205+warp*85,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      ctx.restore();ctx.fillStyle='#85828f';ctx.font='9px ui-monospace,monospace';ctx.textAlign='left';ctx.fillText('VIEW / '+Math.round(per*100)+'%',12,18);ctx.textAlign='center';ctx.fillText('FOLLOW THE EDGE. IT MAY NOT RETURN.',w/2,h-17);
    }
    const sim=fitCanvas(canvas,(ctx,w,h)=>paint(ctx,w,h),false);
    function redraw(){const name=paradoxOptions.find(x=>x[0]===$('[data-select="paradox-shape"]',root).value)?.[1]||'UNKNOWN CONSTRUCTION';$('[data-paradox-label]',root).textContent=name.toUpperCase();sim.redraw();}
    let dragX=null;canvas.style.cursor='grab';canvas.style.touchAction='none';canvas.addEventListener('pointerdown',/** @param {CurioidDOMEvent} e */ e=>{dragX=e.clientX;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});canvas.addEventListener('pointermove',/** @param {CurioidDOMEvent} e */ e=>{if(dragX===null)return;angle+=(e.clientX-dragX)*.012;dragX=e.clientX;redraw();});const endDrag=()=>{dragX=null;canvas.style.cursor='grab';};canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);
    $('[data-action="paradox-view"]',root).addEventListener('click',()=>{angle+=Math.PI/6;redraw();});$('[data-action="paradox-next"]',root).addEventListener('click',()=>{const s=$('[data-select="paradox-shape"]',root);s.selectedIndex=(s.selectedIndex+1)%paradoxOptions.length;angle=0;redraw();});$('[data-action="paradox-random"]',root).addEventListener('click',()=>{const s=$('[data-select="paradox-shape"]',root);s.selectedIndex=Math.floor(Math.random()*paradoxOptions.length);angle=rand(-1,1);redraw();});$('[data-action="paradox-export"]',root).addEventListener('click',()=>saveCanvas(canvas,'impossible-object.png'));$('[data-select="paradox-shape"]',root).addEventListener('change',redraw);['perspective','paradox-edge','paradox-warp','paradox-depth'].forEach(k=>$(`[data-range="${k}"]`,root).addEventListener('input',redraw));$('[data-action="paradox-extreme"]',root).addEventListener('click',()=>{$('[data-range="perspective"]',root).value='100';$('[data-range="paradox-edge"]',root).value='30';$('[data-range="paradox-warp"]',root).value='100';$('[data-range="paradox-depth"]',root).value='100';angle+=Math.PI*.71;redraw();});$('[data-paradox-seams]',root).addEventListener('change',redraw);redraw();return()=>sim.stop();
  }

function weatherMarkup(){return projectFrame('Web experiment / 06','Pixel Weather','Forecasts from places that do not appear on maps. Change the atmosphere, wait for it to move, and watch the climate settle into its own habits.',`<div class="tool-canvas-wrap"><canvas class="tool-canvas weather-canvas" aria-label="Animated fictional weather"></canvas><div class="canvas-overlay"><span data-weather-place>THE GLASS COAST</span><span data-weather-state>LOCAL CONDITIONS</span></div></div><div class="tool-button-row">${action('↻ New forecast','weather-new',true)}${action('Ⅱ Pause sky','weather-pause')}${action('↓ Save forecast','weather-export')}</div>`,panel('Atmosphere',select('Climate','climate',[['glass','Glass rain'],['ember','Emberfall'],['violet','Violet heat'],['quiet','Quiet snow'],['dust','Dust tide']])+range('Wind','wind',0,100,48)+range('Cloud cover','cloud',0,100,55)+range('Oddness','weather-odd',0,100,62)+`<p class="tool-small">Every forecast is generated locally. The climate may look calm, but it is not necessarily stable.</p>`),'Canvas animation pauses when the project closes; it does not continue running in the background.');}

function bindWeather(root){const canvas=$('.weather-canvas',root);let particles=[],paused=false,climate='glass',wind=48,cloud=55,odd=62,seed=0,lightning=0;const placeNames=['THE GLASS COAST','NORTH OF THE LAST HOUR','THE QUIET EQUATOR','LOWER BLUE DISTRICT','THE WARMING ROOM','SALT ORCHARD'];function forecast(){seed++;particles=Array.from({length:150},()=>({x:Math.random(),y:Math.random(),v:rand(.12,.8),s:rand(1,4),phase:rand(0,8)}));climate=$('[data-select="climate"]',root).value;wind=+$('[data-range="wind"]',root).value;cloud=+$('[data-range="cloud"]',root).value;odd=+$('[data-range="weather-odd"]',root).value;$('[data-weather-place]',root).textContent=pick(placeNames);$('[data-weather-state]',root).textContent=climate.toUpperCase()+' / '+Math.round(rand(3,27))+'°';sim.redraw();}
    const sim=fitCanvas(canvas,(ctx,w,h,t,dt,initial)=>{if(!paused&&!initial){particles.forEach(p=>{p.y+=p.v*(climate==='glass'?1.4:.55)*dt;p.x+=Math.sin(t+p.phase)*dt*(wind/100)*.14;if(p.y>1.05){p.y=-.04;p.x=Math.random();}if(p.x>1)p.x=0;if(p.x<0)p.x=1;});if(Math.random()<dt*(odd/100)*.07)lightning=.12;lightning=Math.max(0,lightning-dt);}
      const themes={glass:['#14273a','#547d91','#b6dcdb'],ember:['#221921','#6b3c47','#e0a06e'],violet:['#28213d','#76618e','#efa0b2'],quiet:['#222c36','#667a8e','#d8e7e8'],dust:['#302923','#8b6d53','#d5bd8c']},c=themes[climate]||themes.glass;const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,c[0]);g.addColorStop(.7,c[1]);g.addColorStop(1,'#11141b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      const sunX=w*(climate==='violet'?.72:.2),sunY=h*.3,sunR=Math.min(w,h)*.09;const halo=ctx.createRadialGradient(sunX,sunY,2,sunX,sunY,sunR*3);halo.addColorStop(0,c[2]+'77');halo.addColorStop(1,c[2]+'00');ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);ctx.fillStyle=c[2];ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(sunX,sunY,sunR,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      const cloudN=Math.round(cloud/9);for(let i=0;i<cloudN;i++){const x=((i*137+Math.sin(t*.05+i)*30)%w),y=h*(.12+(i%4)*.1);ctx.fillStyle=`rgba(12,17,27,${.12+cloud/260})`;ctx.beginPath();ctx.ellipse(x,y,50+(i%3)*22,10+(i%4)*5,0,0,Math.PI*2);ctx.fill();}
      // Horizon silhouettes.
      ctx.fillStyle='#10141a';ctx.beginPath();ctx.moveTo(-3,h*.78);for(let x=0;x<=w+18;x+=14)ctx.lineTo(x,h*(.7+Math.sin(x*.012+seed)*.025+Math.sin(x*.03)*.012));const rightGround=h*(.7+Math.sin((w+18)*.012+seed)*.025+Math.sin((w+18)*.03)*.012);ctx.lineTo(w+4,rightGround);ctx.lineTo(w+4,h+3);ctx.lineTo(-3,h+3);ctx.closePath();ctx.fill();ctx.fillRect(-2,h*.79,w+4,h*.23);ctx.fillStyle='rgba(255,255,255,.035)';ctx.fillRect(-2,h*.79,w+4,Math.max(2,h*.012));
      particles.forEach(p=>{const x=p.x*w,y=p.y*h;ctx.strokeStyle=c[2];ctx.fillStyle=c[2];ctx.globalAlpha=.25+p.v*.45;ctx.lineWidth=p.s;if(climate==='glass'){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-wind*.035,y+8+p.v*12);ctx.stroke();}else if(climate==='quiet'){ctx.beginPath();ctx.arc(x,y,p.s*1.3,0,Math.PI*2);ctx.fill();}else if(climate==='ember'){ctx.beginPath();ctx.ellipse(x,y,p.s*.65,p.s*2,Math.sin(t+p.phase),0,Math.PI*2);ctx.fill();}else{ctx.fillRect(x,y,p.s*2,p.s*2);}});ctx.globalAlpha=1;
      if(lightning>0){ctx.fillStyle=`rgba(221,226,255,${lightning*1.2})`;ctx.fillRect(0,0,w,h);ctx.strokeStyle='#e9eaff';ctx.lineWidth=2;ctx.beginPath();let x=w*(.3+Math.random()*.4),y=0;ctx.moveTo(x,y);for(let i=0;i<5;i++){x+=rand(-20,20);y+=h*.12;ctx.lineTo(x,y);}ctx.stroke();}
      ctx.fillStyle=c[2]+'99';ctx.font='9px ui-monospace,monospace';ctx.fillText('ATMOSPHERIC MODEL / '+String(seed).padStart(3,'0'),14,h-14);
    },true);
    forecast();['wind','cloud','weather-odd'].forEach(k=>$(`[data-range="${k}"]`,root).addEventListener('input',()=>{wind=+$('[data-range="wind"]',root).value;cloud=+$('[data-range="cloud"]',root).value;odd=+$('[data-range="weather-odd"]',root).value;}));$('[data-select="climate"]',root).addEventListener('change',forecast);$('[data-action="weather-new"]',root).addEventListener('click',forecast);$('[data-action="weather-pause"]',root).addEventListener('click',e=>{paused=!paused;e.currentTarget.textContent=paused?'▶ Resume sky':'Ⅱ Pause sky';});$('[data-action="weather-export"]',root).addEventListener('click',()=>saveCanvas(canvas,'pixel-weather.png'));return()=>sim.stop();}

const dreams=[
    {title:'The Hotel With No Lobby',copy:'A hotel whose rooms are arranged around a space that the floor plan calls “outside”. A bell rings at reception, but the desk faces the wall.',fragment:'A brass key is warm, although the room has been empty for years.',scene:'hotel',spots:['The desk bell has no button. It rings when the hallway lights dim.','Room numbers continue behind the wallpaper in small pencil marks.','The lift opens onto a view of the lobby from the other side of the building.']},
    {title:'Station 0',copy:'The timetable lists destinations by the names of people who have not arrived yet. Every platform is clean except for one dry footprint.',fragment:'A train passes without windows. Every seat is occupied by a folded coat.',scene:'station',spots:['The departure board lists one train as already returned.','A suitcase is ticking softly, but its hands are moving backwards.','The platform clock has a second hand that points between the numbers.']},
    {title:'The Indoor Sea',copy:'A tide moves beneath a painted ceiling. The beach is carpeted and always dry. A lifeguard watches the far wall as if it were a horizon.',fragment:'The waterline is visible on the ceiling, not the floor.',scene:'sea',spots:['A shell contains the sound of a room being emptied.','The lifeguard has been reading the same page for a very long time.','A wave arrives with the sound of distant applause.']},
    {title:'The House of Second Windows',copy:'Every room has one more window than its exterior could contain. The smallest room has the largest view.',fragment:'Behind the smallest window, someone is closing the same curtains.',scene:'house',spots:['A window looks into a room you have not entered yet.','The curtains move in a room with no air vents.','One pane reflects a different time of day.']},
    {title:'Museum of Unfinished Sounds',copy:'Objects are displayed with the noises they almost made. Visitors read the labels quietly, even when no one else is in the room.',fragment:'The little bell has no clapper. Visitors still lower their voices near it.',scene:'museum',spots:['A glass case contains the echo of a dropped spoon.','The visitor book records a sound instead of a signature.','A closed cabinet hums in the exact pitch of your name.']},
    {title:'The Warm Stairwell',copy:'The stairs go up and down but always return to the same landing. The handrail is warm enough to leave a print.',fragment:'There are fresh footprints on the ceiling. They are yours, but older.',scene:'stairs',spots:['The landing number is one higher each time you look away.','A door marked EXIT opens onto the underside of the same staircase.','The handrail is warm only where someone has not touched it.']},
    {title:'Municipal Cloud Room',copy:'A public office where weather is filed, stamped and occasionally misplaced. The windows show a different forecast on each floor.',fragment:'The clerk asks you to sign for the fog. The signature is already there.',scene:'cloud',spots:['A filing cabinet contains three afternoons and a missing Thursday.','A paperweight slowly fills with rain.','The clerk has a wet umbrella but no coat.']},
    {title:'The Orchard Under Glass',copy:'Fruit grows in sealed jars, each labelled with a date from next week. The leaves turn toward the darkest corner of the greenhouse.',fragment:'One jar contains a note describing the room you are standing in.',scene:'orchard',spots:['A pear has a small brass key where its stem should be.','The labels change when the greenhouse lights turn off.','A tree has grown a shadow that does not match its branches.']},
    {title:'The Cinema That Faces Away',copy:'A single-screen cinema where every seat faces the back wall. The projector runs anyway, and the audience knows when to laugh.',fragment:'The film ends with a shot of the room before anyone entered it.',scene:'cinema',spots:['The ticket stub carries tomorrow’s date.','A red aisle light follows the empty seat in row G.','The screen is warm, as if something has just passed through it.']},
    {title:'The Underwater Library',copy:'Books are shelved in dry glass tanks beneath a quiet blue ceiling. The librarian wears a diving watch but never checks it.',fragment:'One book has a tide chart for a sea that has not been discovered.',scene:'library',spots:['The catalogue lists a book you are currently reading.','A bubble rises from a book with no pages.','The bell above the desk makes no sound, but the water ripples.']},
    {title:'The Town With One Street',copy:'A small town built along one very long street. Every door opens onto the same square, although the buildings are kilometres apart.',fragment:'The postman delivers letters to houses that have not been built yet.',scene:'town',spots:['A bus stop has a timetable for the route you just walked.','Every shop window displays the same tiny blue cup.','A street sign points back to the same street.']},
    {title:'Room for the Missing Hour',copy:'A waiting room with twelve chairs and thirteen shadows. The wall clock is correct, but the minute hand has become very tired.',fragment:'The thirteenth shadow is sitting in a chair that is not there.',scene:'hour',spots:['A coat hangs on a hook and casts a shadow shaped like a person.','The clock loses one minute whenever the door opens.','A notice says your appointment finished before it began.']},
    {title:'The Last Floor of the Car Park',copy:'A concrete car park with painted bays, numbered columns and a roof that is always just above the clouds. Every vehicle is facing toward the exit.',fragment:'A ticket in the machine is printed with the time you left.',scene:'carpark',spots:['Column F is labelled with a small house number.','One car has its headlights on and no driver.','The exit sign points to a wall that has been repainted.']},
    {title:'The Market After Closing',copy:'A covered market with clean counters and shutters pulled down. The scales are still measuring something, though every tray is empty.',fragment:'The fishmonger has left a receipt for a fish that has not been caught.',scene:'market',spots:['A price label lists the weight of a memory.','A row of empty jars is labelled with different kinds of weather.','The last stall is open only in its reflection.']},
    {title:'The Lift Between Floors',copy:'An elevator with one brass button and a small display showing the floor number as a word. The doors open onto increasingly familiar rooms.',fragment:'The elevator has no cables. It still stops with a gentle jolt.',scene:'elevator',spots:['The mirror shows the corridor before the doors open.','A handrail is polished where no one can reach it.','The floor indicator briefly displays your house number.']},
    {title:'The Archive of Small Repairs',copy:'A municipal archive where every drawer contains a repair made to something that was never broken. The labels are precise and the room smells of warm paper.',fragment:'A file contains a diagram of a crack in the sky, repaired with ordinary tape.',scene:'archive',spots:['A box contains a replacement corner for a room.','A card records the successful repair of a missing sound.','One drawer is labelled “for later, when it arrives”.']},
    {title:'The Garden Under the Desk',copy:'A quiet office where a small garden has been growing beneath every desk. The plants do not need light, but they lean toward unfinished work.',fragment:'A seed packet is dated next Tuesday and marked “already planted”.',scene:'garden',spots:['A tiny tree has grown around a paperclip.','The soil is dry except directly beneath the keyboard.','A leaf has the shape of a building floor plan.']},
    {title:'The Swimming Pool With No Water',copy:'A public pool with tiled lanes, lane ropes and wet footprints. The water has been drained, but the room still sounds full.',fragment:'A lifeguard chair has a wet towel folded neatly across it.',scene:'pool',spots:['A lane marker moves gently although there is no current.','The deep end is darker than the ceiling.','A lost-property box contains a ripple.']},
    {title:'The Attic With a Ground Floor',copy:'A dusty attic reached by a short staircase. Its small window looks down onto the street, but the street is above the house.',fragment:'A floorboard creaks in the room below, although the house has only one floor.',scene:'attic',spots:['A cardboard box is labelled with the name of the room.','The rafters cast shadows that resemble a second staircase.','A little door opens onto the sound of the front gate.']},
    {title:'Observatory Reception',copy:'The observatory has a reception desk, a coat rack and a visitor log. The telescope is pointed at a blank patch of ceiling.',fragment:'The guest book contains a sketch of the room from above, including the person holding it.',scene:'observatory',spots:['A brass telescope cap is warm from the inside.','The star chart has a small square marked “you are here”.','The chair is angled toward a window that was bricked up.']},
    {title:'Laundry of Returned Clothes',copy:'A laundrette where every machine is in use, although no one has brought anything in. The labels on the baskets list people by the clothes they have not worn yet.',fragment:'A warm shirt in the lost-property drawer has your name stitched into the care label.',scene:'laundry',spots:['One machine is washing a single dry sleeve.','The folding table has a crease where a person might sit.','A receipt lists the weight of an absence.']},
    {title:'Aquarium for Landlocked Fish',copy:'The tanks are filled with pale air and illuminated from below. Fish move through them as if the water has simply become difficult to see.',fragment:'A visitor has left a damp footprint on the ceiling beside the largest tank.',scene:'aquarium',spots:['A fish pauses beside a label describing a mountain lake.','The filter hums in a rhythm that sounds like a doorbell.','A bubble rises from the empty gravel.']},
    {title:'Platform Beneath the Platform',copy:'The station has a second platform visible through the gaps in the first. Its train arrives first, but only the people upstairs can hear it.',fragment:'A yellow safety line continues down the stairwell and reappears on the ceiling.',scene:'subway',spots:['A timetable lists the same train under two different dates.','The bench is wet only where nobody has sat.','A tunnel lamp blinks in a pattern matching your steps.']},
    {title:'Greenhouse at Night',copy:'The greenhouse is locked from the inside. Every pane is covered in condensation except one, where a small handprint stays perfectly dry.',fragment:'A seed catalogue has a page for a plant that grows only in photographs.',scene:'greenhouse',spots:['A vine is wrapped around a thermometer without touching it.','The watering can is full of a sound like distant rain.','One leaf points toward a room beyond the glass.']},
    {title:'Hall of Soft Footsteps',copy:'A long public corridor with no visible floor covering. Footsteps arrive from the far end, pause behind you, and continue only after you turn around.',fragment:'The maintenance plan includes a note to keep the floor quiet after midnight.',scene:'hall',spots:['The wall clock has no hands, but its shadow moves.','A carpet runner ends one metre before the door.','The exit sign points toward the sound of your own shoes.']},
    {title:'Basement for Unused Rooms',copy:'A basement contains a stack of doors, each labelled with a room that has never been built. Behind one door, a radiator is already warm.',fragment:'The floor plan has a basement beneath the basement, drawn in a lighter pencil.',scene:'basement',spots:['A light switch has three positions and only two labels.','The door marked KITCHEN smells faintly of wet stone.','A spare key is tagged with the word “previous”.']},
    {title:'Ferry That Stays Ashore',copy:'A ferry terminal with a working departure board and a ship tied to the quay. Every ticket is valid, but the sea has been removed from the timetable.',fragment:'The ship’s wake is painted on the concrete and changes direction at night.',scene:'ferry',spots:['A gull is reflected in the waterless side of the boat.','The boarding ramp slopes upward at both ends.','A ticket has a return date but no departure date.']},
    {title:'Waiting Room for Weather',copy:'A small public room where people wait for rain, heat and fog to be called. The ticket machine prints a number and a description of the sky you remember.',fragment:'The next forecast is displayed as a coat hanging from a hook.',scene:'waiting',spots:['A radiator is cold but casts a heat shimmer.','The umbrella stand contains a single dry cloud-shaped mark.','The queue display calls a number that is not on any ticket.']},
  ];

function dreamMarkup(){
    return projectFrame(
      'Web experiment / 07',
      'Dream Index',
      'An atlas of places you almost remember. Follow small clues, collect fragments, and move through an atmosphere that changes with every location.',
      `<div class="dream-scene">
        <div class="dream-scene-art" data-dream-art aria-label="Illustrated dream location">
          <div class="dream-geometry geom-hotel"><span class="dream-sun"></span><span class="dream-ground"></span><span class="dream-arch"></span><span class="dream-window"></span><span class="dream-door"></span><span class="dream-dust d1"></span><span class="dream-dust d2"></span><span class="dream-building b1"></span><span class="dream-building b2"></span><span class="dream-stair"></span></div>
        </div>
        <div class="dream-scene-caption"><span data-dream-index>LOCATION 01 / 28</span><strong data-dream-title>The Hotel With No Lobby</strong></div>
      </div>
      <div class="tool-button-row dream-navigation">${action('← Previous place','dream-prev')}${action('Another place →','dream-next',true)}${action('Randomize place','dream-random')}${action('＋ Keep fragment','dream-keep')}${action('♫ Follow a sound','dream-sound')}</div>
      <div class="dream-audio-status" data-dream-audio-status aria-live="polite">ROOM TONE / OFF</div>
      <div class="dream-hotspots" data-dream-hotspots></div>
      <div class="dream-map" data-dream-map aria-label="Dream location map"></div>`,
      panel('Your dream record',`<p class="dream-copy" data-dream-copy></p><div class="dream-fragment" data-dream-fragment>Nothing has been recorded yet.</div><div class="tool-readout"><span>Fragments kept</span><strong data-dream-kept>0</strong></div><div class="tool-readout"><span>Places visited</span><strong data-dream-visited>0 / 28</strong></div>${range('Dream haze','dream-haze',0,100,38,'%')}${range('Scene drift','dream-drift',0,100,48,'%')}${range('Memory grain','dream-grain',0,100,32,'%')}<div class="tool-button-row">${action('Export dream notes','dream-export')}${action('Clear notebook','dream-clear')}</div><p class="tool-small">Collected fragments stay in this browser. Sound is generated locally and only plays when requested. Export your notebook before clearing it.</p>`),
      'A fictional index. All locations, artifacts and fragments are original to this experience. Use the atmosphere controls to adjust haze, drift and texture; room tone follows the site-wide master volume.'
    );
  }

function bindDream(root){
    let idx=0, kept=[], visited=new Set(), currentFragment='';
    const storageKey='curioid-dream-index-fragments-v3';
    const art=$('[data-dream-art]',root), captionIndex=$('[data-dream-index]',root), captionTitle=$('[data-dream-title]',root);
    const copy=$('[data-dream-copy]',root), fragment=$('[data-dream-fragment]',root), hotspots=$('[data-dream-hotspots]',root), map=$('[data-dream-map]',root);
    const soundButton=$('[data-action="dream-sound"]',root), soundStatus=$('[data-dream-audio-status]',root), haze=$('[data-range="dream-haze"]',root), drift=$('[data-range="dream-drift"]',root), grain=$('[data-range="dream-grain"]',root);
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');
      if(Array.isArray(saved.kept)) kept=saved.kept.filter(x=>Array.isArray(x)&&x.length>=3).slice(-80);
      if(Array.isArray(saved.visited)) visited=new Set(saved.visited.filter(n=>Number.isInteger(n)&&n>=0&&n<dreams.length));
      if(Number.isInteger(saved.lastIndex)) idx=clamp(saved.lastIndex,0,dreams.length-1);
    } catch(_) {}
    // Migrate fragments from the previous version without losing a visitor's notebook.
    if(!kept.length){
      try { const old=JSON.parse(localStorage.getItem('curioid-dream-index-fragments-v2')||'{}'); if(Array.isArray(old.kept)) kept=old.kept.filter(x=>Array.isArray(x)&&x.length>=3).slice(-80); if(Array.isArray(old.visited)) old.visited.forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<dreams.length)visited.add(n);}); } catch(_) {}
    }
    const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({kept,visited:[...visited],lastIndex:idx}));return true;}catch(_){return false;}};
    function updateRecord(){
      $('[data-dream-kept]',root).textContent=String(kept.length);
      $('[data-dream-visited]',root).textContent=`${visited.size} / ${dreams.length}`;
    }
    function renderMap(){
      const stops=document.createDocumentFragment();
      dreams.forEach((dream,index)=>{const button=document.createElement('button');button.type='button';button.className='dream-map-stop';button.dataset.dreamGo=String(index);button.classList.toggle('active',index===idx);button.classList.toggle('visited',visited.has(index));button.setAttribute('aria-label',`Visit location ${index+1}: ${String(dream.title||'').slice(0,120)}`);button.setAttribute('aria-current',index===idx?'location':'false');button.title=String(dream.title||'').slice(0,120);const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');const marker=document.createElement('i');marker.setAttribute('aria-hidden','true');button.append(number,marker);stops.append(button);});
      map.replaceChildren(stops);
    }
    function applyDreamSettings(){
      const h=Number(haze?.value||38)/100, d=Number(drift?.value||48)/100, g=Number(grain?.value||32)/100;
      art.style.setProperty('--dream-haze',String(h));art.style.setProperty('--dream-drift-duration',`${14-d*10}s`);art.style.setProperty('--dream-grain-opacity',String(.025+g*.3));
      art.style.setProperty('--dream-dust-speed',`${18-d*13}s`);
    }
    function render(){
      const d=dreams[idx]; if(!d)return;
      visited.add(idx); currentFragment=d.fragment;
      captionIndex.textContent=`LOCATION ${String(idx+1).padStart(2,'0')} / ${String(dreams.length).padStart(2,'0')}`;
      captionTitle.textContent=d.title;
      copy.textContent=d.copy;
      fragment.textContent=d.fragment;
      const sceneClass=dreams.some(item=>item.scene===d.scene)?d.scene:'hotel';
      const geometry=document.createElement('div');geometry.className=`dream-geometry geom-${sceneClass}`;
      [['dream-sun'],['dream-ground'],['dream-arch'],['dream-window'],['dream-door'],['dream-dust','d1'],['dream-dust','d2'],['dream-building','b1'],['dream-building','b2'],['dream-stair'],['dream-reflection'],['dream-figure'],['dream-geometry-grain']].forEach(classes=>{const shape=document.createElement('span');shape.classList.add(...classes);shape.setAttribute('aria-hidden','true');geometry.append(shape);});
      art.replaceChildren(geometry);
      art.dataset.scene=sceneClass;
      const hotspotButtons=document.createDocumentFragment();
      const hotspotLabels=['Inspect the near detail','Inspect the middle distance','Inspect the far detail'];
      d.spots.forEach((spot,index)=>{const button=document.createElement('button');button.type='button';button.className='dream-hotspot';button.dataset.hot=String(index);button.setAttribute('aria-pressed','false');const label=document.createElement('span');label.className='dream-hotspot-label';label.textContent=hotspotLabels[index]||`Inspect detail ${index+1}`;const number=document.createElement('strong');number.textContent=String(index+1).padStart(2,'0');button.append(label,number);hotspotButtons.append(button);});
      hotspots.replaceChildren(hotspotButtons);
      renderMap(); updateRecord(); persist();
    }
    function move(n){idx=(idx+n+dreams.length)%dreams.length;render();}
    function surprise(){if(dreams.length<2)return;let next=idx;while(next===idx)next=Math.floor(Math.random()*dreams.length);idx=next;render();}

    // One delegated handler survives every redraw. The caption is intentionally
    // outside the replaceable art layer, so navigation never removes its targets.
    map.addEventListener('click',/** @param {CurioidDOMEvent} e */ e=>{const b=e.target.closest('[data-dream-go]');if(!b||!map.contains(b))return;idx=clamp(Number(b.dataset.dreamGo)||0,0,dreams.length-1);render();});
    hotspots.addEventListener('click',/** @param {CurioidDOMEvent} e */ e=>{
      const b=e.target.closest('[data-hot]'); if(!b||!hotspots.contains(b))return;
      const i=Number(b.dataset.hot),d=dreams[idx]; if(!d||!d.spots[i])return;
      currentFragment=d.spots[i]; fragment.textContent=currentFragment;
      $$('[data-hot]',hotspots).forEach((item,j)=>{item.classList.toggle('selected',j===i);item.setAttribute('aria-pressed',String(j===i));});
      art.classList.remove('inspect-1','inspect-2','inspect-3');art.classList.add(`inspect-${i+1}`);
      const geom=$('.dream-geometry',art); if(geom)geom.style.setProperty('--inspection',String(i+1));
    });
    $('[data-action="dream-prev"]',root).addEventListener('click',()=>move(-1));
    $('[data-action="dream-next"]',root).addEventListener('click',()=>move(1));
    $('[data-action="dream-random"]',root).addEventListener('click',surprise);
    $('[data-action="dream-keep"]',root).addEventListener('click',()=>{
      const d=dreams[idx];
      if(kept.some(x=>x[0]===d.title&&x[2]===currentFragment)){toast(null,'That exact fragment is already in your notebook.');return;}
      kept.push([d.title,d.copy,currentFragment]);kept=kept.slice(-80);const ok=persist();updateRecord();toast(null,ok?'Fragment saved to your notebook.':'Saved for this visit; browser storage is unavailable.');
    });
    $('[data-action="dream-export"]',root).addEventListener('click',()=>{
      const text=kept.length?kept.map((d,i)=>`${String(i+1).padStart(2,'0')} · ${d[0]}\n${d[1]}\n\n${d[2]}`).join('\n\n'):'No fragments collected yet.';
      downloadBlob(new Blob([`CURIOID / DREAM INDEX NOTEBOOK\n${new Date().toLocaleDateString()}\n\n${text}`],{type:'text/plain;charset=utf-8'}),'dream-index-notes.txt');
    });
    $('[data-action="dream-clear"]',root).addEventListener('click',()=>{
      if(!kept.length){toast(null,'Your notebook is already empty.');return;}
      if(!confirm('Clear the saved dream fragments from this browser?'))return;
      kept=[];persist();updateRecord();toast(null,'Notebook cleared. The atlas remains unchanged.');
    });

    // A real, audible ambience: several mid-range partials, slow modulation and
    // filtered air. The old 48–96 Hz, 1.8% sine was practically inaudible on
    // ordinary laptop speakers. Audio is created only in this click handler.
    let dreamAudio=null, dreamMaster=null, dreamNodes=[], dreamStopTimer=0, disposed=false;
    function setAudioStatus(text){soundStatus.textContent=text;}
    async function stopDreamTone(){
      if(dreamStopTimer){clearTimeout(dreamStopTimer);dreamStopTimer=0;}
      const ctx=dreamAudio,master=dreamMaster,nodes=dreamNodes.slice();
      dreamAudio=null;dreamMaster=null;dreamNodes=[];
      soundButton.textContent='♫ Follow a sound';soundButton.setAttribute('aria-pressed','false');setAudioStatus('ROOM TONE / OFF');
      if(!ctx)return;
      try{
        const now=ctx.currentTime;
        if(master){master.gain.cancelScheduledValues(now);master.gain.setValueAtTime(master.gain.value,now);master.gain.linearRampToValueAtTime(0,now+.22);}
        nodes.forEach(node=>{try{if(typeof node.stop==='function')node.stop(now+.25);}catch(_){}});
        dreamStopTimer=setTimeout(()=>{ctx.close().catch(()=>{});dreamStopTimer=0;},320);
      }catch(_){try{await ctx.close();}catch(__){}}
    }
    async function toggleDreamTone(){
      if(dreamAudio){await stopDreamTone();return;}
      const AC=window.AudioContext||/** @type {Window & {webkitAudioContext?: typeof AudioContext}} */ (window).webkitAudioContext;
      if(!AC){setAudioStatus('AUDIO UNAVAILABLE IN THIS BROWSER');toast(null,'This browser does not support Web Audio.');return;}
      soundButton.disabled=true;setAudioStatus('ROOM TONE / STARTING');
      try{
        const ctx=new AC({latencyHint:'interactive'});dreamAudio=ctx;dreamNodes=[];
        const master=ctx.createGain();dreamMaster=master;master.gain.value=.0001;
        const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-22;compressor.knee.value=18;compressor.ratio.value=3;compressor.attack.value=.02;compressor.release.value=.35;
        master.connect(compressor);compressor.connect(ctx.destination);registerAudioMaster(compressor);
        const room=dreams[idx],rootHz=135+(idx%7)*13;
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1250;filter.Q.value=.6;filter.connect(master);
        const partials=[1,1.498,2.003,2.97];
        partials.forEach((ratio,i)=>{
          const osc=ctx.createOscillator(),gain=ctx.createGain();
          osc.type=['sine','triangle','sine','triangle'][i];osc.frequency.value=rootHz*ratio;osc.detune.value=[-4,3,-7,5][i];
          gain.gain.value=[.095,.05,.025,.012][i];osc.connect(gain);gain.connect(filter);osc.start();dreamNodes.push(osc);
        });
        // Gentle spectral drift keeps the ambience alive without a harsh loop.
        const lfo=ctx.createOscillator(),lfoGain=ctx.createGain();lfo.type='sine';lfo.frequency.value=.075;lfoGain.gain.value=430;lfo.connect(lfoGain);lfoGain.connect(filter.frequency);lfo.start();dreamNodes.push(lfo);
        // Soft filtered air, kept below the tonal bed.
        const noiseBuffer=ctx.createBuffer(1,Math.max(1,Math.floor(ctx.sampleRate*2)),ctx.sampleRate),data=noiseBuffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.24;
        const noise=ctx.createBufferSource(),noiseFilter=ctx.createBiquadFilter(),noiseGain=ctx.createGain();noise.buffer=noiseBuffer;noise.loop=true;noiseFilter.type='bandpass';noiseFilter.frequency.value=510+(idx%5)*85;noiseFilter.Q.value=.45;noiseGain.gain.value=.018;noise.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(master);noise.start();dreamNodes.push(noise);
        const resumePromise=ctx.state==='suspended'?ctx.resume():Promise.resolve();
        const now=ctx.currentTime;master.gain.setValueAtTime(.0001,now);master.gain.linearRampToValueAtTime(.42,now+.45);
        await resumePromise;
        if(disposed||dreamAudio!==ctx){try{await ctx.close();}catch(_){}return;}
        if(ctx.state!=='running')throw new Error('The browser kept audio suspended.');
        soundButton.textContent='■ Stop room tone';soundButton.setAttribute('aria-pressed','true');setAudioStatus(`ROOM TONE / PLAYING · ${room.title.toUpperCase()} · SITE VOLUME`);
        toast(null,'Room tone is playing. Use the site-wide master volume or stop button to silence it.');
      }catch(error){
        console.warn('Dream Index audio could not start:',error);
        if(dreamAudio)try{await dreamAudio.close();}catch(_){}
        dreamAudio=null;dreamMaster=null;dreamNodes=[];soundButton.textContent='♫ Follow a sound';soundButton.setAttribute('aria-pressed','false');setAudioStatus('ROOM TONE / UNAVAILABLE');toast(null,'Audio could not start. Check the browser tab volume and try again.');
      }finally{soundButton.disabled=false;}
    }
    soundButton.addEventListener('click',()=>{void toggleDreamTone();});
    [haze,drift,grain].forEach(el=>el.addEventListener('input',applyDreamSettings));
    applyDreamSettings();
    render();
    return()=>{disposed=true;void stopDreamTone();};
  }

function ruleGardenMarkup(){return projectFrame('Web experiment / 08','Rule Garden','A living grid governed by a few local rules. Change the rule, disturb the cells and watch patterns appear, die out or refuse to settle.',`<div class="tool-canvas-wrap"><canvas class="tool-canvas rule-garden-canvas" aria-label="Cellular automaton grid"></canvas><div class="canvas-overlay"><span>CLICK TO SEED CELLS</span><span data-rule-generation>GENERATION 0000</span></div></div><div class="tool-button-row">${action('Ⅱ Pause','rule-run',true)}${action('Step once','rule-step')}${action('Randomize','rule-random')}${action('Clear grid','rule-clear')}${action('Save PNG to Vault','rule-export')}</div>`,panel('Local rules',select('Rule family','rule-family',[['life','Conway / Life'],['brain','Excitable matter'],['maze','Growing maze'],['crystal','Crystal growth'],['strange','Unstable field']])+range('Population','rule-population',5,85,34,'%')+range('Speed','rule-speed',1,24,8,' steps/s')+range('Mutation','rule-mutation',0,100,24,'%')+select('Ink','rule-ink',[['acid','Signal green'],['mineral','Mineral'],['heat','Heat map'],['mono','Monochrome']])),'The grid runs entirely in your browser. Try painting a few cells into the field while it is running.');}

function bindRuleGarden(root){
    const canvas=$('.rule-garden-canvas',root),cols=72,rows=42;let cells=new Uint8Array(cols*rows),next=new Uint8Array(cols*rows),generation=0,running=true,acc=0,renderer=null;
    const family=()=> $('[data-select="rule-family"]',root).value;
    const ix=(x,y)=>y*cols+x;
    function randomize(){const density=+$('[data-range="rule-population"]',root).value/100;for(let i=0;i<cells.length;i++)cells[i]=Math.random()<density?1:0;generation=0;updateLabel();renderer?.redraw();}
    function clear(){cells.fill(0);generation=0;updateLabel();renderer?.redraw();}
    function step(){const mode=family(),mutation=+$('[data-range="rule-mutation"]',root).value/100;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let n=0,active=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=(x+dx+cols)%cols,yy=(y+dy+rows)%rows,v=cells[ix(xx,yy)];if(v===1)n++;if(v===2)active++;}const i=ix(x,y),v=cells[i];let out=0;if(mode==='life')out=v===1?(n===2||n===3?1:0):(n===3?1:0);else if(mode==='brain')out=v===1?2:v===2?0:(n===2?1:0);else if(mode==='maze')out=v===1?(n>=1&&n<=5?1:0):(n===3||n===4||n===5?1:0);else if(mode==='crystal')out=v===1?(n>=1&&n<=4?1:0):(n===2||n===3||n===6?1:0);else out=v===1?(n===2||n===3||n===4?1:0):(n===2||n===3||n===5?1:0);if(mutation&&Math.random()<mutation*.006)out=out?0:1;next[i]=out;}const tmp=cells;cells=next;next=tmp;generation++;updateLabel();}
    function updateLabel(){const el=$('[data-rule-generation]',root);if(el)el.textContent='GENERATION '+String(generation).padStart(4,'0');}
    function paint(ctx,w,h,t,dt,initial){if(running&&!initial){acc+=dt;const stepEvery=1/(+$('[data-range="rule-speed"]',root).value);let guard=0;while(acc>=stepEvery&&guard++<5){step();acc-=stepEvery;}}ctx.fillStyle='#10131a';ctx.fillRect(0,0,w,h);const cw=w/cols,ch=h/rows,mode=family(),ink=$('[data-select="rule-ink"]',root).value;for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const v=cells[ix(x,y)];if(!v)continue;let color;if(ink==='mono')color=v===1?'#e9e6df':'#777481';else if(ink==='heat')color=v===1?`hsl(${115-generation%100},88%,${48+((x+y)%5)*5}%)`:'#ff9cba';else if(ink==='mineral')color=v===1?['#d6ff69','#baa7ff','#85e6da','#f0d7a8'][(x*7+y*3+generation)%4]:'#ff9cba';else color=v===1?'#d6ff69':mode==='brain'?'#baa7ff':'#85e6da';ctx.globalAlpha=v===1?.9:.55;ctx.fillStyle=color;ctx.fillRect(x*cw+1,y*ch+1,Math.max(1,cw-2),Math.max(1,ch-2));}ctx.globalAlpha=1;ctx.strokeStyle='rgba(255,255,255,.035)';ctx.lineWidth=1;for(let x=0;x<=cols;x+=6){ctx.beginPath();ctx.moveTo(x*cw,0);ctx.lineTo(x*cw,h);ctx.stroke();}}
    renderer=fitCanvas(canvas,paint,true);function setRun(on){running=on;const button=$('[data-action="rule-run"]',root);if(button)button.textContent=on?'Ⅱ Pause':'▶ Run';}
    $('[data-action="rule-run"]',root).addEventListener('click',()=>setRun(!running));$('[data-action="rule-step"]',root).addEventListener('click',()=>{setRun(false);step();renderer.redraw();});$('[data-action="rule-random"]',root).addEventListener('click',randomize);$('[data-action="rule-clear"]',root).addEventListener('click',()=>{setRun(false);clear();});$('[data-action="rule-export"]',root).addEventListener('click',()=>saveCanvas(canvas,'curioid-rule-garden.png'));['rule-family','rule-ink'].forEach(k=>$(`[data-select="${k}"]`,root).addEventListener('change',()=>renderer.redraw()));['rule-population','rule-mutation'].forEach(k=>$(`[data-range="${k}"]`,root).addEventListener('input',()=>{if(k==='rule-population')randomize();else renderer.redraw();}));
    let painting=false;function paintCell(e){const r=canvas.getBoundingClientRect(),x=clamp(Math.floor((e.clientX-r.left)/r.width*cols),0,cols-1),y=clamp(Math.floor((e.clientY-r.top)/r.height*rows),0,rows-1);cells[ix(x,y)]=1;renderer.redraw();}canvas.addEventListener('pointerdown',/** @param {CurioidDOMEvent} e */ e=>{painting=true;canvas.setPointerCapture(e.pointerId);paintCell(e);});canvas.addEventListener('pointermove',/** @param {CurioidDOMEvent} e */ e=>{if(painting&&e.buttons)paintCell(e);});canvas.addEventListener('pointerup',()=>painting=false);canvas.addEventListener('pointercancel',()=>painting=false);randomize();setRun(true);
    return()=>{running=false;renderer.stop();};
  }

function pendulumChoirMarkup(){return projectFrame('Web experiment / 09','Pendulum Choir','A row of pendulums starts together, then quietly loses agreement. Change the coupling and listen to the shape of the movement with your eyes.',`<div class="tool-canvas-wrap"><canvas class="tool-canvas pendulum-choir-canvas" aria-label="Animated pendulum field"></canvas><div class="canvas-overlay"><span>PHASE / FIELD STUDY</span><span data-pendulum-status>IN AGREEMENT</span></div></div><div class="tool-button-row">${action('Pause field','pendulum-pause',true)}${action('Reset phase','pendulum-reset')}${action('Export trace','pendulum-export')}</div>`,panel('Oscillation',range('Pendulum count','pendulum-count',5,36,19)+range('Tempo','pendulum-tempo',10,100,48,'%')+range('Divergence','pendulum-drift',0,100,64,'%')+range('Coupling','pendulum-coupling',0,100,17,'%')+range('Trail length','pendulum-trail',0,100,62,'%')+select('Trace color','pendulum-color',[['mineral','Mineral'],['signal','Signal'],['violet','Violet dusk'],['mono','Monochrome']])),'The motion is deterministic for each reset but small differences accumulate. Watch the whole row rather than one pendulum.');}

function bindPendulumChoir(root){const canvas=$('.pendulum-choir-canvas',root);let paused=false,elapsedBeforePause=0,startTime=performance.now()/1000,renderer;const trails=Array.from({length:40},()=>[]);function paint(ctx,w,h,t,dt,initial){ctx.fillStyle='#10131a';ctx.fillRect(0,0,w,h);const count=+$('[data-range="pendulum-count"]',root).value,speed=+$('[data-range="pendulum-tempo"]',root).value/100,drift=+$('[data-range="pendulum-drift"]',root).value/100,coupling=+$('[data-range="pendulum-coupling"]',root).value/100,trail=+$('[data-range="pendulum-trail"]',root).value/100,col=$('[data-select="pendulum-color"]',root).value,colors=col==='signal'?['#d6ff69','#ff9cba','#65d4ff']:col==='violet'?['#baa7ff','#9f8dc7','#e6b8d7']:col==='mono'?['#e8e6df']:['#d6ff69','#baa7ff','#85e6da','#f0d7a8'];const elapsed=elapsedBeforePause+(paused?0:t-startTime),spacing=w/(count+1),length=Math.min(h*.67,180);ctx.strokeStyle='rgba(255,255,255,.1)';ctx.beginPath();ctx.moveTo(0,30);ctx.lineTo(w,30);ctx.stroke();for(let i=0;i<count;i++){const base=i*.29,phaseDrift=Math.sin(i*1.37)*drift*1.4,angle=Math.sin(elapsed*(.55+speed*2.8)+base+phaseDrift+Math.sin(elapsed*.21+i*.17)*coupling)*(.22+drift*.58),x=(i+1)*spacing,y=42,bx=x+Math.sin(angle)*length,by=y+Math.cos(angle)*length;const list=trails[i];if(!paused&&trail>0){list.push([bx,by]);if(list.length>Math.round(8+trail*1.5))list.shift();}else if(!trail)list.length=0;if(list.length>1){ctx.beginPath();list.forEach((p,j)=>j?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle=colors[i%colors.length]+'88';ctx.lineWidth=1.4;ctx.stroke();}ctx.strokeStyle='#8e8a9a';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(bx,by);ctx.stroke();ctx.fillStyle='#d6ff69';ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();ctx.fillStyle=colors[i%colors.length];ctx.beginPath();ctx.arc(bx,by,Math.max(3,5+(i%4)),0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff88';ctx.stroke();}const status=$('[data-pendulum-status]',root);if(status)status.textContent=paused?'FIELD HELD':drift>0.7?'PHASES DISAGREE':'IN AGREEMENT';}
    renderer=fitCanvas(canvas,paint,true);$('[data-action="pendulum-pause"]',root).addEventListener('click',e=>{const now=performance.now()/1000;if(!paused)elapsedBeforePause+=now-startTime;else startTime=now;paused=!paused;e.currentTarget.textContent=paused?'Resume field':'Pause field';renderer.redraw();});$('[data-action="pendulum-reset"]',root).addEventListener('click',()=>{elapsedBeforePause=0;startTime=performance.now()/1000;trails.forEach(a=>a.length=0);renderer.redraw();});$('[data-action="pendulum-export"]',root).addEventListener('click',()=>saveCanvas(canvas,'curioid-pendulum-choir.png'));['pendulum-count','pendulum-tempo','pendulum-drift','pendulum-coupling','pendulum-trail'].forEach(k=>$(`[data-range="${k}"]`,root).addEventListener('input',()=>renderer.redraw()));$('[data-select="pendulum-color"]',root).addEventListener('change',()=>renderer.redraw());return()=>renderer.stop();}

const faceMachineMarkup = () => "<div class=\"face-machine\"><div class=\"face-shared-utility\"><span>SHARED PROJECT SYSTEM</span><button type=\"button\" class=\"project-utility-button\" data-face-global-motion aria-pressed=\"true\">Motion ON</button><button type=\"button\" class=\"project-utility-button\" data-face-global-surprise>Surprise me</button></div>\n    <div class=\"experiment-grid\" aria-label=\"Face Machine experiment\">\n      <section class=\"surface output-surface\">\n        <div class=\"surface-header\"><h3 class=\"surface-title\"><span class=\"surface-dot\"></span> Specimen output</h3><span class=\"surface-meta\" id=\"stageCounter\">SUBJECT 001</span></div>\n        <div class=\"stage-wrap\">\n          <div class=\"stage\" id=\"faceStage\" aria-label=\"Generated uncanny face\">\n            <div class=\"stage-orbit\" aria-hidden=\"true\"></div>\n            <span class=\"stage-corner tl\">Observation / 001</span><span class=\"stage-corner tr\">Facial anomaly</span>\n            <span class=\"stage-corner bl\">Look directly at it</span><span class=\"stage-corner br\" id=\"stageSeed\">SEED 482913</span>\n            <svg class=\"face-art\" id=\"faceArt\" viewBox=\"0 0 600 600\" role=\"img\" aria-label=\"A strange generated face\" xmlns=\"http://www.w3.org/2000/svg\"></svg>\n          </div>\n          <div class=\"stage-caption\"><span><strong id=\"specimenName\">The thing behind the expression</strong> · <span id=\"specimenMood\">Suspicious</span></span><code class=\"stage-code\" id=\"specimenCode\">CR-0001</code></div>\n          <div class=\"stage-tags\"><span class=\"tag\" id=\"tagEyes\">EYES / 03</span><span class=\"tag\" id=\"tagAnatomy\">ANATOMY / UNKNOWN</span><span class=\"tag\" id=\"tagStructure\">FORM / ORGANIC</span></div>\n        </div>\n      </section>\n\n      <section class=\"surface control-panel\">\n        <div class=\"surface-header\"><h3 class=\"surface-title\"><span class=\"surface-dot\"></span> Machine controls</h3><span class=\"surface-meta\">FACE MACHINE / 001</span></div>\n        <div class=\"control-intro\"><p class=\"control-intro-kicker\">Experiment no. 001</p><h3>Face Machine</h3><p>The machine is trying to reconstruct a face from incomplete instructions. Push the anatomy, distort the familiar, and keep just enough human detail to make it recognizable.</p></div>\n        <div class=\"control-body\">\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"moodSelect\">Expression</label><span class=\"control-value\">01 / MOOD</span></div><div class=\"select-wrap\"><select id=\"moodSelect\"><option value=\"random\">Unpredictable</option><option value=\"dissociated\">Dissociated</option><option value=\"predatory\">Predatory</option><option value=\"terrified\">Terrified</option><option value=\"anguished\">Anguished</option><option value=\"calm\">Unnaturally calm</option><option value=\"blank\">Expressionless</option></select></div></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"anatomySelect\">Origin / anatomy</label><span class=\"control-value\">02 / TYPE</span></div><div class=\"select-wrap\"><select id=\"anatomySelect\"><option value=\"random\">Unknown / surprise</option><option value=\"abyssal\">Abyssal organism</option><option value=\"insectoid\">Insectoid</option><option value=\"porcelain\">Living porcelain</option><option value=\"biomech\">Bio-mechanical</option><option value=\"cosmic\">Cosmic anomaly</option><option value=\"almost-human\">Almost human</option><option value=\"flesh-mutation\">Flesh mutation</option><option value=\"mineral\">Mineral / bone</option></select></div></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"weirdnessRange\">Uncanniness</label><output class=\"control-value\" id=\"weirdnessValue\" for=\"weirdnessRange\">95%</output></div><input id=\"weirdnessRange\" type=\"range\" min=\"0\" max=\"100\" value=\"100\"><div class=\"range-hints\"><span>Unsettling</span><span>Deeply wrong</span></div></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"eyeLayoutSelect\">Eye arrangement</label><span class=\"control-value\">04 / GAZE</span></div><div class=\"select-wrap\"><select id=\"eyeLayoutSelect\"><option value=\"random\">Unpredictable</option><option value=\"uneven\">Uneven pair</option><option value=\"clustered\">Clustered</option><option value=\"vertical\">Vertical additions</option><option value=\"many\">Multiple eyes</option><option value=\"embedded\">Eyes beneath the skin</option></select></div></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"mouthSelect\">Mouth mutation</label><span class=\"control-value\">05 / VOICE</span></div><div class=\"select-wrap\"><select id=\"mouthSelect\"><option value=\"random\">Unpredictable</option><option value=\"stretched\">Stretched grin</option><option value=\"teeth\">Crowded teeth</option><option value=\"vertical\">Vertical opening</option><option value=\"sealed\">Sealed seam</option><option value=\"double\">Second mouth</option></select></div></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><label for=\"eyeBehaviorSelect\">Eye behaviour</label><span class=\"control-value\">06 / PRESENCE</span></div><div class=\"select-wrap\"><select id=\"eyeBehaviorSelect\"><option value=\"natural\">Unsettlingly natural</option><option value=\"restless\">Restless / searching</option><option value=\"staring\">Long, deliberate stares</option><option value=\"rare\">Rare, deliberate blinks</option></select></div><small class=\"tool-help\">Each eye can blink and drift independently. Choose how it behaves.</small></div>\n          <div class=\"control-field\"><div class=\"control-field-top\"><span class=\"control-label\">Face structure</span><span class=\"control-value\">07 / FORM</span></div><div class=\"shape-options\" role=\"group\" aria-label=\"Choose face structure\"><button class=\"shape-option\" type=\"button\" data-structure=\"soft\" aria-pressed=\"false\">Soft</button><button class=\"shape-option\" type=\"button\" data-structure=\"mixed\" aria-pressed=\"true\">Mixed</button><button class=\"shape-option\" type=\"button\" data-structure=\"angular\" aria-pressed=\"false\">Angular</button></div></div>\n          <div class=\"button-stack\"><button class=\"action-button primary\" id=\"generateBtn\" type=\"button\">↻ &nbsp; Generate a new face</button><button class=\"action-button\" id=\"faceSurpriseBtn\" type=\"button\" style=\"display:none\" aria-hidden=\"true\" tabindex=\"-1\">Surprise me</button><button class=\"action-button\" id=\"faceMotionBtn\" type=\"button\" aria-pressed=\"false\">Ⅱ &nbsp; Pause movement</button><button class=\"action-button\" id=\"saveBtn\" type=\"button\">＋ &nbsp; Save specimen</button><button class=\"action-button\" id=\"downloadBtn\" type=\"button\">↓ &nbsp; Save PNG to Vault</button><button class=\"action-button\" id=\"faceResetBtn\" type=\"button\">↺ &nbsp; Reset settings</button></div>\n          <p class=\"control-note\">Everything is generated locally in your browser. Nothing is uploaded. Saved specimens stay on this device.</p>\n        </div>\n      </section>\n    </div>\n\n    <section class=\"specimen-drawer\" aria-label=\"Saved face specimens\"><div class=\"drawer-head\"><div><h3 class=\"drawer-title\">The specimen drawer</h3><p class=\"drawer-copy\">Keep the specimens you would rather not meet.</p></div><div style=\"display:flex;align-items:center;gap:9px\"><span class=\"drawer-count\" id=\"archiveCount\">0 / 8</span><button class=\"drawer-clear\" id=\"clearArchiveBtn\" type=\"button\">CLEAR</button></div></div><div class=\"specimen-grid\" id=\"specimenGrid\"><div class=\"drawer-empty\"><strong>The drawer is empty.</strong> Save a specimen to keep it here.</div></div></section>\n</div>";

function bindFaceMachine(mount, api = {}) {
    const notify = message => { if (api.toast) api.toast(message); else document.dispatchEvent(new CustomEvent('curioid:toast', {detail:{message}})); };
    const STORAGE_KEY = 'curioid-face-specimens-v2';
    const FACE_SETTINGS_KEY = 'curioid-face-settings-v1';
    const MAX_SAVED = 8;
    let subjectNumber = 1;
    let current = { seed: randomSeed(), mood: 'random', weirdness: 100, structure: 'mixed', anatomy: 'random', eyeStyle: 'random', mouthStyle: 'random', number: 1 };
    function randomSeed() { return Math.floor(Math.random() * 900000000) + 100000000; }
    function seededRandom(seed) { let value = seed >>> 0; return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const pick = (rng, list) => list[Math.floor(rng() * list.length)];
    const int = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min;
    const chance = (rng, probability) => rng() < probability;
    const n = value => Number(value.toFixed(1));
const PALETTES = [
        { skin: "#6b6861", shade: "#34303a", light: "#a69b8b", ink: "#0d0b10", iris: "#e0b65c", accent: "#708e80", deep: "#1b171f" },
        { skin: "#70575d", shade: "#3b2934", light: "#ac8585", ink: "#0c080e", iris: "#c4d36c", accent: "#86546a", deep: "#1d111a" },
        { skin: "#58645f", shade: "#2d3b3b", light: "#a0b0a2", ink: "#091011", iris: "#dfb66a", accent: "#688f8a", deep: "#182120" },
        { skin: "#786348", shade: "#49392f", light: "#b49b76", ink: "#110d0a", iris: "#b3c47d", accent: "#a56e55", deep: "#241b16" },
        { skin: "#555c6d", shade: "#303442", light: "#9ba3a7", ink: "#0a0b13", iris: "#e2b765", accent: "#7f93aa", deep: "#191d29" },
        { skin: "#754d5a", shade: "#422938", light: "#ad7d83", ink: "#10070e", iris: "#cadb85", accent: "#965d77", deep: "#21121e" },
        { skin: "#626b4d", shade: "#39432f", light: "#a3a782", ink: "#0c1109", iris: "#d3a36b", accent: "#84935e", deep: "#1b2416" },
        { skin: "#765b4c", shade: "#44302d", light: "#af8970", ink: "#120a09", iris: "#9ed0c2", accent: "#a57661", deep: "#241714" },
        { skin: "#5e5866", shade: "#34303f", light: "#a19aa1", ink: "#0c0a11", iris: "#d2ad6c", accent: "#92758e", deep: "#1d1926" },
        { skin: "#827966", shade: "#51483f", light: "#b9aa91", ink: "#17120f", iris: "#a6c99e", accent: "#978b82", deep: "#29221f" }
      ];
      const MOODS = ["dissociated", "predatory", "terrified", "anguished", "calm", "blank"];
      const ANATOMIES = ["abyssal", "insectoid", "porcelain", "biomech", "cosmic", "almost-human", "flesh-mutation", "mineral"];
      const FACE_ENUMS = {
        mood: new Set(["random", ...MOODS]),
        anatomy: new Set(["random", ...ANATOMIES]),
        eyeStyle: new Set(["random", "uneven", "clustered", "vertical", "many", "embedded"]),
        mouthStyle: new Set(["random", "stretched", "teeth", "vertical", "sealed", "double"]),
        structure: new Set(["soft", "mixed", "angular"])
      };
      const FACE_DEFAULTS = { mood:"random", anatomy:"random", eyeStyle:"random", mouthStyle:"random", structure:"mixed", weirdness:100, number:1 };
      function boundedFaceNumber(value, min, max, fallback) {
        const parsed = typeof value === "number" ? value : (typeof value === "string" && /^\d{1,12}$/.test(value) ? Number(value) : NaN);
        return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
      }
      function sanitizeFaceConfig(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const seed = boundedFaceNumber(raw.seed, 1, 0xffffffff, null);
        if (seed === null) return null;
        const finiteWeirdness = typeof raw.weirdness === "number" || (typeof raw.weirdness === "string" && /^\d{1,3}(?:\.\d+)?$/.test(raw.weirdness)) ? Number(raw.weirdness) : NaN;
        const enumValue = (key) => FACE_ENUMS[key].has(raw[key]) ? raw[key] : FACE_DEFAULTS[key];
        return {
          seed,
          mood: enumValue("mood"),
          anatomy: enumValue("anatomy"),
          eyeStyle: enumValue("eyeStyle"),
          mouthStyle: enumValue("mouthStyle"),
          structure: enumValue("structure"),
          weirdness: Number.isFinite(finiteWeirdness) ? Math.max(0, Math.min(100, finiteWeirdness)) : FACE_DEFAULTS.weirdness,
          number: boundedFaceNumber(raw.number, 1, 999999, FACE_DEFAULTS.number)
        };
      }
      function sanitizeFaceLabel(value, fallback = "") {
        return String(typeof value === "string" ? value : fallback).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 80);
      }
      const ANATOMY_LABELS = { abyssal: "Abyssal organism", insectoid: "Insectoid", porcelain: "Living porcelain", biomech: "Bio-mechanical", cosmic: "Cosmic anomaly", "almost-human": "Almost human", "flesh-mutation": "Flesh mutation", mineral: "Mineral / bone" };
      const NAME_A = ["The sideways", "The patient", "The distant", "The damp", "The polite", "The hungry", "The forgotten", "The overripe", "The velvet", "The borrowed", "The unfinished", "The nervous", "The hollow", "The curious", "The last"];
      const NAME_B = ["witness", "visitor", "relative", "observer", "stranger", "ancestor", "neighbor", "impostor", "sleepwalker", "specimen", "caretaker", "messenger", "guest", "reflection", "thing"];

      function createFacePath(cx, cy, w, h, form, rng) {
        const left = cx - w, right = cx + w, top = cy - h, bottom = cy + h;
        const asym = (rng() - .5) * .18;
        const topX = cx + asym * w;
        if (form === "square") {
          return `M ${n(topX-w*.48)} ${n(top)} C ${n(left+w*.08)} ${n(top-h*.06)} ${n(left-w*.04)} ${n(cy-h*.65)} ${n(left)} ${n(cy-h*.12)} Q ${n(left-w*.08)} ${n(cy+h*.58)} ${n(cx-w*.52)} ${n(bottom-h*.03)} Q ${n(cx)} ${n(bottom+h*.12)} ${n(cx+w*.56)} ${n(bottom-h*.08)} Q ${n(right+w*.08)} ${n(cy+h*.48)} ${n(right)} ${n(cy-h*.08)} C ${n(right+w*.03)} ${n(top-h*.58)} ${n(cx+w*.54)} ${n(top-h*.08)} ${n(topX+w*.48)} ${n(top)} Z`;
        }
        if (form === "diamond") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.62)} ${n(top-h*.02)} ${n(right+w*.07)} ${n(cy-h*.33)} ${n(right)} ${n(cy+h*.04)} Q ${n(cx+w*.82)} ${n(cy+h*.83)} ${n(cx+w*.14)} ${n(bottom)} Q ${n(cx-w*.03)} ${n(bottom+h*.09)} ${n(cx-w*.19)} ${n(bottom-h*.02)} Q ${n(left-w*.08)} ${n(cy+h*.42)} ${n(left)} ${n(cy-h*.02)} C ${n(left-w*.02)} ${n(top-h*.35)} ${n(cx-w*.57)} ${n(top-h*.02)} ${n(topX)} ${n(top)} Z`;
        }
        if (form === "pear") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.78)} ${n(top-h*.08)} ${n(right+w*.04)} ${n(cy-h*.38)} ${n(right-w*.02)} ${n(cy+h*.25)} C ${n(right-w*.07)} ${n(cy+h*.82)} ${n(cx+w*.58)} ${n(bottom+h*.14)} ${n(cx)} ${n(bottom)} C ${n(cx-w*.57)} ${n(bottom+h*.11)} ${n(left-w*.08)} ${n(cy+h*.73)} ${n(left)} ${n(cy+h*.08)} C ${n(left-w*.08)} ${n(cy-h*.55)} ${n(cx-w*.67)} ${n(top-h*.03)} ${n(topX)} ${n(top)} Z`;
        }
        if (form === "long") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.57)} ${n(top-h*.04)} ${n(right+w*.18)} ${n(cy-h*.46)} ${n(right-w*.04)} ${n(cy+h*.08)} C ${n(right-w*.13)} ${n(cy+h*.72)} ${n(cx+w*.5)} ${n(bottom+h*.05)} ${n(cx)} ${n(bottom)} C ${n(cx-w*.53)} ${n(bottom+h*.06)} ${n(left-w*.06)} ${n(cy+h*.68)} ${n(left)} ${n(cy-h*.05)} C ${n(left-w*.07)} ${n(top-h*.42)} ${n(cx-w*.55)} ${n(top-h*.03)} ${n(topX)} ${n(top)} Z`;
        }
        if (form === "wide") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.72)} ${n(top-h*.03)} ${n(right+w*.23)} ${n(cy-h*.2)} ${n(right+w*.12)} ${n(cy+h*.2)} C ${n(right+w*.1)} ${n(cy+h*.82)} ${n(cx+w*.42)} ${n(bottom+h*.1)} ${n(cx)} ${n(bottom)} C ${n(cx-w*.46)} ${n(bottom+h*.1)} ${n(left-w*.1)} ${n(cy+h*.78)} ${n(left-w*.1)} ${n(cy+h*.08)} C ${n(left-w*.17)} ${n(cy-h*.28)} ${n(cx-w*.66)} ${n(top-h*.02)} ${n(topX)} ${n(top)} Z`;
        }
        if (form === "triangular") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.4)} ${n(top-h*.12)} ${n(right+w*.18)} ${n(cy-h*.48)} ${n(right)} ${n(cy-h*.02)} Q ${n(cx+w*.75)} ${n(cy+h*.62)} ${n(cx+w*.18)} ${n(bottom)} Q ${n(cx)} ${n(bottom+h*.06)} ${n(cx-w*.18)} ${n(bottom)} Q ${n(cx-w*.75)} ${n(cy+h*.62)} ${n(left)} ${n(cy-h*.02)} C ${n(left-w*.18)} ${n(cy-h*.48)} ${n(cx-w*.4)} ${n(top-h*.12)} ${n(topX)} ${n(top)} Z`;
        }
        if (form === "notched") {
          return `M ${n(topX)} ${n(top)} C ${n(cx+w*.52)} ${n(top-h*.08)} ${n(right+w*.12)} ${n(cy-h*.58)} ${n(right)} ${n(cy-h*.06)} L ${n(right-w*.09)} ${n(cy+h*.23)} Q ${n(right-w*.3)} ${n(cy+h*.55)} ${n(cx+w*.48)} ${n(bottom-h*.02)} Q ${n(cx)} ${n(bottom+h*.12)} ${n(cx-w*.43)} ${n(bottom-h*.08)} Q ${n(left-w*.2)} ${n(cy+h*.62)} ${n(left)} ${n(cy+h*.08)} L ${n(left+w*.1)} ${n(cy-h*.19)} C ${n(left+w*.04)} ${n(top-h*.52)} ${n(cx-w*.55)} ${n(top-h*.04)} ${n(topX)} ${n(top)} Z`;
        }
        return `M ${n(topX)} ${n(top)} C ${n(cx+w*.65)} ${n(top-h*.04)} ${n(right+w*.15)} ${n(cy-h*.46)} ${n(right)} ${n(cy+h*.08)} C ${n(right+w*.05)} ${n(cy+h*.76)} ${n(cx+w*.52)} ${n(bottom+h*.07)} ${n(cx)} ${n(bottom)} C ${n(cx-w*.55)} ${n(bottom+h*.05)} ${n(left-w*.1)} ${n(cy+h*.75)} ${n(left)} ${n(cy+h*.02)} C ${n(left-w*.08)} ${n(top-h*.45)} ${n(cx-w*.61)} ${n(top-h*.04)} ${n(topX)} ${n(top)} Z`;
      }

      function makeEye(x, y, size, mood, palette, rng, weirdness, index, anatomy) {
        const weird = weirdness / 100;
        const w = size * pick(rng, [.72, .88, 1, 1.18, 1.42]);
        const h = size * pick(rng, [.48, .62, .8, 1.04, 1.28]);
        const tilt = int(rng, -24, 24) * (.35 + weird * .8);
        const ex = x + (rng() - .5) * 12 * weird;
        const ey = y + (rng() - .5) * 16 * weird;
        const shape = pick(rng, ["almond", "round", "vertical", "narrow", "diamond", "drooping"]);
        const irisR = Math.max(4, size * pick(rng, [.25, .32, .4, .48]));
        const px = ex + int(rng, -Math.round(size*.24), Math.round(size*.24));
        const py = ey + int(rng, -Math.round(size*.14), Math.round(size*.14));
        const socket = `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w*1.3)}" ry="${n(h*1.38)}" fill="#100e14" opacity=".88"/><ellipse cx="${n(ex)}" cy="${n(ey+2)}" rx="${n(w*1.12)}" ry="${n(h*1.2)}" fill="${palette.deep}" opacity=".9"/>`;
        let white = "";
        if (shape === "almond") white = `<path d="M ${n(ex-w)} ${n(ey)} Q ${n(ex)} ${n(ey-h*1.5)} ${n(ex+w)} ${n(ey)} Q ${n(ex)} ${n(ey+h*1.5)} ${n(ex-w)} ${n(ey)}Z" fill="${palette.light}"/>`;
        if (shape === "round") white = `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w*.88)}" ry="${n(h*.9)}" fill="${palette.light}"/>`;
        if (shape === "vertical") white = `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(w*.72)}" ry="${n(h*1.3)}" fill="${palette.light}"/>`;
        if (shape === "narrow") white = `<path d="M ${n(ex-w)} ${n(ey+2)} Q ${n(ex)} ${n(ey-h*.55)} ${n(ex+w)} ${n(ey-2)} Q ${n(ex)} ${n(ey+h*.7)} ${n(ex-w)} ${n(ey+2)}Z" fill="${palette.light}"/>`;
        if (shape === "diamond") white = `<path d="M ${n(ex)} ${n(ey-h*1.3)} L ${n(ex+w)} ${n(ey)} L ${n(ex)} ${n(ey+h*1.3)} L ${n(ex-w)} ${n(ey)}Z" fill="${palette.light}"/>`;
        if (shape === "drooping") white = `<path d="M ${n(ex-w)} ${n(ey-h*.35)} Q ${n(ex)} ${n(ey-h*1.25)} ${n(ex+w)} ${n(ey-h*.18)} Q ${n(ex+w*.55)} ${n(ey+h*1.6)} ${n(ex-w*.6)} ${n(ey+h*.5)}Z" fill="${palette.light}"/>`;
        let pupil = "";
        const pupilType = pick(rng, ["slit", "pin", "double", "ring", "star"]);
        if (pupilType === "slit") pupil = `<ellipse cx="${n(px)}" cy="${n(py)}" rx="${n(irisR*.34)}" ry="${n(irisR*1.24)}" fill="${palette.ink}"/>`;
        if (pupilType === "pin") pupil = `<circle cx="${n(px)}" cy="${n(py)}" r="${n(irisR*.2)}" fill="${palette.ink}"/>`;
        if (pupilType === "double") pupil = `<circle cx="${n(px-irisR*.34)}" cy="${n(py)}" r="${n(irisR*.54)}" fill="${palette.ink}"/><circle cx="${n(px+irisR*.34)}" cy="${n(py)}" r="${n(irisR*.54)}" fill="${palette.ink}"/>`;
        if (pupilType === "ring") pupil = `<circle cx="${n(px)}" cy="${n(py)}" r="${n(irisR*.78)}" fill="none" stroke="${palette.ink}" stroke-width="${n(Math.max(2,irisR*.3))}"/><circle cx="${n(px)}" cy="${n(py)}" r="${n(irisR*.2)}" fill="${palette.ink}"/>`;
        if (pupilType === "star") pupil = `<path d="M ${n(px)} ${n(py-irisR)} L ${n(px+irisR*.28)} ${n(py-irisR*.25)} L ${n(px+irisR)} ${n(py)} L ${n(px+irisR*.28)} ${n(py+irisR*.25)} L ${n(px)} ${n(py+irisR)} L ${n(px-irisR*.28)} ${n(py+irisR*.25)} L ${n(px-irisR)} ${n(py)} L ${n(px-irisR*.28)} ${n(py-irisR*.25)}Z" fill="${palette.ink}"/>`;
        const iris = `<circle cx="${n(px)}" cy="${n(py)}" r="${n(irisR*1.15)}" fill="${palette.accent}"/><circle cx="${n(px)}" cy="${n(py)}" r="${n(irisR)}" fill="${palette.iris}"/>${pupil}<circle cx="${n(px-irisR*.22)}" cy="${n(py-irisR*.3)}" r="${n(Math.max(1.7,irisR*.13))}" fill="#fff" opacity=".9"/>`;
        const lid = `<path d="M ${n(ex-w*1.05)} ${n(ey-h*.04)} Q ${n(ex)} ${n(ey-h*1.7)} ${n(ex+w*1.05)} ${n(ey-h*.04)}" fill="none" stroke="${palette.ink}" stroke-width="${n(size*.16)}" stroke-linecap="round"/><path d="M ${n(ex-w*.88)} ${n(ey+h*.12)} Q ${n(ex)} ${n(ey+h*1.55)} ${n(ex+w*.88)} ${n(ey+h*.12)}" fill="none" stroke="${palette.shade}" stroke-width="${n(size*.09)}" stroke-linecap="round"/>`;
        let veins = "";
        if (weird > 42 && chance(rng, .76)) {
          const count = int(rng, 2, 5);
          veins = Array.from({length: count}, () => {
            const side = chance(rng,.5) ? -1 : 1;
            const sx = ex + side * int(rng, Math.round(w*.55), Math.round(w*.95));
            const sy = ey + int(rng,-Math.round(h*.55),Math.round(h*.55));
            return `<path d="M ${n(sx)} ${n(sy)} q ${n(side*int(rng,5,12))} ${n(int(rng,-8,8))} ${n(side*int(rng,12,21))} ${n(int(rng,7,19))}" fill="none" stroke="${palette.accent}" stroke-width="1.5" opacity=".62"/>`;
          }).join("");
        }
        const stitches = weird > 82 && chance(rng,.26) ? `<path d="M ${n(ex-w*1.12)} ${n(ey)} l 9 -7 m -8 13 l 9 -7 M ${n(ex+w*.86)} ${n(ey)} l 8 -7 m -7 13 l 8 -7" stroke="${palette.light}" stroke-width="2.4" stroke-linecap="round"/>` : "";
        const extraPupils = weird > 88 && chance(rng,.22) ? `<circle cx="${n(ex+int(rng,-w*.35,w*.35))}" cy="${n(ey+int(rng,-h*.3,h*.3))}" r="${n(irisR*.19)}" fill="${palette.ink}"/>` : "";
        const expression = mood === "terrified" ? `<path d="M ${n(ex-w)} ${n(ey-h*1.45)} Q ${n(ex)} ${n(ey-h*2.05)} ${n(ex+w)} ${n(ey-h*1.45)}" fill="none" stroke="${palette.ink}" stroke-width="${n(size*.13)}" stroke-linecap="round"/>` : "";
        const gazeX = int(rng, -7, 7);
        const gazeY = int(rng, -5, 5);
        const gazeDelay = -rand(0, 9).toFixed(2);
        const gazeDuration = rand(5.5, 12.5).toFixed(2);
        // Different duration and phase per eye make the blink independent and visibly staggered.
        const blinkDuration = (4.2 + (index % 4) * .62 + Math.random() * .9).toFixed(2);
        const blinkDelay = (-(index * .83 + Math.random() * 3.7)).toFixed(2);
        const blinkStyle = `--blink-duration:${blinkDuration}s;--blink-delay:${blinkDelay}s`;
        const gaze = `<g class="face-gaze" style="--gaze-x:${gazeX}px;--gaze-y:${gazeY}px;--gaze-delay:${gazeDelay}s;--gaze-duration:${gazeDuration}s">${white}${iris}${extraPupils}</g>`;
        const shutLid = `<path class="face-eye-shut" d="M ${n(ex-w*1.08)} ${n(ey)} Q ${n(ex)} ${n(ey-h*.35)} ${n(ex+w*1.08)} ${n(ey)} Q ${n(ex)} ${n(ey+h*.72)} ${n(ex-w*1.08)} ${n(ey)}Z" fill="${palette.skin}" stroke="${palette.ink}" stroke-width="${n(Math.max(2,size*.1))}" stroke-linejoin="round"/><path class="face-eye-shut" d="M ${n(ex-w*.78)} ${n(ey+2)} Q ${n(ex)} ${n(ey+h*.45)} ${n(ex+w*.78)} ${n(ey+2)}" fill="none" stroke="${palette.light}" stroke-width="${n(Math.max(1.5,size*.045))}"/>`;
        const blinkPhase = (Math.abs(Number(blinkDelay)) + index * .371).toFixed(3);
        return `<g class="face-eye-motion" data-eye-x="${n(ex)}" data-eye-y="${n(ey)}" data-eye-tilt="${n(tilt)}" data-eye-period="${blinkDuration}" data-eye-phase="${blinkPhase}" data-gaze-x="${gazeX}" data-gaze-y="${gazeY}"><g class="face-eye-blink" data-eye-live="true" style="${blinkStyle}">${veins}${socket}${gaze}${lid}${stitches}${expression}</g><g class="face-eye-lid" style="${blinkStyle}">${shutLid}</g></g>`;
      }

      function makeMouth(cx, y, palette, mood, rng, weirdness, requestedStyle = "random") {
        const w = int(rng, 34, 66) * (1 + weirdness / 145);
        const h = int(rng, 13, 27);
        const styles = weirdness >= 85 ? ["slit", "teeth", "vertical", "zipper", "spiral", "ragged", "stitched"] : ["smile", "frown", "oval", "slit", "teeth", "wavy", "vertical", "zipper", "spiral", "ragged", "stitched"];
        const mapped = { stretched: "smile", vertical: "vertical", sealed: "stitched" };
        const style = requestedStyle === "random" || requestedStyle === "double" ? pick(rng, styles) : (mapped[requestedStyle] || requestedStyle);
        const fill = palette.deep;
        let mouth = "";
        if (style === "smile") {
          mouth = `<path d="M ${n(cx-w)} ${n(y)} Q ${n(cx)} ${n(y+h*2.7)} ${n(cx+w)} ${n(y)} Q ${n(cx)} ${n(y+h*.5)} ${n(cx-w)} ${n(y)}Z" fill="${fill}" stroke="${palette.ink}" stroke-width="7" stroke-linejoin="round"/><path d="M ${n(cx-w*.76)} ${n(y+h*.52)} Q ${n(cx)} ${n(y+h*1.2)} ${n(cx+w*.76)} ${n(y+h*.52)}" stroke="${palette.light}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
        } else if (style === "frown") {
          mouth = `<path d="M ${n(cx-w)} ${n(y+h)} Q ${n(cx)} ${n(y-h*.85)} ${n(cx+w)} ${n(y+h*.4)}" stroke="${palette.ink}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
        } else if (style === "oval" || style === "vertical") {
          mouth = `<path d="M ${n(cx)} ${n(y-h*1.3)} C ${n(cx-w*.72)} ${n(y-h*.6)} ${n(cx-w*.7)} ${n(y+h)} ${n(cx)} ${n(y+h*1.4)} C ${n(cx+w*.7)} ${n(y+h)} ${n(cx+w*.72)} ${n(y-h*.6)} ${n(cx)} ${n(y-h*1.3)}Z" fill="${fill}" stroke="${palette.ink}" stroke-width="7"/><path d="M ${n(cx-w*.32)} ${n(y+h*.72)} Q ${n(cx)} ${n(y+h*1.3)} ${n(cx+w*.3)} ${n(y+h*.68)}" stroke="${palette.accent}" stroke-width="5" fill="none" opacity=".9"/>`;
        } else if (style === "slit") {
          mouth = `<path d="M ${n(cx-w)} ${n(y)} Q ${n(cx)} ${n(y-h*.82)} ${n(cx+w)} ${n(y)} Q ${n(cx)} ${n(y+h*.78)} ${n(cx-w)} ${n(y)}Z" fill="${fill}" stroke="${palette.ink}" stroke-width="7"/>`;
        } else if (style === "teeth" || style === "ragged") {
          const toothCount = int(rng, style === "ragged" ? 7 : 9, style === "ragged" ? 14 : 17);
          const teeth = Array.from({length: toothCount}, (_, i) => {
            const tx = cx-w*.8 + i*(w*1.6/Math.max(1,toothCount-1));
            const toothHeight = int(rng, style === "ragged" ? 8 : 10, style === "ragged" ? 25 : 20);
            const direction = i % 2 ? 1 : -1;
            return `<path d="M ${n(tx)} ${n(y)} l ${n(int(rng,3,7))} ${n(toothHeight*direction)} l ${n(int(rng,3,7))} ${n(-toothHeight*direction)}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="1.6"/>`;
          }).join("");
          mouth = `<path d="M ${n(cx-w)} ${n(y)} Q ${n(cx)} ${n(y-h*1.1)} ${n(cx+w)} ${n(y)} Q ${n(cx)} ${n(y+h*1.35)} ${n(cx-w)} ${n(y)}Z" fill="${fill}" stroke="${palette.ink}" stroke-width="7"/>${teeth}`;
        } else if (style === "wavy") {
          mouth = `<path d="M ${n(cx-w)} ${n(y)} C ${n(cx-w*.55)} ${n(y-h*1.2)} ${n(cx-w*.24)} ${n(y+h*1.3)} ${n(cx)} ${n(y)} S ${n(cx+w*.55)} ${n(y-h*1.1)} ${n(cx+w)} ${n(y+h*.1)}" fill="none" stroke="${palette.ink}" stroke-width="9" stroke-linecap="round"/>`;
        } else if (style === "zipper") {
          const teeth = Array.from({length: 13}, (_, i) => { const tx = cx-w*.8 + i*(w*1.6/12); return `<path d="M ${n(tx)} ${n(y-6)} l 7 12" stroke="${palette.light}" stroke-width="3.2" stroke-linecap="round"/>`; }).join("");
          mouth = `<path d="M ${n(cx-w)} ${n(y)} Q ${n(cx)} ${n(y-h*.6)} ${n(cx+w)} ${n(y)}" fill="none" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round"/>${teeth}`;
        } else if (style === "spiral") {
          mouth = `<path d="M ${n(cx)} ${n(y)} m -2 0 c -30 -24 -44 25 -10 31 c 38 7 54 -43 14 -54 c -17 -5 -36 4 -43 18" fill="none" stroke="${palette.ink}" stroke-width="8" stroke-linecap="round"/>`;
        } else {
          mouth = `<path d="M ${n(cx-w)} ${n(y)} Q ${n(cx)} ${n(y-h*.22)} ${n(cx+w)} ${n(y)}" fill="none" stroke="${palette.ink}" stroke-width="6" stroke-linecap="round"/><path d="M ${n(cx-w*.76)} ${n(y-7)} l 8 14 m ${n(w*.28)} -17 l 8 14 m ${n(w*.28)} -17 l 8 14 m ${n(w*.28)} -17 l 8 14" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round"/>`;
        }
        return { svg: mouth, style };
      }

      function makeFace(config) {
                config = sanitizeFaceConfig(config) || { seed: randomSeed(), ...FACE_DEFAULTS };
        const rng = seededRandom(config.seed);
        const weird = clamp(config.weirdness, 0, 100) / 100;
        const mood = config.mood === "random" ? pick(rng, MOODS) : config.mood;
        const anatomy = config.anatomy === "random" ? pick(rng, ANATOMIES) : config.anatomy;
        const palette = pick(rng, PALETTES);
        const prefix = `face-${config.seed}`;
        const cx = 300 + int(rng, -9, 9) * weird;
        const cy = 304 + int(rng, -8, 8) * weird;
        const w = int(rng, 145, 174) * (anatomy === "insectoid" ? 1.04 : 1);
        const h = int(rng, 192, 222) * (chance(rng, weird * .48) ? pick(rng, [.82, 1.12, 1.22]) : 1);
        const forms = config.structure === "soft"
          ? ["round", "pear", "long", "wide"]
          : config.structure === "angular"
            ? ["square", "diamond", "long", "triangular", "notched"]
            : ["round", "pear", "long", "wide", "square", "diamond", "triangular", "notched"];
        const form = pick(rng, forms);
        const head = createFacePath(cx, cy, w, h, form, rng);
        const stroke = int(rng, 7, 11);

        // The face always keeps a recognizable pair of primary eyes. Mutations grow around them.
        const eyeStyle = config.eyeStyle || "random";
        const eyeLayout = eyeStyle === "random" ? pick(rng, ["uneven", "uneven", "clustered", "vertical", "many", "embedded"]) : eyeStyle;
        const eyeSpacing = int(rng, 68, 120);
        const eyeBaseY = cy - h * pick(rng, [.24, .28, .32]);
        const mainSize = int(rng, 30, 42);
        const primary = [
          { x: cx - eyeSpacing + int(rng,-17,13)*weird, y: eyeBaseY + int(rng,-17,16)*weird, size: mainSize * pick(rng,[.88,1,1.12]) },
          { x: cx + eyeSpacing + int(rng,-13,18)*weird, y: eyeBaseY + int(rng,-14,20)*weird, size: mainSize * pick(rng,[.8,1,1.24]) }
        ];
        let additional = [];
        const extraCount = eyeLayout === "many" ? int(rng,4,7) : eyeLayout === "embedded" ? int(rng,3,6) : weird > .92 ? int(rng,2,4) : weird > .78 && chance(rng,.7) ? int(rng,1,3) : 0;
        for (let i=0;i<extraCount;i++) {
          let x, y;
          if (eyeLayout === "clustered") {
            const side = i % 2 ? 1 : -1;
            x = cx + side * int(rng, 8, 70);
            y = cy - h * pick(rng,[.42,.32,.18,.08]);
          } else if (eyeLayout === "vertical") {
            x = cx + int(rng,-20,20);
            y = cy - h * pick(rng,[.68,.54,.43,.12]);
          } else if (eyeLayout === "embedded") {
            const side = chance(rng,.5) ? -1 : 1;
            x = cx + side * int(rng, w*.27, w*.66);
            y = cy + int(rng,-h*.05,h*.45);
          } else {
            x = cx + int(rng,-w*.64,w*.64);
            y = cy + int(rng,-h*.7,h*.05);
          }
          additional.push({ x, y, size: int(rng,12,25) * (eyeLayout === "many" ? 1.05 : .82) });
        }
        if (eyeLayout === "clustered" && additional.length < 2) {
          const side = chance(rng,.5) ? -1 : 1;
          additional.push({ x: cx + side*int(rng,20,50), y: eyeBaseY-int(rng,25,50), size: 17 });
          additional.push({ x: cx + side*int(rng,35,73), y: eyeBaseY+int(rng,15,37), size: 13 });
        }
        const eyeMarkup = primary.map((e,i) => makeEye(e.x,e.y,e.size,mood,palette,rng,weird*100,i,anatomy)).join("") + additional.map((e,i) => makeEye(e.x,e.y,e.size,"blank",palette,rng,Math.max(80,weird*100),i+2,anatomy)).join("");

        // A central bridge anchors the eyes and mouth as a face, even when the details mutate.
        const noseX = cx + int(rng,-22,22)*weird;
        const noseY = cy + int(rng,18,43);
        const noseStyle = pick(rng,["hook","split","long","ridge","collapsed"]);
        let nose = "";
        if (noseStyle === "hook") nose = `<path d="M ${n(noseX-4)} ${n(noseY-45)} C ${n(noseX-16)} ${n(noseY-1)} ${n(noseX-31)} ${n(noseY+28)} ${n(noseX+2)} ${n(noseY+30)} Q ${n(noseX+26)} ${n(noseY+28)} ${n(noseX+13)} ${n(noseY+11)}" fill="none" stroke="${palette.ink}" stroke-width="${stroke+2}" stroke-linecap="round"/><ellipse cx="${n(noseX+2)}" cy="${n(noseY+23)}" rx="11" ry="6" fill="${palette.deep}"/>`;
        if (noseStyle === "split") nose = `<path d="M ${n(noseX)} ${n(noseY-34)} L ${n(noseX-22)} ${n(noseY+22)} L ${n(noseX-2)} ${n(noseY+11)} L ${n(noseX+22)} ${n(noseY+25)} Z" fill="${palette.shade}" stroke="${palette.ink}" stroke-width="5" stroke-linejoin="round"/>`;
        if (noseStyle === "long") nose = `<path d="M ${n(noseX-5)} ${n(noseY-53)} C ${n(noseX-17)} ${n(noseY+3)} ${n(noseX+11)} ${n(noseY+8)} ${n(noseX-17)} ${n(noseY+42)} Q ${n(noseX+9)} ${n(noseY+54)} ${n(noseX+25)} ${n(noseY+29)}" fill="${palette.shade}" stroke="${palette.ink}" stroke-width="5" stroke-linejoin="round"/>`;
        if (noseStyle === "ridge") nose = `<path d="M ${n(noseX)} ${n(noseY-44)} L ${n(noseX-20)} ${n(noseY+21)} Q ${n(noseX)} ${n(noseY+37)} ${n(noseX+23)} ${n(noseY+18)}" fill="${palette.light}" opacity=".55" stroke="${palette.ink}" stroke-width="5"/>`;
        if (noseStyle === "collapsed") nose = `<path d="M ${n(noseX-27)} ${n(noseY+4)} Q ${n(noseX)} ${n(noseY-25)} ${n(noseX+27)} ${n(noseY+5)} Q ${n(noseX+7)} ${n(noseY+39)} ${n(noseX-27)} ${n(noseY+4)}Z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="5"/><ellipse cx="${n(noseX-10)}" cy="${n(noseY+8)}" rx="5" ry="8" fill="${palette.ink}"/><ellipse cx="${n(noseX+11)}" cy="${n(noseY+8)}" rx="5" ry="8" fill="${palette.ink}"/>`;

        const mouthY = cy + h * pick(rng,[.49,.54,.59]) + int(rng,-10,15)*weird;
        const mouthX = cx + int(rng,-25,25)*weird;
        const mouth = makeMouth(mouthX,mouthY,palette,mood,rng,weird*100,config.mouthStyle || "random");
        let secondMouth = "";
        const doubleMouth = config.mouthStyle === "double" || (weird > .94 && chance(rng,.62));
        if (doubleMouth) {
          const side = chance(rng,.5) ? -1 : 1;
          const sx = cx + side * int(rng,64,94);
          const sy = cy + h * int(rng,24,38) / 100;
          const sw = int(rng,17,31);
          secondMouth = `<path d="M ${n(sx-sw)} ${n(sy)} Q ${n(sx)} ${n(sy-int(rng,7,18))} ${n(sx+sw)} ${n(sy+int(rng,-3,6))} Q ${n(sx)} ${n(sy+int(rng,10,18))} ${n(sx-sw)} ${n(sy)}Z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="5"/><path d="M ${n(sx-sw*.55)} ${n(sy+2)} l 6 8 m 6 -9 l 6 8 m 6 -8 l 6 8" stroke="${palette.light}" stroke-width="2.5"/>`;
        }

        const earMode = chance(rng, .76);
        const outerEars = earMode ? `
          <path d="M ${n(cx-w*.87)} ${n(cy-28)} C ${n(cx-w-65)} ${n(cy-100)} ${n(cx-w-67)} ${n(cy+42)} ${n(cx-w*.88)} ${n(cy+82)} Q ${n(cx-w*1.04)} ${n(cy+4)} ${n(cx-w*.87)} ${n(cy-28)}Z" fill="${palette.shade}" stroke="${palette.ink}" stroke-width="${stroke}"/>
          <path d="M ${n(cx+w*.87)} ${n(cy-28)} C ${n(cx+w+65)} ${n(cy-100)} ${n(cx+w+67)} ${n(cy+42)} ${n(cx+w*.88)} ${n(cy+82)} Q ${n(cx+w*1.04)} ${n(cy+4)} ${n(cx+w*.87)} ${n(cy-28)}Z" fill="${palette.shade}" stroke="${palette.ink}" stroke-width="${stroke}"/>` : "";
        const neck = `<path d="M ${n(cx-70)} ${n(cy+h*.72)} L ${n(cx-85)} 580 Q ${n(cx)} 600 ${n(cx+86)} 580 L ${n(cx+68)} ${n(cy+h*.72)}Z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="7"/><path d="M 164 600 Q 180 528 ${n(cx-62)} 520 Q ${n(cx)} 537 ${n(cx+62)} 520 Q 420 528 438 600Z" fill="${palette.shade}" stroke="${palette.ink}" stroke-width="7"/>`;

        let appendages = "";
        const appendageCount = anatomy === "insectoid" ? int(rng,2,5) : weird > .84 ? int(rng,0,3) : int(rng,0,1);
        for (let i=0;i<appendageCount;i++) {
          const side = chance(rng,.5) ? -1 : 1;
          const sx = cx + side*int(rng,70,145);
          const sy = cy - int(rng,110,190);
          const ex = sx + side*int(rng,25,78);
          const ey = sy - int(rng,35,100);
          appendages += `<path d="M ${n(sx)} ${n(sy)} C ${n(sx+side*24)} ${n(sy-30)} ${n(ex-side*10)} ${n(ey+25)} ${n(ex)} ${n(ey)}" fill="none" stroke="${palette.ink}" stroke-width="${int(rng,4,8)}" stroke-linecap="round"/><path d="M ${n(ex)} ${n(ey)} l ${n(side*7)} -${int(rng,9,19)}" stroke="${palette.accent}" stroke-width="3" stroke-linecap="round"/>`;
        }

        let markings = "";
        const detailCount = int(rng,12,22 + Math.round(weird*28));
        for (let i=0;i<detailCount;i++) {
          const side = chance(rng,.5) ? -1 : 1;
          const x = cx + side*int(rng,15,w*.8);
          const y = cy + int(rng,-h*.68,h*.78);
          const size = int(rng,2,7);
          const kind = int(rng,0,5);
          if (kind === 0) markings += `<circle cx="${n(x)}" cy="${n(y)}" r="${size}" fill="${palette.ink}" opacity=".22"/>`;
          if (kind === 1) markings += `<path d="M ${n(x-size*2)} ${n(y-size)} q ${n(size*2)} ${n(size*3)} ${n(size*4)} 0" fill="none" stroke="${palette.ink}" stroke-width="2.5" opacity=".55"/>`;
          if (kind === 2) markings += `<path d="M ${n(x)} ${n(y-size*1.6)} l ${n(size)} ${n(size*2)} l ${n(-size)} ${n(size*1.6)}" fill="none" stroke="${palette.light}" stroke-width="2" opacity=".48"/>`;
          if (kind === 3) markings += `<path d="M ${n(x-size*1.5)} ${n(y)} l ${n(size*3)} ${n(-size*.3)}" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round" opacity=".48"/>`;
          if (kind === 4 && weird > .65) markings += `<circle cx="${n(x)}" cy="${n(y)}" r="${size+3}" fill="none" stroke="${palette.accent}" stroke-width="2" opacity=".7"/>`;
          if (kind === 5 && weird > .78) markings += `<path d="M ${n(x-7)} ${n(y-4)} l 14 9 m -11 -12 l 14 9" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"/>`;
        }

        let extraAnatomy = "";
        if (anatomy === "abyssal" || anatomy === "flesh-mutation") {
          for (let i=0;i<6;i++) {
            const x = cx - w*.78 + i*int(rng,25,35);
            extraAnatomy += `<path d="M ${n(x)} ${n(cy+30+i*4)} Q ${n(x+int(rng,-18,18))} ${n(cy+72+i*5)} ${n(x+int(rng,-12,12))} ${n(cy+109+i*7)}" fill="none" stroke="${palette.accent}" stroke-width="${int(rng,2,4)}" opacity=".72"/>`;
          }
        }
        if (anatomy === "porcelain" || anatomy === "mineral") {
          extraAnatomy += Array.from({length:12},() => { const x=cx+int(rng,-w*.72,w*.72), y=cy+int(rng,-h*.7,h*.65), dx=int(rng,-28,28), dy=int(rng,15,48); return `<path d="M ${n(x)} ${n(y)} l ${n(dx)} ${n(dy)} l ${n(-dx*.4)} ${n(dy*.45)}" fill="none" stroke="${palette.ink}" stroke-width="2.3" opacity=".65"/>`; }).join("");
        }
        if (anatomy === "biomech") {
          extraAnatomy += `<path d="M ${n(cx-w*.72)} ${n(cy+4)} L ${n(cx-w*.58)} ${n(cy+58)} M ${n(cx+w*.72)} ${n(cy+4)} L ${n(cx+w*.58)} ${n(cy+58)}" stroke="${palette.accent}" stroke-width="6"/><circle cx="${n(cx-w*.68)}" cy="${n(cy+24)}" r="9" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="3"/><circle cx="${n(cx+w*.68)}" cy="${n(cy+24)}" r="9" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="3"/>`;
        }
        if (anatomy === "cosmic") {
          extraAnatomy += Array.from({length:28},() => { const x=cx+int(rng,-w*.78,w*.78), y=cy+int(rng,-h*.8,h*.8), r=pick(rng,[1.5,2,3]); return `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${palette.light}" opacity=".8"/>`; }).join("");
        }
        if (anatomy === "insectoid") {
          extraAnatomy += `<path d="M ${n(cx-28)} ${n(cy-h+20)} Q ${n(cx-72)} ${n(cy-h-50)} ${n(cx-102)} ${n(cy-h-62)} M ${n(cx+28)} ${n(cy-h+20)} Q ${n(cx+72)} ${n(cy-h-50)} ${n(cx+102)} ${n(cy-h-62)}" fill="none" stroke="${palette.ink}" stroke-width="6" stroke-linecap="round"/><circle cx="${n(cx-102)}" cy="${n(cy-h-62)}" r="8" fill="${palette.accent}"/><circle cx="${n(cx+102)}" cy="${n(cy-h-62)}" r="8" fill="${palette.accent}"/>`;
        }

        const asymmetry = `<path d="M ${n(cx-w*.72)} ${n(cy-h*.4)} Q ${n(cx-w*.35)} ${n(cy-h*.54)} ${n(cx-w*.08)} ${n(cy-h*.38)} M ${n(cx+w*.1)} ${n(cy-h*.39)} Q ${n(cx+w*.39)} ${n(cy-h*.57)} ${n(cx+w*.69)} ${n(cy-h*.33)}" fill="none" stroke="${palette.ink}" stroke-width="${int(rng,4,9)}" stroke-linecap="round" opacity=".9"/>`;
        const cheekFolds = `<path d="M ${n(cx-w*.67)} ${n(cy+h*.17)} Q ${n(cx-w*.49)} ${n(cy+h*.32)} ${n(cx-w*.55)} ${n(cy+h*.51)} M ${n(cx+w*.68)} ${n(cy+h*.16)} Q ${n(cx+w*.48)} ${n(cy+h*.35)} ${n(cx+w*.56)} ${n(cy+h*.52)}" fill="none" stroke="${palette.ink}" stroke-width="3.2" opacity=".55"/>`;
        const faceGradient = `<defs>
          <linearGradient id="${prefix}-skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.light}"/><stop offset=".34" stop-color="${palette.skin}"/><stop offset=".78" stop-color="${palette.shade}"/><stop offset="1" stop-color="${palette.deep}"/></linearGradient>
          <linearGradient id="${prefix}-shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".46" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient>
          <filter id="${prefix}-grain"><feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" seed="${config.seed % 997}"/><feColorMatrix values=".45 0 0 0 0 0 .42 0 0 0 0 0 .4 0 0 0 0 0 .16 0"/></filter>
          <clipPath id="${prefix}-clip"><path d="${head}"/></clipPath>
        </defs>`;
        const faceBase = `<path d="${head}" fill="url(#${prefix}-skin)" stroke="${palette.ink}" stroke-width="${stroke}" stroke-linejoin="round"/><path d="${head}" fill="url(#${prefix}-shade)"/>`;
        const crown = weird > .7 && chance(rng,.55) ? `<path d="M ${n(cx-w*.68)} ${n(cy-h+42)} Q ${n(cx-w*.3)} ${n(cy-h-55)} ${n(cx)} ${n(cy-h+18)} Q ${n(cx+w*.35)} ${n(cy-h-35)} ${n(cx+w*.7)} ${n(cy-h+35)}" fill="none" stroke="${palette.ink}" stroke-width="${int(rng,5,10)}" stroke-linecap="round"/>` : "";
        const scars = weird > .68 && chance(rng,.8) ? `<path d="M ${n(cx-w*.55)} ${n(cy+h*.08)} l 24 22 -9 20 22 18 M ${n(cx+w*.48)} ${n(cy-h*.05)} l -18 19 10 16 -17 24" fill="none" stroke="${palette.ink}" stroke-width="${int(rng,2,5)}" stroke-linecap="round" opacity=".82"/>` : "";
        const skinNoise = weird > .55 ? `<path d="${head}" filter="url(#${prefix}-grain)" opacity=".2"/>` : "";

        return `<svg id="faceArt" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="An uncanny ${esc(ANATOMY_LABELS[anatomy] || anatomy)} face" class="face-art">
          <g class="face-breath">
            ${faceGradient}
            <g opacity=".12"><circle cx="300" cy="300" r="237" fill="none" stroke="${palette.accent}" stroke-width="2"/><circle cx="300" cy="300" r="213" fill="none" stroke="${palette.light}" stroke-dasharray="2 11" stroke-width="2"/></g>
            ${neck}${outerEars}${appendages}
            <path d="${head}" fill="${palette.deep}" opacity=".48" transform="translate(0 10)"/>
            ${faceBase}${crown}
            <g clip-path="url(#${prefix}-clip)">
              ${skinNoise}${markings}${extraAnatomy}${asymmetry}${cheekFolds}${scars}
              ${eyeMarkup}${nose}<g class="face-mouth-life">${mouth.svg}${secondMouth}</g>
            </g>
            <path d="${head}" fill="none" stroke="${palette.ink}" stroke-width="${stroke}" stroke-linejoin="round"/>
            <g fill="none" stroke="${palette.accent}" stroke-width="3" opacity=".62"><path d="M ${n(cx-w*.73)} ${n(cy-h*.08)} q -16 12 -8 30"/><path d="M ${n(cx+w*.73)} ${n(cy-h*.08)} q 16 12 8 30"/></g>
            <g fill="${palette.accent}" opacity=".75"><circle cx="${n(cx-w*.7)}" cy="${n(cy+h*.45)}" r="3.5"/><circle cx="${n(cx+w*.69)}" cy="${n(cy+h*.43)}" r="3.5"/></g>
          </g>
        </svg>`;
      }

      function resolvedSettings(config) {
        config = sanitizeFaceConfig(config) || { seed: randomSeed(), ...FACE_DEFAULTS };
        const rng = seededRandom(config.seed);
        return {
          mood: config.mood === "random" ? pick(rng, MOODS) : config.mood,
          anatomy: config.anatomy === "random" ? pick(rng, ANATOMIES) : config.anatomy,
          eyes: config.anatomy === "insectoid" ? "MULTI" : (config.weirdness > 77 ? "VARIABLE" : "ASYMMETRIC")
        };
      }

      function specimenName(config) {
        config = sanitizeFaceConfig(config) || { seed: randomSeed(), ...FACE_DEFAULTS };
        const rng = seededRandom(config.seed ^ 0xA53A9B4D);
        return `${pick(rng, NAME_A)} ${pick(rng, NAME_B)}`;
      }
      const faceCorruptStores = new Map(), faceRawSnapshots = new Map();
      let faceSavedCache = [], faceSavedLoaded = false;
      function markFaceStoreCorrupt(key, label, raw, reason) {
        if (!faceCorruptStores.has(key)) faceCorruptStores.set(key, { key, label, raw: raw == null ? null : String(raw), reason: String(reason || 'The saved data could not be validated.').slice(0, 220), downloaded: false });
      }
      function writeFaceStoredValue(key, serialized, label) {
        const corrupt=faceCorruptStores.get(key);
        if(corrupt){notify(corrupt.raw===null?`The original ${label} could not be read. Reload when browser storage is available; saving remains blocked.`:`The original ${label} needs recovery before it can be replaced.`);return false;}
        let previousRaw;
        try{previousRaw=localStorage.getItem(key);}catch(error){markFaceStoreCorrupt(key,label,null,`Browser storage denied access to the original bytes: ${error?.message||'storage is unavailable'}. Reload after access is restored.`);if(typeof renderFaceRecoveryPanel==='function')renderFaceRecoveryPanel();notify(`The original ${label} could not be inspected. No changes were made.`);return false;}
        if(faceRawSnapshots.has(key)&&previousRaw!==faceRawSnapshots.get(key)){notify(`The saved ${label} changed in another tab. This edit was stopped to protect the newer version. Reload Face Machine before trying again.`);return false;}
        try{localStorage.setItem(key,serialized);if(localStorage.getItem(key)!==serialized)throw new Error('Read-back verification failed.');faceRawSnapshots.set(key,serialized);return true;}
        catch(error){
          let current;try{current=localStorage.getItem(key);}catch(readError){notify(`Saving ${label} failed and current storage could not be inspected (${String(readError?.message||readError).slice(0,90)}). No rollback was attempted; preserve browser storage.`);return false;}
          if(current===serialized){faceRawSnapshots.set(key,serialized);return true;}
          if(current!==previousRaw){notify(`Saving ${label} encountered a cross-tab conflict. The newer stored value was left untouched. Reload Face Machine before editing.`);return false;}
          notify(`Saving ${label} failed. Its previous value remains intact.`);return false;
        }
      }
      function readSaved() {
        if (faceSavedLoaded) return faceSavedCache.slice();
        faceSavedLoaded = true;
        let raw;
        try { raw = localStorage.getItem(STORAGE_KEY); faceRawSnapshots.set(STORAGE_KEY,raw); }
        catch (error) { markFaceStoreCorrupt(STORAGE_KEY, 'Face Machine specimens', null, `Browser storage could not expose the original bytes: ${error?.message || 'permission unavailable'}. Reload after access is restored; recovery and reset remain locked.`); return []; }
        if (raw == null) { faceSavedCache = []; return []; }
        try {
          if (typeof raw !== 'string' || raw.length > 65536) throw new Error('The specimen archive exceeds its 64 KB limit.');
          const saved = JSON.parse(raw);
          if (!Array.isArray(saved) || saved.length > MAX_SAVED * 4) throw new Error('The specimen archive is not a valid list or contains too many records.');
          const seenSeeds = new Set(), clean = [];
          let invalid = false;
          for (const item of saved) {
            const config = sanitizeFaceConfig(item);
            if (!config || (item?.name !== undefined && typeof item.name !== 'string') || seenSeeds.has(config?.seed)) { invalid = true; continue; }
            seenSeeds.add(config.seed);
            if (clean.length < MAX_SAVED) clean.push({ ...config, name: sanitizeFaceLabel(item.name, `Specimen ${clean.length + 1}`) });
            else invalid = true;
          }
          if (invalid) markFaceStoreCorrupt(STORAGE_KEY, 'Face Machine specimens', raw, 'Some saved specimens were malformed, duplicated or exceeded the visible archive limit. Safe specimens are shown read-only.');
          faceSavedCache = clean;
          return clean.slice();
        } catch (error) {
          markFaceStoreCorrupt(STORAGE_KEY, 'Face Machine specimens', raw, error?.message || 'The specimen archive is invalid.');
          faceSavedCache = [];
          return [];
        }
      }
      function writeSaved(items) {
        if (faceCorruptStores.has(STORAGE_KEY)) { notify('Your original specimen archive needs recovery. Download it before resetting or saving new specimens.'); return false; }
        try {
          const clean = [], seenSeeds = new Set();
          for (const item of (Array.isArray(items) ? items : []).slice(0, MAX_SAVED * 4)) {
            const config = sanitizeFaceConfig(item);
            if (!config || seenSeeds.has(config.seed)) continue;
            seenSeeds.add(config.seed);
            clean.push({ ...config, name: sanitizeFaceLabel(item.name, specimenName(config)) });
            if (clean.length >= MAX_SAVED) break;
          }
          const serialized = JSON.stringify(clean);
          if (serialized.length > 65536) return false;
          if(!writeFaceStoredValue(STORAGE_KEY,serialized,'Face Machine specimens'))return false;
          faceSavedCache = clean;
          faceSavedLoaded = true;
          return true;
        } catch (_) { return false; }
      }

      function faceDataUri(config) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(makeFace(config))}`;
      }

      function renderArchive(mount) {
        const grid = $("#specimenGrid", mount);
        const count = $("#archiveCount", mount);
        if (!grid || !count) return;
        const items = readSaved();
        count.textContent = `${items.length} / ${MAX_SAVED} SAVED`;
        grid.replaceChildren();
        if (!items.length) {
          const empty = document.createElement("div");
          empty.className = "drawer-empty";
          empty.innerHTML = "<strong>The drawer is empty.</strong> Save a specimen to keep it here.";
          grid.appendChild(empty);
          return;
        }
        items.forEach((item, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "specimen-card";
          button.title = `Load ${item.name || `Specimen ${index+1}`}`;
          const img = document.createElement("img");
          img.loading = "lazy";
          img.alt = "";
          img.src = faceDataUri(item);
          const label = document.createElement("span");
          label.className = "specimen-card-name";
          label.textContent = item.name || `Specimen ${index+1}`;
          button.append(img, label);
          button.addEventListener("click", () => loadSpecimen(item, mount));
          grid.appendChild(button);
        });
      }

      function updateFace(mount, showNotice = false) {
        const settings = resolvedSettings(current);
        const svg = makeFace(current);
        const stage = $("#faceArt", mount);
        if (!stage) throw new Error("The face display is not ready.");
        stage.outerHTML = svg;
        const stageFrame = $("#faceStage", mount);
        if (stageFrame) stageFrame.dataset.eyeBehavior = $("#eyeBehaviorSelect", mount)?.value || "natural";
        const name = specimenName(current);
        $("#specimenName", mount).textContent = name;
        $("#specimenMood", mount).textContent = settings.mood.replace(/-/g, " ");
        $("#specimenCode", mount).textContent = `CR-${String(current.number).padStart(4,"0")}`;
        $("#stageCounter", mount).textContent = `SUBJECT ${String(current.number).padStart(3,"0")}`;
        $("#stageSeed", mount).textContent = `SEED ${current.seed}`;
        $("#tagEyes", mount).textContent = `EYES / ${(current.eyeStyle || "random").toUpperCase()}`;
        $("#tagAnatomy", mount).textContent = `ANATOMY / ${settings.anatomy.toUpperCase()}`;
        $("#tagStructure", mount).textContent = `FORM / ${current.structure.toUpperCase()}`;
        if (showNotice) notify("A new specimen has arrived.");
      }

      function generateFace(mount) {
        current = sanitizeFaceConfig({
          seed: randomSeed(),
          mood: $("#moodSelect", mount).value,
          anatomy: $("#anatomySelect", mount).value,
          eyeStyle: $("#eyeLayoutSelect", mount).value,
          mouthStyle: $("#mouthSelect", mount).value,
          weirdness: Number($("#weirdnessRange", mount).value),
          structure: $(".shape-option[aria-pressed='true']", mount)?.dataset.structure || "mixed",
          number: ++subjectNumber
        });
        updateFace(mount, true);
      }

      function saveCurrent(mount) {
        if (faceCorruptStores.has(STORAGE_KEY)) { notify('Download the original specimen archive and reset it before saving new specimens.'); return; }
        const items = readSaved();
        if (items.some(item => item.seed === current.seed)) { notify("That specimen is already in the drawer."); return; }
        const item = { ...current, name: specimenName(current) };
        if (!writeSaved([item, ...items].slice(0, MAX_SAVED))) { notify("Your browser could not save this specimen."); return; }
        renderArchive(mount);
        notify("Specimen saved in your drawer.");
      }

      function loadSpecimen(item, mount) {
        const legacyMoods = { suspicious: "predatory", panicked: "terrified", serene: "calm", delighted: "predatory", exhausted: "dissociated" };
        const candidate = item && typeof item === "object" ? { ...item, mood: legacyMoods[item.mood] || item.mood || "random" } : null;
        current = sanitizeFaceConfig(candidate);
        if (!current) { notify("That saved specimen is damaged and was not loaded."); return; }
        $("#moodSelect", mount).value = current.mood;
        $("#anatomySelect", mount).value = current.anatomy;
        $("#eyeLayoutSelect", mount).value = current.eyeStyle;
        $("#mouthSelect", mount).value = current.mouthStyle;
        $("#weirdnessRange", mount).value = String(current.weirdness);
        $("#weirdnessValue", mount).textContent = `${current.weirdness}%`;
        $$(".shape-option", mount).forEach(btn => btn.setAttribute("aria-pressed", String(btn.dataset.structure === current.structure)));
        subjectNumber = Math.max(subjectNumber, current.number);
        updateFace(mount);
        notify("Specimen restored.");
      }

      function downloadPng() {
        const svg = makeFace(current).replace("class=\"face-art\"", "");
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 1600;
            canvas.height = 1600;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas is unavailable");
            context.fillStyle = "#17171e";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(png => {
              if (!png) { notify("PNG export failed. Try again."); return; }
              downloadBlob(png, `curioid-specimen-${current.seed}.png`);
              notify("PNG exported at 1600 × 1600.");
            }, "image/png");
          } catch (error) { URL.revokeObjectURL(url); notify("The image could not be exported."); }
        };
        image.onerror = () => { URL.revokeObjectURL(url); notify("The image could not be exported."); };
        image.src = url;
      }

        let savedSettings = {}, rawSettings = null, faceSettingsRead = false;
        try {
          rawSettings = localStorage.getItem(FACE_SETTINGS_KEY); faceSettingsRead = true; faceRawSnapshots.set(FACE_SETTINGS_KEY,rawSettings);
          if (rawSettings != null) {
            if (typeof rawSettings !== 'string' || rawSettings.length > 8192) throw new Error('The saved Face Machine settings exceed their 8 KB limit.');
            const parsedSettings = JSON.parse(rawSettings);
            if (!parsedSettings || typeof parsedSettings !== 'object' || Array.isArray(parsedSettings)) throw new Error('The saved Face Machine settings are not a valid object.');
            const allowedEyeBehaviors = new Set(['natural','restless','staring','rare','unblinking']);
            const allowedSettingsKeys = new Set(['mood','anatomy','eyeStyle','mouthStyle','structure','eyeBehavior','weirdness','motionPaused','motionVersion']);
            const validSettings = Object.keys(parsedSettings).every(key=>allowedSettingsKeys.has(key))
              && (!('mood' in parsedSettings) || FACE_ENUMS.mood.has(parsedSettings.mood))
              && (!('anatomy' in parsedSettings) || FACE_ENUMS.anatomy.has(parsedSettings.anatomy))
              && (!('eyeStyle' in parsedSettings) || FACE_ENUMS.eyeStyle.has(parsedSettings.eyeStyle))
              && (!('mouthStyle' in parsedSettings) || FACE_ENUMS.mouthStyle.has(parsedSettings.mouthStyle))
              && (!('structure' in parsedSettings) || FACE_ENUMS.structure.has(parsedSettings.structure))
              && (!('eyeBehavior' in parsedSettings) || allowedEyeBehaviors.has(parsedSettings.eyeBehavior))
              && (!('weirdness' in parsedSettings) || (typeof parsedSettings.weirdness === 'number' && Number.isFinite(parsedSettings.weirdness) && parsedSettings.weirdness >= 0 && parsedSettings.weirdness <= 100))
              && (!('motionPaused' in parsedSettings) || typeof parsedSettings.motionPaused === 'boolean')
              && (!('motionVersion' in parsedSettings) || Number.isSafeInteger(parsedSettings.motionVersion));
            if (!validSettings) markFaceStoreCorrupt(FACE_SETTINGS_KEY, 'Face Machine settings', rawSettings, 'One or more saved setting values are invalid. Defaults are shown until the original is recovered.');
            savedSettings = parsedSettings;
          }
        } catch (error) {
          markFaceStoreCorrupt(FACE_SETTINGS_KEY, 'Face Machine settings', faceSettingsRead ? rawSettings : null, error?.message || 'The saved settings could not be read.');
          savedSettings = {};
        }
        const settingControls = {
          mood: $("#moodSelect", mount),
          anatomy: $("#anatomySelect", mount),
          weirdness: $("#weirdnessRange", mount),
          eyeStyle: $("#eyeLayoutSelect", mount),
          mouthStyle: $("#mouthSelect", mount),
          eyeBehavior: $("#eyeBehaviorSelect", mount),
          structure: null
        };
        const normalizedSettings = sanitizeFaceConfig({ ...current, ...savedSettings }) || current;
        settingControls.mood.value = normalizedSettings.mood;
        settingControls.anatomy.value = normalizedSettings.anatomy;
        settingControls.weirdness.value = String(normalizedSettings.weirdness);
        settingControls.eyeStyle.value = normalizedSettings.eyeStyle;
        settingControls.mouthStyle.value = normalizedSettings.mouthStyle;
        const allowedEyeBehaviors = new Set(["natural", "restless", "staring", "rare"]);
        const requestedEyeBehavior = savedSettings.eyeBehavior === "unblinking" ? "rare" : savedSettings.eyeBehavior;
        settingControls.eyeBehavior.value = allowedEyeBehaviors.has(requestedEyeBehavior) ? requestedEyeBehavior : "natural";
        current = { ...normalizedSettings, structure: normalizedSettings.structure };
        if (savedSettings.motionPaused === true && savedSettings.motionVersion === 4) $("#faceStage", mount).classList.add("face-motion-paused");
        current.mood = settingControls.mood.value;
        current.anatomy = settingControls.anatomy.value;
        current.weirdness = Number(settingControls.weirdness.value);
        current.eyeStyle = settingControls.eyeStyle.value;
        current.mouthStyle = settingControls.mouthStyle.value;
        function persistFaceSettings() {
          if (faceCorruptStores.has(FACE_SETTINGS_KEY)) { notify('Your original Face Machine settings need recovery. Download them before resetting.'); return false; }
          const values = {
            mood: settingControls.mood.value,
            anatomy: settingControls.anatomy.value,
            weirdness: Number(settingControls.weirdness.value),
            eyeStyle: settingControls.eyeStyle.value,
            mouthStyle: settingControls.mouthStyle.value,
            eyeBehavior: settingControls.eyeBehavior.value,
            structure: $(".shape-option[aria-pressed='true']", mount)?.dataset.structure || "mixed",
            motionPaused: $("#faceStage", mount).classList.contains("face-motion-paused"),
            motionVersion: 4
          };
          return writeFaceStoredValue(FACE_SETTINGS_KEY,JSON.stringify(values),'Face Machine settings');
        }
        function applyEyeBehavior() {
          $("#faceStage", mount).dataset.eyeBehavior = settingControls.eyeBehavior.value;
          persistFaceSettings();
        }
        const generateButton = $("#generateBtn", mount);
        $("#faceResetBtn", mount).addEventListener("click", () => {
          settingControls.mood.value = "random";
          settingControls.anatomy.value = "random";
          settingControls.weirdness.value = "100";
          settingControls.eyeStyle.value = "random";
          settingControls.mouthStyle.value = "random";
          settingControls.eyeBehavior.value = "natural";
          $$(".shape-option", mount).forEach(option => option.setAttribute("aria-pressed", String(option.dataset.structure === "mixed")));
          $("#weirdnessValue", mount).textContent = "100%";
          $("#faceStage", mount).classList.remove("face-motion-paused");
          $("#faceMotionBtn", mount).setAttribute("aria-pressed", "false");
          $("#faceMotionBtn", mount).textContent = "Ⅱ  Pause movement";
          current.structure = "mixed";
          applyEyeBehavior();
          generateFace(mount);
          startFaceMotion();
          persistFaceSettings();
          notify("Face Machine settings restored. Saved specimens remain in the drawer.");
        });
        generateButton.addEventListener("click", () => {
          // Render in the next frame so the click always applies to the already-mounted experiment.
          generateButton.disabled = true;
          requestAnimationFrame(() => {
            try { generateFace(mount); startFaceMotion(); }
            catch (error) { console.error("CURIOID face generation failed:", error); notify("The machine missed a step. Try again."); }
            finally { generateButton.disabled = false; }
          });
        });
        $("#faceSurpriseBtn", mount).addEventListener("click", () => {
          const randomOption = control => control.options[Math.floor(Math.random() * control.options.length)].value;
          settingControls.mood.value = randomOption(settingControls.mood);
          settingControls.anatomy.value = randomOption(settingControls.anatomy);
          settingControls.eyeStyle.value = randomOption(settingControls.eyeStyle);
          settingControls.mouthStyle.value = randomOption(settingControls.mouthStyle);
          settingControls.eyeBehavior.value = randomOption(settingControls.eyeBehavior);
          settingControls.weirdness.value = String(Math.floor(rand(88, 101)));
          const structures = $$(".shape-option", mount);
          const chosenStructure = structures[Math.floor(Math.random() * structures.length)];
          structures.forEach(option => option.setAttribute("aria-pressed", String(option === chosenStructure)));
          current.structure = chosenStructure.dataset.structure;
          current.mood = settingControls.mood.value;
          current.anatomy = settingControls.anatomy.value;
          current.eyeStyle = settingControls.eyeStyle.value;
          current.mouthStyle = settingControls.mouthStyle.value;
          current.weirdness = Number(settingControls.weirdness.value);
          $("#weirdnessValue", mount).textContent = `${current.weirdness}%`;
          applyEyeBehavior();
          generateFace(mount);
          startFaceMotion();
          persistFaceSettings();
          notify("A new configuration has been assembled.");
        });
        $("#saveBtn", mount).addEventListener("click", () => saveCurrent(mount));
        $("#downloadBtn", mount).addEventListener("click", downloadPng);
        $("#weirdnessRange", mount).addEventListener("input", /** @param {CurioidDOMEvent} event */ event => { $("#weirdnessValue", mount).textContent = `${event.target.value}%`; current.weirdness = Number(event.target.value); });
        [settingControls.mood, settingControls.anatomy, settingControls.eyeStyle, settingControls.mouthStyle].forEach(control => control.addEventListener("change", () => {
          current.mood = settingControls.mood.value;
          current.anatomy = settingControls.anatomy.value;
          current.eyeStyle = settingControls.eyeStyle.value;
          current.mouthStyle = settingControls.mouthStyle.value;
          persistFaceSettings();
        }));
        settingControls.weirdness.addEventListener("change", persistFaceSettings);
        settingControls.eyeBehavior.addEventListener("change", applyEyeBehavior);
        $("#faceMotionBtn", mount).addEventListener("click", event => {
          const paused = $("#faceStage", mount).classList.toggle("face-motion-paused");
          event.currentTarget.setAttribute("aria-pressed", String(paused));
          event.currentTarget.textContent = paused ? "▶  Resume movement" : "Ⅱ  Pause movement";
          persistFaceSettings();
          if (paused) stopFaceMotion(); else startFaceMotion();
        });
        $$(".shape-option", mount).forEach(button => button.addEventListener("click", () => {
          $$(".shape-option", mount).forEach(option => option.setAttribute("aria-pressed", String(option === button)));
          current.structure = button.dataset.structure;
          persistFaceSettings();
        }));
        $("#clearArchiveBtn", mount).addEventListener("click", () => {
          if (faceCorruptStores.has(STORAGE_KEY)) { notify('Download the original specimen archive and reset it before clearing saved faces.'); return; }
          if (!readSaved().length) { notify("The specimen drawer is already empty."); return; }
          if (!window.confirm("Clear all saved specimens from this browser?")) return;
          if (!writeSaved([])) { notify('The specimen drawer could not be cleared. Your saved data was not changed.'); return; }
          renderArchive(mount);
          notify("The specimen drawer has been cleared.");
        });
        renderArchive(mount);
        function renderFaceRecoveryPanel() {
          let panel = $('[data-face-recovery]', mount);
          if (!faceCorruptStores.size) { panel?.remove(); return; }
          if (!panel) {
            panel = document.createElement('section');
            panel.className = 'face-data-recovery';
            panel.dataset.faceRecovery = '';
            panel.setAttribute('role', 'alert');
            panel.setAttribute('aria-live', 'polite');
            const drawer = $('.specimen-drawer', mount);
            if (drawer) drawer.parentNode.insertBefore(panel, drawer);
            else mount.prepend(panel);
          }
          panel.replaceChildren();
          const title = document.createElement('strong'); title.textContent = 'SAVED DATA NEEDS RECOVERY'; panel.append(title);
          const intro = document.createElement('p'); intro.textContent = 'CURIOID found saved data it could not safely use. Your original copy is protected from automatic replacement. Save a recovery copy in Browser Vault before choosing to reset it.'; panel.append(intro);
          for (const [key, record] of faceCorruptStores) {
            const row = document.createElement('div'); row.className = 'face-data-recovery-row';
            const detail = document.createElement('span'); detail.textContent = `${record.label}: ${record.reason}`; row.append(detail);
            const backup = document.createElement('button'); backup.type = 'button'; backup.textContent = record.downloaded ? 'Recovery copy saved' : 'Save recovery copy'; backup.disabled = record.raw == null; backup.title = record.raw == null ? 'The original bytes could not be read. Reload when browser storage access is restored.' : 'Save an exact copy of the original stored bytes.'; backup.dataset.faceRecoveryDownload = key;
            backup.addEventListener('click', async () => { const live = faceCorruptStores.get(key); if (!live || live.raw == null) return; let saved=false; try { saved=await downloadBlob(new Blob([live.raw], {type:'application/json'}), `face-machine-${key === STORAGE_KEY ? 'specimens' : 'settings'}-recovery.json`); } catch (_) {} if (!saved) { notify(`The recovery copy for ${live.label} could not be saved to Browser Vault. Reset remains locked.`); return; } if (faceCorruptStores.get(key)!==live) return; live.downloaded = true; renderFaceRecoveryPanel(); notify(`Original ${live.label} data is saved in Browser Vault. You can now choose whether to reset it.`); });
            const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset saved data'; reset.disabled = !record.downloaded; reset.dataset.faceRecoveryReset = key;
            reset.addEventListener('click', () => {
              const live = faceCorruptStores.get(key); if (!live) return;
              if (!live.downloaded) { notify('Save a recovery copy in Browser Vault before resetting it.'); return; }
              if (!window.confirm(`Reset the damaged ${live.label}? Keep the downloaded recovery copy. This cannot be undone inside CURIOID.`)) return;
              try { if(localStorage.getItem(key)!==live.raw)throw new Error('The saved record changed after the recovery copy was created. Reload before resetting.'); localStorage.removeItem(key); if(localStorage.getItem(key)!==null)throw new Error('The saved record still exists after the reset request.'); faceRawSnapshots.set(key,null); }
              catch (error) { let current;try{current=localStorage.getItem(key);}catch(readError){notify(`Reset verification failed (${String(error?.message||error).slice(0,80)}), and current storage could not be inspected (${String(readError?.message||readError).slice(0,80)}). No rollback was attempted; preserve browser storage.`);return;}if(current===null){faceRawSnapshots.set(key,null);}else if(current===live.raw){notify(`The ${live.label} was not reset. Its original bytes remain intact.`);return;}else{notify(`The ${live.label} changed in another tab. The newer value was left untouched; reload before editing.`);return;} }
              faceCorruptStores.delete(key);
              if (key === STORAGE_KEY) { faceSavedCache = []; faceSavedLoaded = true; renderArchive(mount); }
              if (key === FACE_SETTINGS_KEY) {
                savedSettings = {};
                settingControls.mood.value = 'random'; settingControls.anatomy.value = 'random'; settingControls.weirdness.value = '100';
                settingControls.eyeStyle.value = 'random'; settingControls.mouthStyle.value = 'random'; settingControls.eyeBehavior.value = 'natural';
                $('.shape-option[aria-pressed="true"]', mount)?.setAttribute('aria-pressed', 'false');
                $('.shape-option[data-structure="mixed"]', mount)?.setAttribute('aria-pressed', 'true');
                current = sanitizeFaceConfig({...current,mood:'random',anatomy:'random',weirdness:100,eyeStyle:'random',mouthStyle:'random',structure:'mixed'}) || current;
                applyEyeBehavior(); updateFace(mount); persistFaceSettings();
              }
              renderFaceRecoveryPanel(); notify(`${live.label} was reset. The downloaded original remains available to you.`);
            });
            row.append(backup, reset); panel.append(row);
          }
        }
        renderFaceRecoveryPanel();
        $("#moodSelect", mount).value = current.mood;
        $("#anatomySelect", mount).value = current.anatomy;
        $("#eyeLayoutSelect", mount).value = current.eyeStyle || "random";
        $("#mouthSelect", mount).value = current.mouthStyle || "random";
        $("#weirdnessRange", mount).value = String(current.weirdness);
        $("#weirdnessValue", mount).textContent = `${current.weirdness}%`;
        $$(".shape-option", mount).forEach(option => option.setAttribute("aria-pressed", String(option.dataset.structure === current.structure)));
        applyEyeBehavior();
        const isPaused = $("#faceStage", mount).classList.contains("face-motion-paused");
        $("#faceMotionBtn", mount).setAttribute("aria-pressed", String(isPaused));
        $("#faceMotionBtn", mount).textContent = isPaused ? "▶  Resume movement" : "Ⅱ  Pause movement";
        updateFace(mount);
        persistFaceSettings();
        // Lifecycle-managed animator: each new SVG is discovered on the next frame,
        // so generator/Surprise/restore actions never strand the motion loop.
        let faceMotionFrame = 0, faceDisposed = false, faceGlobalMotion = true, lastFaceFrame = 0, faceMotionTick = 0;
        const faceStage = $('#faceStage', mount);
        const faceSvg = () => $('#faceArt', mount);
        const blinkCurve = phase => phase < .075 ? 1 - .96 * (phase / .075) : phase < .145 ? .04 : phase < .255 ? .04 + .96 * ((phase - .145) / .11) : 1;
        function stopFaceMotion(){if(faceMotionFrame)cancelAnimationFrame(faceMotionFrame);faceMotionFrame=0;lastFaceFrame=0;}
        function animateFace(now){
          faceMotionFrame=0;
          if(faceDisposed||!mount.isConnected||document.hidden||!faceGlobalMotion||faceStage?.classList.contains('face-motion-paused'))return;
          if(lastFaceFrame&&now-lastFaceFrame<25){faceMotionFrame=requestAnimationFrame(animateFace);return;}
          lastFaceFrame=now;const svg=faceSvg(),seconds=now/1000;faceMotionTick++;
          if(svg){
            const breath=svg.querySelector('.face-breath');if(breath){const lift=Math.sin(seconds*.82)*2.1,scale=1+Math.sin(seconds*.82-.5)*.0065;breath.setAttribute('transform',`translate(0 ${lift.toFixed(2)}) translate(300 300) scale(1 ${scale.toFixed(4)}) translate(-300 -300)`);}
            const behavior=faceStage?.dataset.eyeBehavior||'natural',multiplier=behavior==='restless'?.55:behavior==='staring'?1.7:behavior==='rare'?2.5:behavior==='unblinking'?100000:1;
            const eyes=svg.querySelectorAll('.face-eye-motion');
            eyes.forEach((eye,index)=>{
              const x=Number(eye.dataset.eyeX)||300,y=Number(eye.dataset.eyeY)||300,tilt=Number(eye.dataset.eyeTilt)||0,period=Math.max(2.1,(Number(eye.dataset.eyePeriod)||4.8)*multiplier),offset=Number(eye.dataset.eyePhase)||index*.7;
              const phase=((seconds+offset)%period+period)%period,sy=behavior==='unblinking'?1:blinkCurve(phase),twitch=behavior==='restless'?1.35:.5;
              const dx=Math.sin(seconds*(.41+index*.013)+offset)*twitch,dy=Math.cos(seconds*(.33+index*.017)+offset)*twitch*.65;
              eye.setAttribute('transform',`translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${(tilt+Math.sin(seconds*.47+offset)*.35).toFixed(2)} ${x} ${y}) translate(${x} ${y}) scale(1 ${sy.toFixed(3)}) translate(${-x} ${-y})`);
              const gaze=eye.querySelector('.face-gaze');if(gaze){const gx=Number(eye.dataset.gazeX)||0,gy=Number(eye.dataset.gazeY)||0,gxv=Math.sin(seconds*(.42+index*.017)+offset)*gx,gyv=Math.cos(seconds*(.31+index*.013)+offset*1.7)*gy;gaze.setAttribute('transform',`translate(${gxv.toFixed(2)} ${gyv.toFixed(2)})`);}
              const lid=eye.querySelector('.face-eye-lid');if(lid)lid.style.opacity=String(Math.max(0,Math.min(1,(.35-sy)/.25)));
            });
            const mouth=svg.querySelector('.face-mouth-life');if(mouth)mouth.setAttribute('transform',`translate(0 ${(Math.sin(seconds*.62)*1.2).toFixed(2)})`);
            // Diagnostic marker makes a frozen loop detectable in the mounted SVG.
            if(faceMotionTick%12===0)svg.dataset.motionFrame=String(faceMotionTick);
          }
          faceMotionFrame=requestAnimationFrame(animateFace);
        }
        function startFaceMotion(){if(!faceMotionFrame&&!faceDisposed&&faceGlobalMotion&&!document.hidden&&!faceStage?.classList.contains('face-motion-paused')){lastFaceFrame=0;faceMotionFrame=requestAnimationFrame(animateFace);}}
        const onFaceVisibility=()=>{if(document.hidden)stopFaceMotion();else{lastFaceFrame=0;startFaceMotion();}};document.addEventListener('visibilitychange',onFaceVisibility);
        const globalMotionButton = $('[data-face-global-motion]', mount);
        const stage = $('#faceStage', mount);
        const syncGlobalMotion = enabled => {
          faceGlobalMotion = Boolean(enabled);
          stage.classList.toggle('face-global-motion-paused', !faceGlobalMotion);
          if (globalMotionButton) { globalMotionButton.setAttribute('aria-pressed', String(faceGlobalMotion)); globalMotionButton.textContent = faceGlobalMotion ? 'Motion ON' : 'Motion OFF'; }
          if (faceGlobalMotion) startFaceMotion(); else stopFaceMotion();
        };
        const unsubscribeMotion = window.CurioidMotion?.subscribe(syncGlobalMotion) || (() => {});
        syncGlobalMotion(window.CurioidMotion ? window.CurioidMotion.enabled : true);
        const toggleGlobalMotion = () => window.CurioidMotion?.toggle();
        globalMotionButton?.addEventListener('click', toggleGlobalMotion); startFaceMotion();
        return () => { faceDisposed = true; stopFaceMotion(); document.removeEventListener('visibilitychange', onFaceVisibility); unsubscribeMotion(); globalMotionButton?.removeEventListener('click', toggleGlobalMotion); };
  }

  if (!window.CurioidProjects?.registerCategory) throw new Error('CURIOID shared core must load before the web-experiments category bundle.');
  window.CurioidProjects.registerCategory("web-experiments", {
    "oddity-lab": [faceMachineMarkup, bindFaceMachine],
    "gravity-garden": [gravityMarkup, bindGravity],
    "pattern-engine": [patternMarkup, bindPattern],
    "impossible-objects": [impossibleMarkup, bindImpossible],
    "pixel-weather": [weatherMarkup, bindWeather],
    "dream-index": [dreamMarkup, bindDream],
    "rule-garden": [ruleGardenMarkup, bindRuleGarden],
    "pendulum-choir": [pendulumChoirMarkup, bindPendulumChoir]
  });
})();
