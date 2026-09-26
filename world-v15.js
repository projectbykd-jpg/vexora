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
  function screenToWorld(sx,sy){ return {x:Math.floor((sx-innerWidth/2)/TILE+cameraX),y:Math.floor(cameraY+(innerHeight*0.58-sy)/TILE)}; }

  function drawBackground(){
    const g=ctx.createLinearGradient(0,54,0,innerHeight); g.addColorStop(0,'#8bd8f4');g.addColorStop(.55,'#c8efff');g.addColorStop(1,'#f4fbff');ctx.fillStyle=g;ctx.fillRect(0,54,innerWidth,innerHeight);
    ctx.fillStyle='rgba(255,255,255,.58)';
    for(let i=0;i<8;i++){const x=((i*320-cameraX*5)%(innerWidth+380))-170,y=100+(i%3)*62;ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.arc(x+24,y-1,24,0,Math.PI*2);ctx.arc(x+51,y+1,17,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='rgba(92,114,186,.12)';
    for(let i=0;i<5;i++){const x=((i*410-cameraX*2)%(innerWidth+500))-220;ctx.beginPath();ctx.ellipse(x,innerHeight-145,240,58,0,0,Math.PI*2);ctx.fill();}
  }
  function drawGrid(){
    // VEXORA uses block seams instead of a full-screen grid, keeping the world
    // readable and closer to a classic 2D sandbox presentation.
  }
  function drawBlock(b){
    const sx=worldX(b.x),sy=worldY(b.y),d=BLOCKS[b.type]; if(sx<-TILE||sx>innerWidth+TILE||sy<-TILE||sy>innerHeight)return;
    ctx.fillStyle=d.color;ctx.fillRect(sx,sy,TILE,TILE);
    ctx.strokeStyle='rgba(22,35,48,.16)';ctx.lineWidth=1;ctx.strokeRect(sx+.5,sy+.5,TILE-1,TILE-1);
    ctx.fillStyle='rgba(255,255,255,.14)';ctx.fillRect(sx+2,sy+2,TILE-4,4);
    ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(sx+2,sy+TILE-6,TILE-4,4);
    if(b.type==='grass'){ctx.fillStyle='#2d9c58';ctx.fillRect(sx+2,sy+1,TILE-4,5);}
    if(b.type==='dirt'){ctx.fillStyle='rgba(70,39,25,.18)';for(let i=0;i<4;i++){ctx.fillRect(sx+6+i*6,sy+11+(i%2)*8,3,3);}}
    if(b.type==='stone'){ctx.strokeStyle='rgba(30,38,47,.2)';ctx.beginPath();ctx.moveTo(sx+6,sy+9);ctx.lineTo(sx+14,sy+16);ctx.lineTo(sx+9,sy+24);ctx.moveTo(sx+22,sy+7);ctx.lineTo(sx+17,sy+14);ctx.stroke();}
    if(b.type==='wood'){ctx.strokeStyle='rgba(55,30,15,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+9,sy+4);ctx.lineTo(sx+9,sy+28);ctx.moveTo(sx+20,sy+4);ctx.lineTo(sx+20,sy+28);ctx.stroke();}
    if(b.type==='leaf'){ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(sx+7,sy+8,7,7);}
    if(b.type==='crystal'){ctx.fillStyle='rgba(255,255,255,.44)';ctx.beginPath();ctx.moveTo(sx+16,sy+4);ctx.lineTo(sx+26,sy+16);ctx.lineTo(sx+16,sy+28);ctx.lineTo(sx+7,sy+16);ctx.closePath();ctx.fill();}
    if(b.type==='gold'){ctx.fillStyle='rgba(255,248,150,.72)';ctx.fillRect(sx+7,sy+8,5,5);ctx.fillRect(sx+20,sy+19,4,4);}
    if(b.type==='brick'){ctx.strokeStyle='rgba(74,32,30,.25)';ctx.beginPath();ctx.moveTo(sx+1,sy+16);ctx.lineTo(sx+31,sy+16);ctx.moveTo(sx+15,sy+1);ctx.lineTo(sx+15,sy+16);ctx.moveTo(sx+25,sy+16);ctx.lineTo(sx+25,sy+31);ctx.stroke();}
  }
  function drawPlant(p){
    const sx=worldX(p.x),base=worldY(p.y)+TILE-2;
    const cfg=SEEDS[p.seedItemId]||SEEDS.grass_seed;
    const stage=Math.max(0,Math.min(4,Number(p.stage)||0));
    if(stage<=0)return;
    const h=8+stage*5;
    ctx.save();ctx.strokeStyle=cfg.color;ctx.lineWidth=4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(sx+TILE/2,base);ctx.lineTo(sx+TILE/2,base-h);ctx.stroke();
    if(stage>=1){ctx.fillStyle=cfg.color;ctx.beginPath();ctx.arc(sx+TILE/2-5,base-h+7,4,0,Math.PI*2);ctx.arc(sx+TILE/2+5,base-h+4,4,0,Math.PI*2);ctx.fill();}
    if(stage>=3){ctx.fillStyle='#f4e58a';ctx.fillRect(sx+13,base-h-4,6,6);}
    if(p.ready){ctx.strokeStyle='#fff3a1';ctx.lineWidth=1.5;ctx.strokeRect(sx+3,worldY(p.y)+3,TILE-6,TILE-6);}
    ctx.restore();
  }
  function drawRemote(p){
    const sx=worldX(p.x),sy=worldY(p.y-1)-TILE*1.58; if(sx<-60||sx>innerWidth+60)return;
    ctx.save();ctx.translate(sx-TILE*.36,sy);ctx.fillStyle='#252044';ctx.fillRect(8,24,17,27);ctx.fillStyle='#b87ce8';ctx.fillRect(6,8,21,18);ctx.fillStyle='#161226';ctx.fillRect(p.face<0?8:20,14,4,4);ctx.fillStyle='#63d8ff';ctx.fillRect(9,50,6,7);ctx.fillRect(19,50,6,7);ctx.restore();
    ctx.textAlign='center';ctx.font='700 10px Inter,Arial';ctx.fillStyle='rgba(16,16,27,.86)';ctx.fillText('@'+(p.username||'Explorer'),sx,sy-7);ctx.textAlign='left';
  }
  function drawPlayer(){
    const sx=worldX(player.x)-TILE*.36,sy=worldY(player.y-1)-TILE*1.58;ctx.save();ctx.translate(sx,sy);ctx.fillStyle='#292245';ctx.fillRect(8,24,17,27);ctx.fillStyle='#ef7bd9';ctx.fillRect(6,8,21,18);ctx.fillStyle='#171225';ctx.fillRect(player.face>0?20:8,14,4,4);ctx.fillStyle='#64d8ff';ctx.fillRect(9,50,6,7);ctx.fillRect(19,50,6,7);ctx.fillStyle='rgba(255,255,255,.32)';ctx.fillRect(8,9,18,3);ctx.restore();
    ctx.textAlign='center';ctx.font='800 10px Inter,Arial';ctx.fillStyle='rgba(12,12,20,.86)';ctx.fillText('You',worldX(player.x),sy-7);ctx.textAlign='left';
  }
  function drawTargetCell(){
    if(!pointer.inside||paused||modal)return;
    const p=screenToWorld(pointer.x,pointer.y);
    const sx=worldX(p.x), sy=worldY(p.y);
    const occupied=!!getBlock(p.x,p.y);
    const reachable=inReach(p.x,p.y);
    ctx.save();
    ctx.strokeStyle=reachable ? (occupied ? 'rgba(255,126,220,.95)' : 'rgba(107,222,255,.45)') : 'rgba(255,105,130,.38)';
    ctx.lineWidth=2;
    ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);
    if(!occupied){
      ctx.fillStyle=reachable?'rgba(107,222,255,.045)':'rgba(255,105,130,.035)';
      ctx.fillRect(sx+2,sy+2,TILE-4,TILE-4);
    }
    // Tiny center reticle so the exact hit/build cell is obvious.
    const cx=sx+TILE/2,cy=sy+TILE/2;
    ctx.beginPath();ctx.moveTo(cx-4,cy);ctx.lineTo(cx+4,cy);ctx.moveTo(cx,cy-4);ctx.lineTo(cx,cy+4);ctx.stroke();
    ctx.restore();
  }
  function drawHover(){
    if(!pointer.inside||paused||modal)return; const p=screenToWorld(pointer.x,pointer.y),b=getBlock(p.x,p.y);hover=p;
    if(!b)return; const sx=worldX(p.x),sy=worldY(p.y);ctx.strokeStyle='#ef79d9';ctx.lineWidth=2;ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);
    const name=BLOCKS[b.type].name;ctx.font='700 10px Inter,Arial';const tw=ctx.measureText(name).width+16;let tx=sx+TILE/2-tw/2,ty=sy-28;tx=clamp(tx,8,innerWidth-tw-8);if(ty<62)ty=sy+TILE+7;ctx.fillStyle='rgba(10,13,23,.9)';ctx.fillRect(tx,ty,tw,22);ctx.fillStyle='#fff';ctx.fillText(name,tx+8,ty+15);
  }
  function drawMining(){
    if(!mining)return;
    const b=getBlock(mining.x,mining.y);
    if(!b){mining=null;return;}
    if(!inReach(mining.x,mining.y)){mining=null;return;}
    const p=clamp((performance.now()-mining.started)/BLOCKS[b.type].hard,0,1),sx=worldX(b.x),sy=worldY(b.y);
    ctx.strokeStyle='#f18be0';ctx.lineWidth=3;ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);
    ctx.fillStyle='rgba(10,13,23,.75)';ctx.fillRect(sx+4,sy+TILE-8,TILE-8,4);
    ctx.fillStyle='#65d8ff';ctx.fillRect(sx+4,sy+TILE-8,(TILE-8)*p,4);
    if(p>=1&&!mining.processing){
      mining.processing=true;
      const target={x:b.x,y:b.y,z:0};
      breakBlock(target.x,target.y,target.z).finally(()=>{
        if(mining&&mining.x===target.x&&mining.y===target.y)mining=null;
      });
    }
    // Punch direction marker: visually confirms the exact block being hit.
    const pc=playerCenter(),bc=blockCenter(b.x,b.y);
    const px=worldX(pc.x),py=worldY(pc.y),tx=worldX(bc.x),ty=worldY(bc.y);
    const dx=tx-px,dy=ty-py,len=Math.max(1,Math.hypot(dx,dy));
    ctx.save();ctx.strokeStyle='rgba(255,244,177,.9)';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+dx/len*10,py+dy/len*10);ctx.stroke();ctx.restore();
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

  function draw(){
    ctx.clearRect(0,0,innerWidth,innerHeight);drawBackground();drawGrid();
    const sx=Math.floor(cameraX-innerWidth/TILE/2)-2,ex=Math.ceil(cameraX+innerWidth/TILE/2)+2;
    drawLocks();
    for(const b of blocks.values())if(b.x>=sx&&b.x<=ex)drawBlock(b);
    for(const p of plants.values())if(p.x>=sx&&p.x<=ex)drawPlant(p);
    for(const p of remotes.values())drawRemote(p);drawPlayer();drawTargetCell();drawHover();drawMining();
  }

  function collides(x,y){
    const left=x-player.w/2,right=x+player.w/2,bottom=y,top=y+player.h;
    for(let tx=Math.floor(left);tx<=Math.floor(right);tx++)for(let ty=Math.floor(bottom);ty<=Math.floor(top);ty++)if(solid(tx,ty))return true;
    return false;
  }
  function physics(dt){
    if(paused)return;
    const accel=keys.has('shift')?42:30;
    if(keys.has('a')){player.vx-=accel*dt;player.face=-1;} if(keys.has('d')){player.vx+=accel*dt;player.face=1;}
    if(!keys.has('a')&&!keys.has('d'))player.vx*=Math.pow(.001,dt); player.vx=clamp(player.vx,-7,7); player.vy-=23*dt;
    if(keys.has(' ')&&!player.jumpLatch&&player.grounded){player.vy=9.4;player.grounded=false;} player.jumpLatch=keys.has(' ');
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
        removeBlock(x,y); inventory[b.type]=(inventory[b.type]||0)+1; renderHotbar();renderInventory();
        toast('+1 '+(BLOCKS[b.type]?.name||d.itemId));
      }catch(e){toast(e.message,'error');}
      return;
    }
    removeBlock(x,y); inventory[b.type]=(inventory[b.type]||0)+1; renderHotbar();renderInventory();queueSave();toast('+1 '+BLOCKS[b.type].name);
  }
  function playerCenter(){ return {x:player.x, y:player.y + player.h*0.5}; }
  function blockCenter(x,y){ return {x:x+0.5, y:y+0.5}; }
  function inReach(x,y,reach=6.25){
    const a=playerCenter(), b=blockCenter(x,y);
    return Math.hypot(a.x-b.x,a.y-b.y) <= reach;
  }
  async function beginMine(){
    if(paused||modal)return;
    const p=screenToWorld(pointer.x,pointer.y),b=getBlock(p.x,p.y);
    if(!b)return;
    if(!inReach(p.x,p.y)){toast('Too far away','error');return;}
    mining={x:p.x,y:p.y,started:performance.now(),processing:false};
  }
  function stopMine(){mining=null;}
  async function placeBlock(){
    if(paused||modal)return;
    const p=screenToWorld(pointer.x,pointer.y),type=HOTBAR[selected];
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
    addBlock(p.x,p.y,type);inventory[type]--;renderHotbar();renderInventory();
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

  async function loadInventory(){
    try{
      const d=await api('/api/inventory');
      const next=Object.fromEntries(Object.keys(ITEM_VISUALS).map(k=>[k,0]));
      for(const item of d.items||[])if(Object.prototype.hasOwnProperty.call(next,item.id))next[item.id]=Number(item.quantity)||0;
      inventory={...inventory,...next};
      renderHotbar();renderInventory();
    }catch(e){console.warn('inventory load failed',e);}
  }

  async function loadServer(){
    try{const d=await api(`/api/worlds?${worldId?`id=${encodeURIComponent(worldId)}`:''}`);const w=d.world||((d.worlds||[]).find(v=>String(v.id)===String(worldId)));if(w)meta=w;}catch(e){console.warn(e);}
    try{if(worldId){const d=await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`);if(Array.isArray(d.blocks)&&d.blocks.length)loadBlocks(d.blocks);else generateWorld();}else generateWorld();}catch(e){console.warn(e);generateWorld();}
    await loadInventory();
    await loadLocks();
    await loadPlants();
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

  function setPointer(e){const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;pointer.inside=true;}
  canvas.addEventListener('pointermove',setPointer);
  canvas.addEventListener('pointerleave',()=>{pointer.inside=false;hover=null;});
  canvas.addEventListener('pointerdown',e=>{setPointer(e);if(e.button===0){beginMine();}else if(e.button===2){e.preventDefault();placeBlock();}});
  canvas.addEventListener('pointerup',e=>{if(e.button===0)stopMine();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{selected=(selected+(e.deltaY>0?1:-1)+HOTBAR.length)%HOTBAR.length;renderHotbar();e.preventDefault();},{passive:false});

  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['w','a','s','d','shift',' '].includes(k))keys.add(k);
    if(e.repeat&&['e','t','escape','h'].includes(k))return;
    if(/^\d$/.test(k)){const n=Number(k);if(n>=1&&n<=9){selected=n-1;renderHotbar();}}
    if(k==='e'){if(modal==='inventory')closeModal();else if(!chatOpen)openModal('inventory');}
    if(k==='t'){if(chatOpen)closeChat();else openChat();}
    if(k==='h'){if(modal==='help')closeModal();else if(!chatOpen)openModal('help');}
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

  function loop(now){
    const dt=Math.min(.033,(now-last)/1000);last=now; if(!paused){physics(dt);playSeconds+=dt;} draw();
    presenceTimer+=dt;chatTimer+=dt;if(presenceTimer>2){presenceTimer=0;syncPresence();}if(chatTimer>1.2){chatTimer=0;pollChat();if(Math.floor(now/5000)!==Math.floor((now-dt*1000)/5000))loadPlants();}
    requestAnimationFrame(loop);
  }

  renderHotbar();renderInventory();loadServer().then(()=>{pollChat();syncPresence();});
  requestAnimationFrame(loop);
  addEventListener('beforeunload',()=>{if(worldId)navigator.sendBeacon?.(`/api/presence?worldId=${encodeURIComponent(worldId)}`,'');});
})();
