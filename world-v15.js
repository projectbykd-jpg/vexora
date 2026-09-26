// VEXORA WORLD v15 — 2D sandbox gameplay
// Original VEXORA implementation inspired by the genre, not a copy of Growtopia assets.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const worldId = qs.get('id') || '';
  const TILE = 32;
  const MIN_X = -64, MAX_X = 64, MIN_Y = 0, MAX_Y = 40;
  const HOTBAR = ['grass','dirt','stone','wood','sand','brick','glass','grass_seed','crystal_seed'];
  const BLOCKS = {
    grass:{name:'Grass',color:'#55cf78',hard:180}, dirt:{name:'Dirt',color:'#98613f',hard:240},
    stone:{name:'Stone',color:'#7f8996',hard:520}, wood:{name:'Wood',color:'#9b6942',hard:350},
    leaf:{name:'Leaf',color:'#349452',hard:140}, sand:{name:'Sand',color:'#dfc17a',hard:170},
    crystal:{name:'Vexa Crystal',color:'#55d9ef',hard:650}, gold:{name:'Vexa Ore',color:'#e5bb42',hard:820},
    brick:{name:'Brick',color:'#ad574f',hard:500}, glass:{name:'Glass',color:'#bfefff',hard:220}
  };
  const SEEDS = {grass_seed:{name:'Meadow Seed',color:'#86d96b'},crystal_seed:{name:'Vexa Crystal Seed',color:'#83eaff'}};
  const ITEM_VISUALS = {...BLOCKS,...SEEDS};
  let inventory = Object.fromEntries(Object.keys(ITEM_VISUALS).map(k => [k, k === 'grass' ? 120 : 0]));
  const blocks = new Map();
  const plants = new Map();
  const keys = new Set();

  const atlas = new Image(); atlas.src='./assets/vexora-atlas.svg';
  let atlasReady = false; atlas.onload=()=>{atlasReady=true;};
  const ATLAS = {grass:[0,0],dirt:[32,0],stone:[64,0],wood:[96,0],leaf:[128,0],sand:[160,0],brick:[192,0],glass:[224,0],crystal:[256,0],gold:[288,0],foundation:[320,0],grass_seed:[0,32],crystal_seed:[32,32]};
  const canvas = $('worldCanvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  let meta = {name:'VEXORA1', type:'normal', seed:1337};
  let selected = 0;
  let cameraX = 0;
  let cameraY = 20;
  let paused = false;
  let modal = '';
  let chatOpen = false;
  let mining = null;
  let hover = null;
  let last = performance.now();
  let lastChatId = 0;
  let saveTimer = null;
  let presenceTimer = 0;
  let chatTimer = 0;
  let playSeconds = 0;
  let pointer = {x:innerWidth/2,y:innerHeight/2,inside:false};
  let player = {x:0,y:10,vx:0,vy:0,w:.70,h:1.65,grounded:false,face:1,jumpLatch:false};
  let remotes = new Map();
  let locks = [];
  let particles = [];
  let punch = {until:0, dir:1, x:0, y:0};
  let walkTime = 0;
  let touchTarget = null;
  let touchDevice = false;
  let gamepadTimer = 0;
  let gamepadPunchLast = false;
  let gamepadBuildLast = false;
  let equipment = {};
  let drops = new Map();
  let worldSettings = {description:'',max_players:20,min_level:1,spawn_x:0,spawn_y:20,background:'day'};
  let lastDropSync = 0;
  let audioCtx = null;
  let lastSfx = 0;
  function sfx(kind){
    const now=performance.now(); if(now-lastSfx<35)return; lastSfx=now;
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended')audioCtx.resume();
      const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime;
      const map={punch:[120,.055,'square'],break:[85,.09,'sawtooth'],place:[420,.07,'triangle'],jump:[300,.07,'square'],harvest:[620,.08,'sine']};
      const [f,d,type]=map[kind]||map.place; o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(40,f*.72),t+d);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(audioCtx.destination);o.start(t);o.stop(t+d+.01);
    }catch(e){}
  }

  function key(x,y){ return `${x},${y}`; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function toast(text,type='ok'){ const el=$('toast'); el.textContent=text; el.dataset.type=type; el.classList.add('show'); clearTimeout(window.__vxToast); window.__vxToast=setTimeout(()=>el.classList.remove('show'),1900); }
  async function api(url,opt={}){ const r=await fetch(url,{credentials:'include',...opt}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`HTTP ${r.status}`); return d; }

  function seeded(x,seed){ const n=Math.sin((x+seed*.013)*12.9898)*43758.5453; return n-Math.floor(n); }
  function terrainHeight(x,seed){ return Math.floor(19+Math.sin((x+seed%97)*.12)*2+Math.sin((x+seed%31)*.035)*3+seeded(x,seed)*2); }
  function addBlock(x,y,type){ if(!BLOCKS[type]||x<MIN_X||x>MAX_X||y<MIN_Y||y>MAX_Y)return; blocks.set(key(x,y),{x,y,type}); }
  function removeBlock(x,y){ blocks.delete(key(x,y)); }
  function getBlock(x,y){ return blocks.get(key(Math.floor(x),Math.floor(y))); }
  function getPlant(x,y){ return plants.get(key(Math.floor(x),Math.floor(y))); }
  function solid(x,y){ return !!getBlock(x,y); }

  function generateWorld(){
    blocks.clear();
    const seed=Number(meta.seed)||1337;
    for(let x=MIN_X;x<=MAX_X;x++){
      const top=terrainHeight(x,seed);
      for(let y=0;y<=top;y++){
        let type=y===top?'grass':y>=top-3?'dirt':'stone';
        if(y<6&&seeded(x+y*7,seed+4)>.93) type='gold';
        if(y>4&&y<top-2&&seeded(x*3+y,seed+8)>.975) type='crystal';
        addBlock(x,y,type);
      }
      if(seeded(x*3,seed+2)>.84){
        const t=top+1; addBlock(x,t,'wood'); addBlock(x,t+1,'wood');
        for(let dx=-2;dx<=2;dx++)for(let dy=2;dy<=4;dy++)if(Math.abs(dx)+Math.abs(dy-3)<=3)addBlock(x+dx,t+dy-1,'leaf');
      }
    }
    spawn();
  }
  function surfaceAt(x){ const ix=Math.round(x); for(let y=MAX_Y;y>=0;y--)if(solid(ix,y))return y; return 0; }
  function spawn(){ const top=surfaceAt(0); player.x=0; player.y=Math.min(top+1,MAX_Y-1); cameraX=player.x; cameraY=player.y; player.vx=0; player.vy=0; player.grounded=false; player.face=1; }
  function loadBlocks(list){
    if(Array.isArray(list)&&list.length){
      blocks.clear();
      for(const b of list){ const x=Number(b.x),y=Number(b.y),type=String(b.type||''); if(Number.isInteger(x)&&Number.isInteger(y)&&BLOCKS[type])addBlock(x,y,type); }
      spawn();
    }else generateWorld();
  }

  function resize(){
    const dpr=Math.min(devicePixelRatio||1,2); canvas.width=Math.floor(innerWidth*dpr); canvas.height=Math.floor(innerHeight*dpr);
    canvas.style.width=innerWidth+'px'; canvas.style.height=innerHeight+'px'; ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize',resize); resize();
  function worldX(x){ return innerWidth/2+(x-cameraX)*TILE; }
  function worldY(y){ return innerHeight*0.58-(y-cameraY)*TILE; }
  function screenToWorld(sx,sy){
    const wx=(sx-innerWidth/2)/TILE+cameraX;
    const wy=cameraY+(innerHeight*0.58-sy)/TILE;
    // Blocks render from their y coordinate downward, while world physics
    // treats y as the block's lower world coordinate. Ceil keeps the pointer
    // inside the exact visible tile instead of selecting the tile below it.
    return {x:Math.floor(wx),y:Math.ceil(wy-0.000001)};
  }

  function drawBackground(){
    const mode=worldSettings.background||'day';
    const palettes={
      day:['#72d7ff','#d6f7ff','#f7fcff'],
      sunset:['#ff9b9b','#f8c0df','#ffdca8'],
      night:['#141c4a','#303b78','#5b5da2'],
      space:['#090a22','#171653','#3a2874']
    };
    const p=palettes[mode]||palettes.day;
    const g=ctx.createLinearGradient(0,54,0,innerHeight);g.addColorStop(0,p[0]);g.addColorStop(.6,p[1]);g.addColorStop(1,p[2]);ctx.fillStyle=g;ctx.fillRect(0,54,innerWidth,innerHeight);
    if(mode==='night'||mode==='space'){
      ctx.fillStyle='rgba(255,255,255,.85)';
      for(let i=0;i<70;i++){const x=((i*173-cameraX*0.35)%(innerWidth+40))-20,y=64+((i*97)%Math.max(160,innerHeight*.62));const s=i%7===0?2:1;ctx.fillRect(x,y,s,s);}
      if(mode==='night'){ctx.fillStyle='rgba(230,235,255,.9)';ctx.beginPath();ctx.arc(innerWidth-100,95,28,0,Math.PI*2);ctx.fill();ctx.fillStyle=p[0];ctx.beginPath();ctx.arc(innerWidth-89,87,26,0,Math.PI*2);ctx.fill();}
    }else{
      ctx.fillStyle='rgba(255,255,255,.65)';
      for(let i=0;i<7;i++){const x=((i*320-cameraX*4)%(innerWidth+380))-170,y=92+(i%3)*64;ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.arc(x+24,y-1,24,0,Math.PI*2);ctx.arc(x+51,y+1,17,0,Math.PI*2);ctx.fill();}
      if(mode==='sunset'){ctx.fillStyle='rgba(255,211,110,.62)';ctx.beginPath();ctx.arc(innerWidth-110,112,38,0,Math.PI*2);ctx.fill();}
    }
    ctx.fillStyle=mode==='space'?'rgba(90,67,130,.35)':'rgba(92,114,186,.16)';
    for(let i=0;i<6;i++){const x=((i*410-cameraX*1.7)%(innerWidth+520))-220;ctx.beginPath();ctx.ellipse(x,innerHeight-145,240,58,0,0,Math.PI*2);ctx.fill();}
    // Far terrain silhouettes add depth without hiding the playable layer.
    ctx.fillStyle=mode==='space'?'rgba(35,35,72,.6)':'rgba(82,105,165,.2)';
    for(let i=0;i<8;i++){const x=i*190-(cameraX*.35%190)-220;ctx.beginPath();ctx.arc(x,innerHeight-105,150+(i%2)*35,Math.PI,Math.PI*2);ctx.fill();}
  }

  function drawGrid(){ /* Pixel-art world: no visible editor grid. */ }
  function tileNoise(x,y,salt=0){
    const n=Math.sin((x*127.1+y*311.7+salt*74.7)*0.017)*43758.5453;
    return n-Math.floor(n);
  }
  function pixelRect(sx,sy,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(sx),Math.round(sy),Math.round(w),Math.round(h));}
  function drawAtlas(srcX,srcY,sw,sh,dx,dy,dw,dh,alpha=1){
    if(!atlasReady)return false;
    ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=false;
    ctx.drawImage(atlas,srcX,srcY,sw,sh,Math.round(dx),Math.round(dy),Math.round(dw),Math.round(dh));ctx.restore();return true;
  }
  function drawBlock(b){
    const sx=worldX(b.x),sy=worldY(b.y),s=TILE,d=BLOCKS[b.type];
    const sprite=ATLAS[b.type];
    if(sprite){if(drawAtlas(sprite[0],sprite[1],32,32,sx,sy,s,s)){ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(sx+1,sy+1,s-2,1);return;}}
    if(sx<-s||sx>innerWidth+s||sy<-s||sy>innerHeight)return;
    const edge=Math.max(2,Math.floor(s*.07));
    // Base + chunky pixel bevel.
    pixelRect(sx,sy,s,s,d.color);
    pixelRect(sx+1,sy+1,s-2,Math.max(2,edge), 'rgba(255,255,255,.18)');
    pixelRect(sx+1,sy+s-edge-1,s-2,edge,'rgba(0,0,0,.16)');
    pixelRect(sx+1,sy+1,edge,s-2,'rgba(255,255,255,.08)');
    pixelRect(sx+s-edge-1,sy+1,edge,s-2,'rgba(0,0,0,.08)');

    if(b.type==='grass'){
      pixelRect(sx+1,sy+1,s-2,Math.max(4,Math.floor(s*.16)),'#39aa5d');
      const count=4;
      for(let i=0;i<count;i++){const px=sx+4+Math.floor(tileNoise(b.x+i,b.y,2)*(s-9)), ph=2+Math.floor(tileNoise(b.x+i+8,b.y,3)*4);pixelRect(px,sy+2,2,ph,'#80e58b');}
      for(let i=0;i<3;i++){const px=sx+5+Math.floor(tileNoise(b.x+i,b.y,9)*(s-10));const py=sy+Math.floor(s*.42)+Math.floor(tileNoise(b.x+i,b.y,11)*(s*.38));pixelRect(px,py,2,2,'rgba(62,119,67,.32)');}
    } else if(b.type==='dirt'){
      for(let i=0;i<7;i++){const px=sx+4+Math.floor(tileNoise(b.x+i,b.y,20)*(s-8)),py=sy+7+Math.floor(tileNoise(b.x+i+2,b.y,21)*(s-11));pixelRect(px,py,2+(i%2),2,'rgba(83,48,31,.30)');}
      pixelRect(sx+4,sy+s-7,5,2,'rgba(255,184,116,.09)');
    } else if(b.type==='stone'){
      ctx.strokeStyle='rgba(35,44,54,.30)';ctx.lineWidth=2;
      const a=sx+6,b1=sy+8,c=sx+14,d1=sy+16;
      ctx.beginPath();ctx.moveTo(a,b1);ctx.lineTo(c,d1);ctx.lineTo(sx+10,sy+24);ctx.moveTo(sx+21,sy+7);ctx.lineTo(sx+17,sy+13);ctx.lineTo(sx+24,sy+18);ctx.stroke();
      pixelRect(sx+5,sy+5,3,3,'rgba(255,255,255,.12)');pixelRect(sx+22,sy+24,4,3,'rgba(0,0,0,.12)');
    } else if(b.type==='wood'){
      pixelRect(sx+4,sy+4,s-8,s-8,'rgba(55,30,15,.08)');
      for(let i=0;i<3;i++){ctx.strokeStyle='rgba(59,35,22,.38)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+7+i*8,sy+3);ctx.lineTo(sx+7+i*8,sy+s-3);ctx.stroke();}
      pixelRect(sx+5,sy+5,4,4,'rgba(255,224,152,.18)');
    } else if(b.type==='leaf'){
      for(let i=0;i<8;i++){const px=sx+4+Math.floor(tileNoise(b.x+i,b.y,40)*(s-9)),py=sy+4+Math.floor(tileNoise(b.x+i+4,b.y,41)*(s-9));pixelRect(px,py,4,4,i%3===0?'#61c86c':'#2f934f');}
      pixelRect(sx+7,sy+7,4,3,'rgba(255,255,255,.10)');
    } else if(b.type==='sand'){
      for(let i=0;i<8;i++){const px=sx+4+Math.floor(tileNoise(b.x+i,b.y,50)*(s-8)),py=sy+5+Math.floor(tileNoise(b.x+i+4,b.y,51)*(s-10));pixelRect(px,py,2,2,'rgba(135,96,47,.26)');}
    } else if(b.type==='brick'){
      const row=Math.floor(s*.5);ctx.strokeStyle='rgba(83,41,40,.34)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx,sy+row);ctx.lineTo(sx+s,sy+row);ctx.moveTo(sx+s*.5,sy);ctx.lineTo(sx+s*.5,sy+row);ctx.moveTo(sx+s*.25,sy+row);ctx.lineTo(sx+s*.25,sy+s);ctx.moveTo(sx+s*.75,sy+row);ctx.lineTo(sx+s*.75,sy+s);ctx.stroke();
    } else if(b.type==='glass'){
      ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+5,sy+s-5);ctx.lineTo(sx+s-7,sy+6);ctx.stroke();pixelRect(sx+7,sy+5,8,2,'rgba(255,255,255,.24)');
    } else if(b.type==='crystal'){
      ctx.fillStyle='rgba(232,255,255,.55)';ctx.beginPath();ctx.moveTo(sx+s*.5,sy+4);ctx.lineTo(sx+s-7,sy+s*.52);ctx.lineTo(sx+s*.5,sy+s-4);ctx.lineTo(sx+7,sy+s*.52);ctx.closePath();ctx.fill();
      pixelRect(sx+10,sy+7,5,4,'rgba(255,255,255,.58)');
      pixelRect(sx+s-11,sy+s-12,4,5,'rgba(36,126,164,.22)');
    } else if(b.type==='gold'){
      pixelRect(sx+7,sy+8,6,6,'#fff0a4');pixelRect(sx+20,sy+18,5,5,'#f1c84f');pixelRect(sx+16,sy+24,3,3,'#fff7ba');
    }
  }

  function drawPlant(p){
    const sx=worldX(p.x),base=worldY(p.y)+TILE-2,cfg=SEEDS[p.seedItemId]||SEEDS.grass_seed,stage=Math.max(0,Math.min(4,Number(p.stage)||0));
    if(stage<=0)return;
    const h=7+stage*5;
    ctx.save();ctx.lineWidth=Math.max(2,Math.floor(TILE/10));ctx.strokeStyle=cfg.color;ctx.lineCap='square';
    ctx.beginPath();ctx.moveTo(sx+TILE/2,base);ctx.lineTo(sx+TILE/2,base-h);ctx.stroke();
    const leaf=cfg.color;ctx.fillStyle=leaf;
    if(stage>=1){pixelRect(sx+8,base-h+5,7,4,leaf);pixelRect(sx+TILE-15,base-h+2,7,4,leaf);}
    if(stage>=2){pixelRect(sx+5,base-h+12,8,4,leaf);pixelRect(sx+TILE-13,base-h+9,8,4,leaf);}
    if(stage>=3){pixelRect(sx+12,base-h-2,12,8,leaf);}
    if(p.ready){ctx.strokeStyle='#fff2a5';ctx.lineWidth=2;ctx.strokeRect(sx+2,worldY(p.y)+2,TILE-4,TILE-4);}
    ctx.restore();
  }

  function drawCharacter(px,footY,face=1,state='idle',phase=0,label=''){
    if(atlasReady){
      const frame=state==='punch'?(phase%260<130?3:4):(state==='walk'?(Math.floor(phase/150)%2?1:2):0);
      const sx=frame*32,sy=72,scale=Math.max(.85,Math.min(1.5,TILE/32));
      const dw=32*scale,dh=48*scale,dx=Math.round(px-dw/2),dy=Math.round(footY-dh+3);
      ctx.save();ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='rgba(25,15,37,.22)';ctx.fillRect(px-10,footY+2,20,3);
      ctx.translate(face<0?dx+dw:dx,dy);ctx.scale(face<0?-1:1,1);ctx.drawImage(atlas,sx,sy,32,48,0,0,dw,dh);ctx.restore();
      // Cosmetic equipment: original VEXORA cap and backpack silhouettes.
      if(equipment.backpack){ctx.fillStyle='#5a3f78';ctx.fillRect(px-17,footY-31,5,12);ctx.fillStyle='#8b67a8';ctx.fillRect(px-18,footY-28,3,7);}
      if(equipment.explorer_cap){ctx.fillStyle='#ff7edb';ctx.fillRect(px-11,dy+1,22,5);ctx.fillStyle='#ffe8f8';ctx.fillRect(px-8,dy,10,3);}

      if(label){ctx.textAlign='center';ctx.font='800 10px Arial';ctx.fillStyle='rgba(19,15,30,.88)';ctx.fillText(label,px,dy-4);ctx.textAlign='left';}
      return;
    }
    const s=Math.max(1,Math.floor(TILE/16)), ox=px-8*s;
    const bob=state==='idle'?Math.floor(Math.sin(phase*.002)*1):Math.floor(Math.sin(phase*.014)*1);
    const fy=footY-bob;
    const skin='#f1b48a', outline='#33203f', hair='#51336f', shirt='#d86bd2', pants='#5875ce', shoe='#eef6ff';
    ctx.save();ctx.imageSmoothingEnabled=false;
    // shadow
    ctx.fillStyle='rgba(24,18,42,.22)';ctx.fillRect(ox+2*s,fy+1*s,12*s,2*s);
    let legA=1,legB=1, arm=-1;
    if(state==='walk'){legA=phase%2<1?0:2;legB=2-legA;arm=legA===0?-1:1;}
    const bodyTop=fy-12*s, headTop=bodyTop-8*s;
    // legs
    pixelRect(ox+3*s,fy-5*s,4*s,5*s,pants);pixelRect(ox+9*s,fy-5*s,4*s,5*s,pants);
    if(state==='walk'){ if(legA===0){pixelRect(ox+2*s,fy-4*s,4*s,4*s,pants);pixelRect(ox+10*s,fy-6*s,4*s,6*s,pants);} else {pixelRect(ox+3*s,fy-6*s,4*s,6*s,pants);pixelRect(ox+10*s,fy-4*s,4*s,4*s,pants);} }
    pixelRect(ox+2*s,fy,5*s,2*s,shoe);pixelRect(ox+9*s,fy,5*s,2*s,shoe);
    // torso
    pixelRect(ox+3*s,bodyTop,10*s,7*s,outline);pixelRect(ox+4*s,bodyTop+1*s,8*s,5*s,shirt);pixelRect(ox+5*s,bodyTop+1*s,6*s,2*s,'rgba(255,255,255,.22)');
    // arms
    if(state==='punch'){pixelRect(ox+(face>0?12:0)*s,bodyTop+1*s,4*s,3*s,skin);pixelRect(ox+(face>0?15: -2)*s,bodyTop+1*s,3*s,3*s,'#ffe7d0');}
    else {pixelRect(ox+1*s,bodyTop+1*s,3*s,6*s,skin);pixelRect(ox+12*s,bodyTop+1*s,3*s,6*s,skin);}
    // neck/head
    pixelRect(ox+5*s,bodyTop-1*s,6*s,3*s,skin);pixelRect(ox+2*s,headTop,12*s,9*s,outline);pixelRect(ox+3*s,headTop+1*s,10*s,7*s,skin);
    // hair
    pixelRect(ox+3*s,headTop+1*s,10*s,3*s,hair);pixelRect(ox+2*s,headTop+2*s,3*s,4*s,hair);
    // eye / face direction
    pixelRect(ox+(face>0?10:4)*s,headTop+4*s,2*s,2*s,'#21182d');
    // accessory shine
    pixelRect(ox+4*s,headTop+2*s,4*s,1*s,'rgba(255,255,255,.25)');
    if(state==='punch'){
      const bx=ox+(face>0?17:-5)*s,by=bodyTop+1*s;pixelRect(bx,by,3*s,3*s,'#fff1a8');pixelRect(bx+(face>0?3:-3)*s,by+1*s,2*s,2*s,'#ff79d9');
    }
    if(label){ctx.textAlign='center';ctx.font='800 10px Arial';ctx.fillStyle='rgba(19,15,30,.88)';ctx.fillText(label,px,headTop-4*s);ctx.textAlign='left';}
    ctx.restore();
 
  }

  function drawRemote(p){const sx=worldX(p.x),foot=worldY(p.y-1);if(sx<-80||sx>innerWidth+80)return;drawCharacter(sx,foot,Number(p.face)<0?-1:1,'idle',performance.now(), '@'+(p.username||'Explorer'));}
  function drawPlayer(){
    const foot=worldY(player.y-1),state=performance.now()<punch.until?'punch':Math.abs(player.vx)>.6?'walk':'idle';
    drawCharacter(worldX(player.x),foot,player.face,state,performance.now(),'You');
  }

  function drawTargetCell(){
    if((!pointer.inside&&!touchTarget)||paused||modal)return;
    const p=(touchDevice&&touchTarget)?touchTarget:screenToWorld(pointer.x,pointer.y),sx=worldX(p.x),sy=worldY(p.y);
    const occupied=!!getBlock(p.x,p.y),reachable=inReach(p.x,p.y);
    ctx.save();
    ctx.strokeStyle=reachable?(occupied?'rgba(255,225,133,.75)':'rgba(255,255,255,.38)'):'rgba(255,110,140,.28)';
    ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.strokeRect(sx+1.5,sy+1.5,TILE-3,TILE-3);ctx.setLineDash([]);
    ctx.restore();
  }

  function drawHover(){
    if((!pointer.inside&&!touchTarget)||paused||modal)return;
    const p=(touchDevice&&touchTarget)?touchTarget:screenToWorld(pointer.x,pointer.y),b=getBlock(p.x,p.y),plant=getPlant(p.x,p.y);hover=p;
    if(!b&&!plant)return;
    const sx=worldX(p.x),sy=worldY(p.y),name=plant?.ready?'READY TO HARVEST':(b?BLOCKS[b.type].name:'Growing');
    ctx.font='800 10px Arial';const tw=ctx.measureText(name).width+14;
    let tx=sx+TILE/2-tw/2,ty=sy-26;tx=clamp(tx,6,innerWidth-tw-6);if(ty<58)ty=sy+TILE+6;
    ctx.fillStyle='rgba(21,15,35,.92)';ctx.fillRect(tx,ty,tw,20);
    ctx.strokeStyle=plant?.ready?'rgba(131,243,167,.65)':'rgba(255,255,255,.16)';ctx.strokeRect(tx+.5,ty+.5,tw-1,19);
    ctx.fillStyle=plant?.ready?'#a8ffd0':'#fff8ea';ctx.fillText(name,tx+7,ty+14);
  }

  function spawnParticles(x,y,type='break'){
    const colors={grass:'#7ae68b',dirt:'#b6784d',stone:'#aeb6c4',wood:'#d29a63',leaf:'#70d980',sand:'#f5d68a',brick:'#d4776d',crystal:'#9cf6ff',gold:'#ffe67d',glass:'#dffaff'};
    for(let i=0;i<9;i++){const a=Math.random()*Math.PI*2,speed=1.2+Math.random()*2.7;particles.push({x:x+.5,y:y+.5,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed+2,life:.35+Math.random()*.35,size:2+Math.random()*3,color:colors[type]||'#fff'});}
  }
  function updateParticles(dt){
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=11*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
  }
  function drawParticles(){
    for(const p of particles){ctx.save();ctx.globalAlpha=Math.max(0,p.life/.7);ctx.fillStyle=p.color;const s=Math.max(1,p.size);ctx.fillRect(worldX(p.x),worldY(p.y),s,s);ctx.restore();}
  }
  function drawMining(){
    if(!mining)return;
    const b=getBlock(mining.x,mining.y);if(!b){mining=null;return;}
    if(!inReach(mining.x,mining.y)){mining=null;return;}
    const p=clamp((performance.now()-mining.started)/BLOCKS[b.type].hard,0,1),sx=worldX(b.x),sy=worldY(b.y);
    ctx.strokeStyle='rgba(255,236,148,.85)';ctx.lineWidth=2;ctx.strokeRect(sx+3,sy+3,TILE-6,TILE-6);
    // Pixel-style crack marks that grow as the punch continues.
    ctx.strokeStyle='rgba(35,25,42,.48)';ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(sx+6,sy+8);ctx.lineTo(sx+12+p*8,sy+15);ctx.lineTo(sx+9,sy+24);
    if(p>.35){ctx.moveTo(sx+22,sy+6);ctx.lineTo(sx+17,sy+15);ctx.lineTo(sx+25,sy+23);}
    if(p>.7){ctx.moveTo(sx+12,sy+20);ctx.lineTo(sx+22,sy+16);}
    ctx.stroke();
    if(p>=1&&!mining.processing){
      mining.processing=true;const target={x:b.x,y:b.y,z:0};
      breakBlock(target.x,target.y,target.z).finally(()=>{if(mining&&mining.x===target.x&&mining.y===target.y)mining=null;});
    }
  }

  async function loadLocks(){
    if(!worldId)return;
    try{
      const d=await api(`/api/locks?worldId=${encodeURIComponent(worldId)}`);
      locks=Array.isArray(d.locks)?d.locks:[];
    }catch(e){locks=[];}
  }

  function drawLocks(){
    for(const lock of locks){
      const sx=worldX(lock.x1), sy=worldY(lock.y2), w=(lock.x2-lock.x1+1)*TILE, h=(lock.y2-lock.y1+1)*TILE;
      if(sx+w<0||sx>innerWidth||sy+h<55||sy>innerHeight)continue;
      ctx.fillStyle='rgba(237,118,214,.08)';ctx.fillRect(sx,sy,w,h);
      ctx.strokeStyle='rgba(237,118,214,.42)';ctx.lineWidth=1;ctx.strokeRect(sx+.5,sy+.5,w-1,h-1);
    }
  }

  async function createAreaLock(){
    if(!worldId){toast('Create a world first','error');return;}
    const x=Math.round(player.x), y=Math.round(player.y);
    try{
      await api(`/api/locks?worldId=${encodeURIComponent(worldId)}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({x1:x-3,y1:Math.max(1,y-3),x2:x+3,y2:Math.min(MAX_Y,y+3)})
      });
      await loadLocks();
      toast('7×7 area locked');
    }catch(e){toast(e.message,'error');}
  }

  function drawDrops(){
    for(const d of drops.values()){
      const sx=worldX(d.x),sy=worldY(d.y)-4;
      if(sx<-50||sx>innerWidth+50||sy<50||sy>innerHeight+30)continue;
      const def=ITEM_VISUALS[d.item_id]||{color:'#fff',name:d.item_id};
      ctx.save();
      ctx.globalAlpha=.96;ctx.fillStyle='rgba(25,18,38,.2)';ctx.fillRect(sx-10,sy+12,20,4);
      const sp=ATLAS[d.item_id];
      if(sp){drawAtlas(sp[0],sp[1],32,32,sx-10,sy-10,20,20);}else{
        ctx.fillStyle=def.color||'#fff';ctx.fillRect(sx-8,sy-8,16,16);
        ctx.fillStyle='rgba(255,255,255,.25)';ctx.fillRect(sx-6,sy-6,5,4);
      }
      ctx.fillStyle='#fff';ctx.font='800 8px Arial';ctx.textAlign='center';ctx.fillText('×'+d.quantity,sx,sy+20);ctx.textAlign='left';ctx.restore();
    }
  }
  function draw(){
    ctx.clearRect(0,0,innerWidth,innerHeight);drawBackground();drawGrid();
    const sx=Math.floor(cameraX-innerWidth/TILE/2)-2,ex=Math.ceil(cameraX+innerWidth/TILE/2)+2;
    drawLocks();
    drawDrops();
    for(const b of blocks.values())if(b.x>=sx&&b.x<=ex)drawBlock(b);
    for(const p of plants.values())if(p.x>=sx&&p.x<=ex)drawPlant(p);
    for(const p of remotes.values())drawRemote(p);drawPlayer();drawParticles();drawTargetCell();drawHover();drawMining();
  }

  function collides(x,y){
    const left=x-player.w/2,right=x+player.w/2,bottom=y,top=y+player.h;
    for(let tx=Math.floor(left);tx<=Math.floor(right);tx++)for(let ty=Math.floor(bottom);ty<=Math.floor(top);ty++)if(solid(tx,ty))return true;
    return false;
  }
  function physics(dt){
    if(paused)return;
    const accel=keys.has('shift')?42:30;
    if(keys.has('a')||keys.has('arrowleft')){player.vx-=accel*dt;player.face=-1;} if(keys.has('d')||keys.has('arrowright')){player.vx+=accel*dt;player.face=1;}
    if(!keys.has('a')&&!keys.has('arrowleft')&&!keys.has('d')&&!keys.has('arrowright'))player.vx*=Math.pow(.001,dt); player.vx=clamp(player.vx,-7,7); player.vy-=23*dt;
    if((keys.has(' ')||keys.has('arrowup'))&&!player.jumpLatch&&player.grounded){player.vy=9.4;player.grounded=false;sfx('jump');} player.jumpLatch=keys.has(' ')||keys.has('arrowup');
    let nx=player.x+player.vx*dt;if(!collides(nx,player.y))player.x=nx;else player.vx=0;
    let ny=player.y+player.vy*dt;if(!collides(player.x,ny)){player.y=ny;player.grounded=false;}else{if(player.vy<0){player.y=Math.floor(ny)+1;player.grounded=true;}player.vy=0;}
    if(player.y<-3)spawn(); player.x=clamp(player.x,MIN_X+.5,MAX_X-.5);
    cameraX+=(player.x-cameraX)*Math.min(1,dt*9);
    cameraY+=(player.y-cameraY)*Math.min(1,dt*6);
    cameraY=clamp(cameraY,8,32);
    const half=innerWidth/TILE/2;cameraX=clamp(cameraX,MIN_X+half,MAX_X-half);
    $('coords').textContent=`${Math.round(player.x)} / ${Math.round(player.y)}`;
  }

  async function breakBlock(x,y,z=0){
    const b=getBlock(x,y); if(!b||y===0)return;
    if(worldId){
      try{
        const d=await api('/api/game/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          worldId,action:'break',x,y,z,playerX:player.x,playerY:player.y
        })});
        removeBlock(x,y); inventory[b.type]=(inventory[b.type]||0)+1; renderHotbar();renderInventory(); spawnParticles(x,y,b.type); punch={until:performance.now()+170,dir:player.face,x,y};
        toast('+1 '+(BLOCKS[b.type]?.name||d.itemId));
      }catch(e){toast(e.message,'error');}
      return;
    }
    removeBlock(x,y); inventory[b.type]=(inventory[b.type]||0)+1; renderHotbar();renderInventory();spawnParticles(x,y,b.type);punch={until:performance.now()+170,dir:player.face,x,y};queueSave();toast('+1 '+BLOCKS[b.type].name);
  }
  function playerCenter(){ return {x:player.x, y:player.y + player.h*0.5}; }
  function blockCenter(x,y){ return {x:x+0.5, y:y+0.5}; }
  function inReach(x,y,reach=6.25){
    const a=playerCenter(), b=blockCenter(x,y);
    return Math.hypot(a.x-b.x,a.y-b.y) <= reach;
  }
  async function beginMine(){
    if(paused||modal)return;
    const p=targetForAction(),plant=getPlant(p.x,p.y),b=getBlock(p.x,p.y);
    if(plant?.ready){sfx('harvest');await harvestPlant(p.x,p.y);return;}
    const drop=nearestDropAt(p.x+.5,p.y+.5);if(drop){await pickupDrop(drop.id);return;}
    if(!b)return;
    if(!inReach(p.x,p.y)){toast('Too far away','error');return;}
    sfx('punch');punch={until:performance.now()+180,dir:Math.sign((p.x+.5)-player.x)||player.face,x:p.x,y:p.y};
    mining={x:p.x,y:p.y,started:performance.now(),processing:false};
  }
  function stopMine(){mining=null;}
  async function placeBlock(){
    if(paused||modal)return;
    const p=targetForAction(),type=HOTBAR[selected];
    if(SEEDS[type]){await plantSeed(p.x,p.y,type);return;}
    if(!inReach(p.x,p.y)){toast('Move closer to place','error');return;}
    if(getBlock(p.x,p.y))return;
    if(!inventory[type]){toast(`No ${BLOCKS[type].name}`,'error');return;}
    if(p.x<MIN_X||p.x>MAX_X||p.y<0||p.y>MAX_Y)return;
    const adjacent=getBlock(p.x+1,p.y)||getBlock(p.x-1,p.y)||getBlock(p.x,p.y+1)||getBlock(p.x,p.y-1);
    if(!adjacent){toast('Place next to a block','error');return;}
    if(collides(p.x+.5,p.y+0.01))return;
    if(worldId){
      try{
        await api('/api/game/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          worldId,action:'place',x:p.x,y:p.y,z:0,itemId:type,playerX:player.x,playerY:player.y
        })});
      }catch(e){toast(e.message,'error');return;}
    }
    addBlock(p.x,p.y,type);inventory[type]--;renderHotbar();renderInventory();spawnParticles(p.x,p.y,type);sfx('place');punch={until:performance.now()+100,dir:Math.sign((p.x+.5)-player.x)||player.face,x:p.x,y:p.y};
    if(!worldId)queueSave();
  }
  async function loadPlants(){
    if(!worldId)return;
    try{
      const d=await api('/api/farming?worldId='+encodeURIComponent(worldId));
      plants.clear();
      for(const p of d.plants||[])plants.set(key(Number(p.x),Number(p.y)),{...p,x:Number(p.x),y:Number(p.y),stage:Number(p.stage)||0,ready:!!p.ready});
    }catch(e){}
  }
  async function plantSeed(x,y,seedItemId){
    if(!worldId){toast('Farming is available inside a saved world','error');return;}
    if(x<MIN_X||x>MAX_X||y<=0||y>MAX_Y)return;
    if(getBlock(x,y)||getPlant(x,y)){toast('That tile is occupied','error');return;}
    if(!inventory[seedItemId]){toast('No '+(SEEDS[seedItemId]?.name||'seed'),'error');return;}
    try{
      await api('/api/farming?worldId='+encodeURIComponent(worldId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'plant',x,y,seedItemId})});
      inventory[seedItemId]--; renderHotbar();renderInventory(); await loadPlants(); toast('Seed planted');
    }catch(e){toast(e.message,'error');}
  }
  async function harvestPlant(x,y){
    if(!worldId)return;
    try{
      const d=await api('/api/farming?worldId='+encodeURIComponent(worldId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'harvest',x,y})});
      plants.delete(key(x,y)); await loadInventory(); toast('Harvested '+(d.itemId||'crop'));
    }catch(e){toast(e.message,'error');}
  }
  function renderHotbar(){
    const root=$('hotbar');root.innerHTML='';HOTBAR.forEach((t,i)=>{const d=ITEM_VISUALS[t];const b=document.createElement('button');b.className='slot '+(i===selected?'selected':'');b.innerHTML=`<span class="num">${i+1}</span><i style="background:${d.color}"></i><b>${inventory[t]||0}</b>`;b.title=`${i+1} · ${d.name}`;b.onclick=(e)=>{e.stopPropagation();selected=i;renderHotbar();};root.appendChild(b);});
    $('selectedName').textContent=ITEM_VISUALS[HOTBAR[selected]].name;
  }
  function renderInventory(){
    const root=$('inventoryGrid');root.innerHTML='';Object.entries(ITEM_VISUALS).forEach(([t,d])=>{const b=document.createElement('button');b.className='inv-item';b.innerHTML=`<i style="background:${d.color}"></i><span><strong>${d.name}</strong><small>${inventory[t]||0} owned</small></span>`;b.onclick=()=>{const i=HOTBAR.indexOf(t);if(i>=0){selected=i;renderHotbar();closeModal();}};root.appendChild(b);});
  }
  function openModal(type){modal=type;paused=true;document.querySelectorAll('.modal').forEach(x=>x.hidden=true);const el=$(type+'Modal');if(el)el.hidden=false;if(type==='inventory')renderInventory();stopMine();}
  function closeModal(){document.querySelectorAll('.modal').forEach(x=>x.hidden=true);modal='';paused=false;}

  async function loadEquipment(){
    try{
      const d=await api('/api/equipment'); equipment=Object.fromEntries((d.equipment||[]).map(e=>[e.slot,e.item_id||null]));
    }catch(e){equipment={};}
  }
  async function loadWorldSettings(){
    if(!worldId)return;
    try{
      const d=await api('/api/world/settings?worldId='+encodeURIComponent(worldId));
      worldSettings=d.settings||worldSettings;
    }catch(e){}
  }
  async function loadDrops(){
    if(!worldId)return;
    try{
      const d=await api('/api/drops?worldId='+encodeURIComponent(worldId));
      drops.clear();for(const x of d.drops||[])drops.set(String(x.id),{...x,id:String(x.id),x:Number(x.x),y:Number(x.y),z:Number(x.z),quantity:Number(x.quantity)});
    }catch(e){}
  }
  function nearestDropAt(x,y){
    let hit=null,best=0.9;
    for(const d of drops.values()){const dist=Math.hypot(d.x-x,d.y-y);if(dist<best){best=dist;hit=d;}}
    return hit;
  }
  async function pickupDrop(id){
    const d=drops.get(String(id));if(!d)return;
    if(!inReach(d.x,d.y)){toast('Move closer to pick it up','error');return;}
    try{
      const out=await api('/api/drops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pickup',worldId,id,playerX:player.x,playerY:player.y})});
      drops.delete(String(id));await loadInventory();sfx('harvest');toast('Picked up '+(ITEM_VISUALS[out.itemId]?.name||out.itemId)+' × '+out.quantity);
    }catch(e){toast(e.message,'error');}
  }
  async function dropSelected(quantity=1){
    const type=HOTBAR[selected];
    if(!worldId||!inventory[type]){toast('Nothing to drop','error');return;}
    try{
      const out=await api('/api/drops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'drop',worldId,itemId:type,quantity:Math.max(1,Math.min(quantity,inventory[type])),x:player.x+player.face*.7,y:Math.max(1,player.y)})});
      inventory[type]-=Math.max(1,Math.min(quantity,inventory[type]));renderHotbar();renderInventory();
      drops.set(String(out.id),{id:String(out.id),x:player.x+player.face*.7,y:Math.max(1,player.y),z:0,item_id:type,quantity:Math.max(1,Math.min(quantity,inventory[type]+0))});
      spawnParticles(player.x+.5,player.y,type);toast('Dropped '+ITEM_VISUALS[type].name);
    }catch(e){toast(e.message,'error');}
  }
  async function loadInventory(){
    try{
      const d=await api('/api/inventory');
      const next=Object.fromEntries(Object.keys(ITEM_VISUALS).map(k=>[k,0]));
      for(const item of d.items||[])if(Object.prototype.hasOwnProperty.call(next,item.id))next[item.id]=Number(item.quantity)||0;
      inventory={...inventory,...next};
      touchDevice='ontouchstart' in window||navigator.maxTouchPoints>0;
  document.body.classList.toggle('touch-device',touchDevice);
  renderHotbar();renderInventory();
    }catch(e){console.warn('inventory load failed',e);}
  }

  async function loadServer(){
    try{const d=await api(`/api/worlds?${worldId?`id=${encodeURIComponent(worldId)}`:''}`);const w=d.world||((d.worlds||[]).find(v=>String(v.id)===String(worldId)));if(w)meta=w;}catch(e){console.warn(e);}
    try{if(worldId){const d=await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`);if(Array.isArray(d.blocks)&&d.blocks.length)loadBlocks(d.blocks);else generateWorld();}else generateWorld();}catch(e){console.warn(e);generateWorld();}
    await loadInventory();
    await loadEquipment();
    await loadWorldSettings();
    await loadLocks();
    await loadPlants();
    await loadDrops();
    $('worldName').textContent=meta.name||'VEXORA WORLD';$('worldMode').textContent=(meta.type||'normal').toUpperCase();
  }
  function queueSave(){clearTimeout(saveTimer);$('saveState').textContent='SAVING…';$('saveState').dataset.state='saving';saveTimer=setTimeout(saveWorld,1200);}
  async function saveWorld(){
    if(!worldId)return; try{const payload=[...blocks.values()].map(b=>({x:b.x,y:b.y,z:0,type:b.type}));await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:payload})});$('saveState').textContent='SYNCED';$('saveState').dataset.state='ok';}catch(e){$('saveState').textContent='SAVE ERROR';$('saveState').dataset.state='error';toast(e.message,'error');}
  }

  function addChat(user,text){const row=document.createElement('div');row.className='chat-row';row.innerHTML=`<b>@${escapeHtml(user)}</b><span>${escapeHtml(text)}</span>`;$('chatMessages').appendChild(row);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
  async function pollChat(){
    if(!worldId)return;try{const d=await api(`/api/chat?worldId=${encodeURIComponent(worldId)}&after=${lastChatId}`);for(const m of d.messages||[]){lastChatId=Math.max(lastChatId,Number(m.id)||0);addChat(m.username||m.displayName||'Explorer',m.message);}}catch(e){}
  }
  async function sendChat(text){
    if(!worldId||!text.trim())return;try{const d=await api(`/api/chat?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text.trim()})});if(d.message){lastChatId=Math.max(lastChatId,Number(d.message.id)||0);addChat(d.message.username||'You',d.message.message);}}catch(e){toast(e.message,'error');}
  }
  function openChat(){chatOpen=true;paused=true;$('chatPanel').classList.add('open');setTimeout(()=>$('chatInput').focus(),30);}
  function closeChat(){chatOpen=false;$('chatPanel').classList.remove('open');if(!modal)paused=false;}

  async function syncPresence(){
    if(!worldId)return;try{await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:player.x,y:player.y,z:0,yaw:player.face})});const d=await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`);const seen=new Set();for(const p of d.players||[]){if(p.userId===d.meId)continue;seen.add(String(p.userId));remotes.set(String(p.userId),{x:Number(p.x)||0,y:Number(p.y)||0,username:p.username||'Explorer',face:Number(p.yaw)||1});}for(const id of remotes.keys())if(!seen.has(id))remotes.delete(id);$('playerCount').textContent=`${Math.max(1,(d.players||[]).length)} online`;}catch(e){}
  }

  function targetForAction(){
    if(touchDevice && touchTarget) return touchTarget;
    return screenToWorld(pointer.x,pointer.y);
  }
  function setTouchTargetFromPointer(){
    const p=screenToWorld(pointer.x,pointer.y);
    if(p.x>=MIN_X&&p.x<=MAX_X&&p.y>=0&&p.y<=MAX_Y) touchTarget={x:p.x,y:p.y};
  }
  function setVirtualKey(k,on){
    if(on)keys.add(k); else keys.delete(k);
  }
  function bindHoldButton(id,key){
    const el=$(id); if(!el)return;
    const down=e=>{e.preventDefault();e.stopPropagation();setVirtualKey(key,true);el.classList.add('pressed');};
    const up=e=>{e.preventDefault();e.stopPropagation();setVirtualKey(key,false);el.classList.remove('pressed');};
    ['pointerdown'].forEach(ev=>el.addEventListener(ev,down,{passive:false}));
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,up,{passive:false}));
  }
  function bindActionButton(id,fn,hold=false){
    const el=$(id); if(!el)return;
    if(!hold){el.addEventListener('pointerdown',async e=>{e.preventDefault();e.stopPropagation();el.classList.add('pressed');try{await fn();}finally{setTimeout(()=>el.classList.remove('pressed'),90);}}, {passive:false});return;}
    const down=async e=>{e.preventDefault();e.stopPropagation();el.classList.add('pressed');await fn();};
    const up=e=>{e.preventDefault();e.stopPropagation();el.classList.remove('pressed');stopMine();};
    el.addEventListener('pointerdown',down,{passive:false});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev,up,{passive:false}));
  }
  function setPointer(e){
    const r=canvas.getBoundingClientRect();
    pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.inside=true;
    if(e.pointerType==='touch'){touchDevice=true;setTouchTargetFromPointer();}
  }
  canvas.addEventListener('pointermove',setPointer);
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'){pointer.inside=false;hover=null;}});
  canvas.addEventListener('pointerdown',e=>{
    setPointer(e);
    if(e.pointerType==='touch'){
      e.preventDefault();
      // Touch uses tap-to-select, then explicit PUNCH/BUILD controls.
      return;
    }
    if(e.button===0){beginMine();}else if(e.button===2){e.preventDefault();placeBlock();}
  });
  canvas.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'&&e.button===0)stopMine();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{selected=(selected+(e.deltaY>0?1:-1)+HOTBAR.length)%HOTBAR.length;renderHotbar();e.preventDefault();},{passive:false});

  // Mobile / touch controls.
  bindHoldButton('touchLeft','a');
  bindHoldButton('touchRight','d');
  bindActionButton('touchJump',()=>{keys.add(' ');setTimeout(()=>keys.delete(' '),95);});
  bindActionButton('touchPunch',()=>beginMine(),true);
  bindActionButton('touchBuild',()=>placeBlock());
  const touchCycle=$('touchCycle');
  touchCycle?.addEventListener('click',()=>{selected=(selected+1)%HOTBAR.length;renderHotbar();});
  const touchBag=$('touchBag');
  touchBag?.addEventListener('click',()=>{if(modal==='inventory')closeModal();else openModal('inventory');});
  const touchChat=$('touchChat');
  touchChat?.addEventListener('click',()=>chatOpen?closeChat():openChat());



  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['w','a','s','d','shift',' ','arrowleft','arrowright','arrowup'].includes(k))keys.add(k);
    if(e.repeat&&['e','t','escape','h','q'].includes(k))return;
    if(/^\d$/.test(k)){const n=Number(k);if(n>=1&&n<=9){selected=n-1;renderHotbar();}}
    if(k==='e'){if(modal==='inventory')closeModal();else if(!chatOpen)openModal('inventory');}
    if(k==='t'){if(chatOpen)closeChat();else openChat();}
    if(k==='h'){if(modal==='help')closeModal();else if(!chatOpen)openModal('help');}
    if(k==='q'){dropSelected(1);}
    if(k==='escape'){if(chatOpen)closeChat();else if(modal)closeModal();else openModal('menu');}
    if(k==='enter'&&chatOpen){e.preventDefault();$('chatForm').requestSubmit();}
    if(chatOpen||modal)e.preventDefault();
  });
  addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());});

  $('chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('chatInput');const text=input.value.trim();if(!text)return;input.value='';await sendChat(text);});
  $('chatClose').onclick=closeChat;
  $('inventoryButton').onclick=()=>openModal('inventory');
  $('chatButton').onclick=()=>chatOpen?closeChat():openChat();
  $('helpButton').onclick=()=>openModal('help');
  $('menuButton').onclick=()=>openModal('menu');
  $('saveButton').onclick=()=>saveWorld();
  $('lockAreaButton')?.addEventListener('click',createAreaLock);
  $('closeInventory').onclick=closeModal;$('closeHelp').onclick=closeModal;$('closeMenu').onclick=closeModal;
  $('exitWorld').onclick=()=>{location.href='./worlds.html';};

  function pollGamepad(){
    const gp=navigator.getGamepads?.()[0]; if(!gp)return;
    const x=gp.axes?.[0]||0, punchNow=!!gp.buttons?.[2]?.pressed, buildNow=!!gp.buttons?.[1]?.pressed;
    setVirtualKey('a',x<-.25);setVirtualKey('d',x>.25);
    if(gp.buttons?.[0]?.pressed)keys.add(' ');else keys.delete(' ');
    if(punchNow&&!gamepadPunchLast)beginMine();
    if(!punchNow&&gamepadPunchLast)stopMine();
    if(buildNow&&!gamepadBuildLast)placeBlock();
    gamepadPunchLast=punchNow;gamepadBuildLast=buildNow;
  }

  function loop(now){
    const dt=Math.min(.033,(now-last)/1000);last=now; if(!paused){physics(dt);playSeconds+=dt;updateParticles(dt);} if(now-gamepadTimer>80){gamepadTimer=now;pollGamepad();} draw();
    presenceTimer+=dt;chatTimer+=dt;if(presenceTimer>2){presenceTimer=0;syncPresence();}if(worldId&&now-lastDropSync>2500&&!modal){lastDropSync=now;loadDrops();}if(chatTimer>1.2){chatTimer=0;pollChat();if(Math.floor(now/5000)!==Math.floor((now-dt*1000)/5000))loadPlants();}
    requestAnimationFrame(loop);
  }

  renderHotbar();renderInventory();loadServer().then(()=>{pollChat();syncPresence();});
  requestAnimationFrame(loop);
  addEventListener('beforeunload',()=>{if(worldId)navigator.sendBeacon?.(`/api/presence?worldId=${encodeURIComponent(worldId)}`,'');});
})();
