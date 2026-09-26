// VEXORA 2D sandbox - Growtopia-inspired side-view prototype, original VEXORA presentation.
const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const worldId = qs.get('id') || '';

const TILE = 32;
const WORLD_MIN_X = -64;
const WORLD_MAX_X = 64;
const WORLD_MIN_Y = 0;
const WORLD_MAX_Y = 40;

const BLOCKS = {
  grass: { name:'Grass', color:'#55cf78', hard:180 },
  dirt: { name:'Dirt', color:'#98613f', hard:220 },
  stone: { name:'Stone', color:'#87919e', hard:520 },
  wood: { name:'Wood', color:'#9b6740', hard:350 },
  leaf: { name:'Leaf', color:'#318f51', hard:140 },
  sand: { name:'Sand', color:'#e0c37b', hard:160 },
  crystal: { name:'Crystal', color:'#56d9ee', hard:650 },
  gold: { name:'Vexa Ore', color:'#e6bd45', hard:800 },
  brick: { name:'Brick', color:'#ad5950', hard:500 }
};
const HOTBAR = ['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick'];
const blocks = new Map();
const inventory = Object.fromEntries(HOTBAR.map(k => [k, 99]));
const keys = new Set();

let worldMeta = { name:'VEXORA1', type:'normal', seed:1337 };
let selected = 0;
let cameraX = 0;
let player = { x:0, y:10, vx:0, vy:0, w:.72, h:1.65, grounded:false, face:1, jumpLatch:false };
let mining = null;
let started = true;
let paused = false;
let chatOpen = false;
let last = performance.now();

const canvas = $('worldCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function key(x,y){ return `${x},${y}`; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function seeded(x,seed){ const n=Math.sin((x+seed*0.013)*12.9898)*43758.5453; return n-Math.floor(n); }
function terrainHeight(x,seed){ return Math.floor(21 + Math.sin((x+seed%97)*.12)*2 + Math.sin((x+seed%31)*.035)*3 + seeded(x,seed)*2); }
function addBlock(x,y,type){ if(!BLOCKS[type] || x<WORLD_MIN_X || x>WORLD_MAX_X || y<WORLD_MIN_Y || y>WORLD_MAX_Y) return; blocks.set(key(x,y), {x,y,type}); }
function removeBlock(x,y){ blocks.delete(key(x,y)); }
function getBlock(x,y){ return blocks.get(key(x,y)); }
function isSolid(x,y){ return !!getBlock(Math.floor(x),Math.floor(y)); }

function generateWorld(){
  blocks.clear(); const seed=Number(worldMeta.seed)||1337;
  for(let x=WORLD_MIN_X;x<=WORLD_MAX_X;x++){
    const top=terrainHeight(x,seed);
    for(let y=0;y<=top;y++){
      let type=y===top?'grass':y>=top-3?'dirt':'stone';
      if(y<5 && seeded(x+y*7,seed+4)>.93) type='gold';
      addBlock(x,y,type);
    }
    if(seeded(x*3,seed+2)>.84){
      const trunk=top+1; addBlock(x,trunk,'wood'); addBlock(x,trunk+1,'wood');
      for(let dx=-2;dx<=2;dx++) for(let dy=2;dy<=4;dy++) if(Math.abs(dx)+Math.abs(dy-3)<=3) addBlock(x+dx,trunk+dy-1,'leaf');
    }
    if(seeded(x*5,seed+9)>.91){ const yy=Math.max(4,top-4); addBlock(x,yy,'crystal'); }
  }
  spawnPlayer();
}
function spawnPlayer(){ const top=surfaceAt(0); player.x=0; player.y=top+1; player.vx=0; player.vy=0; player.grounded=false; }
function surfaceAt(x){ for(let y=WORLD_MAX_Y;y>=0;y--) if(getBlock(Math.round(x),y)) return y; return 0; }
function loadBlocks(list){
  if(Array.isArray(list)&&list.length){ blocks.clear(); for(const b of list){ if(Number.isInteger(Number(b.x))&&Number.isInteger(Number(b.y))&&BLOCKS[b.type]) addBlock(Number(b.x),Number(b.y),b.type); } spawnPlayer(); }
  else generateWorld();
}
async function loadServer(){
  try{
    const r=await fetch(`/api/worlds?${worldId?`id=${encodeURIComponent(worldId)}`:''}`,{credentials:'include'});
    if(r.ok){ const d=await r.json(); const w=d.world||((d.worlds||[]).find(v=>String(v.id)===String(worldId))); if(w){ worldMeta=w; updateWorldMeta(); } }
  }catch(e){ console.warn('World metadata unavailable',e); }
  try{
    if(worldId){ const r=await fetch(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{credentials:'include'}); if(r.ok){ const d=await r.json(); if(Array.isArray(d.blocks)&&d.blocks.length) loadBlocks(d.blocks); } }
  }catch(e){ console.warn('Using generated VEXORA world',e); }
  updateWorldMeta();
}
function updateWorldMeta(){ $('worldName').textContent=worldMeta.name||'VEXORA WORLD'; $('worldType').textContent=(worldMeta.type||'normal').toUpperCase(); $('statusText').textContent='ONLINE'; }
function resize(){ const dpr=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight; canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); canvas.style.width=w+'px'; canvas.style.height=h+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); }
addEventListener('resize',resize); resize();
function worldToScreenX(x){ return innerWidth/2+(x-cameraX)*TILE; }
function worldToScreenY(y){ return innerHeight-92-y*TILE; }
function screenToWorld(sx,sy){ return {x:Math.floor((sx-innerWidth/2)/TILE+cameraX),y:Math.floor((innerHeight-92-sy)/TILE)}; }

function drawBackground(){
  const g=ctx.createLinearGradient(0,58,0,innerHeight); g.addColorStop(0,'#72c9f0'); g.addColorStop(.62,'#b7e9ff'); g.addColorStop(1,'#e7f7ff'); ctx.fillStyle=g; ctx.fillRect(0,58,innerWidth,innerHeight);
  ctx.fillStyle='rgba(255,255,255,.55)';
  for(let i=0;i<7;i++){ const x=((i*310-cameraX*8)%(innerWidth+300))-150,y=100+(i%3)*65; ctx.beginPath(); ctx.arc(x,y,18,0,Math.PI*2); ctx.arc(x+24,y+2,24,0,Math.PI*2); ctx.arc(x+52,y,17,0,Math.PI*2); ctx.fill(); }
  ctx.fillStyle='rgba(87,133,196,.12)'; for(let i=0;i<5;i++){const x=((i*400-cameraX*3)%(innerWidth+500))-200;ctx.beginPath();ctx.ellipse(x,innerHeight-150,230,55,0,0,Math.PI*2);ctx.fill();}
}
function drawGrid(){
  const startX=Math.floor(cameraX-innerWidth/TILE/2)-1,endX=Math.ceil(cameraX+innerWidth/TILE/2)+1; ctx.strokeStyle='rgba(22,44,60,.08)';ctx.lineWidth=1;
  for(let x=startX;x<=endX;x++){const sx=worldToScreenX(x);ctx.beginPath();ctx.moveTo(sx,58);ctx.lineTo(sx,innerHeight-72);ctx.stroke();}
  for(let y=0;y<=WORLD_MAX_Y;y++){const sy=worldToScreenY(y);ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(innerWidth,sy);ctx.stroke();}
}
function drawBlock(b){
  const sx=worldToScreenX(b.x),sy=worldToScreenY(b.y),d=BLOCKS[b.type]; if(sx<-TILE||sx>innerWidth+TILE||sy<-TILE||sy>innerHeight) return;
  ctx.fillStyle=d.color;ctx.fillRect(sx+1,sy+1,TILE-2,TILE-2);ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(sx+2,sy+2,TILE-4,4);ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(sx+2,sy+TILE-6,TILE-4,4);
  if(b.type==='grass'){ctx.fillStyle='#2b9c58';ctx.fillRect(sx+2,sy+1,TILE-4,5);}
  if(b.type==='wood'){ctx.strokeStyle='rgba(55,30,15,.35)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+9,sy+5);ctx.lineTo(sx+9,sy+27);ctx.moveTo(sx+20,sy+4);ctx.lineTo(sx+20,sy+28);ctx.stroke();}
  if(b.type==='crystal'){ctx.fillStyle='rgba(255,255,255,.42)';ctx.beginPath();ctx.moveTo(sx+16,sy+4);ctx.lineTo(sx+26,sy+16);ctx.lineTo(sx+16,sy+28);ctx.lineTo(sx+7,sy+16);ctx.closePath();ctx.fill();}
  if(b.type==='gold'){ctx.fillStyle='rgba(255,248,150,.65)';ctx.fillRect(sx+7,sy+8,5,5);ctx.fillRect(sx+19,sy+19,4,4);}
}
function drawPlayer(){
  const sx=worldToScreenX(player.x)-TILE*.36,sy=worldToScreenY(player.y)-TILE*1.6;ctx.save();ctx.translate(sx,sy);
  ctx.fillStyle='#2a2348';ctx.fillRect(8,24,17,27);ctx.fillStyle='#f3a4e8';ctx.fillRect(6,8,21,18);ctx.fillStyle='#171226';ctx.fillRect(player.face>0?20:8,14,4,4);ctx.fillStyle='#67d8ff';ctx.fillRect(9,50,6,7);ctx.fillRect(19,50,6,7);ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(8,9,18,3);ctx.restore();
  ctx.fillStyle='rgba(17,16,28,.8)';ctx.font='700 11px Inter,Arial';ctx.textAlign='center';ctx.fillText('You',worldToScreenX(player.x),sy-5);ctx.textAlign='left';
}
function drawMining(){
  if(!mining)return;const b=getBlock(mining.x,mining.y);if(!b){mining=null;return;}const sx=worldToScreenX(b.x),sy=worldToScreenY(b.y),p=clamp((performance.now()-mining.started)/BLOCKS[b.type].hard,0,1);
  ctx.strokeStyle='#f5a7ed';ctx.lineWidth=3;ctx.strokeRect(sx+2,sy+2,TILE-4,TILE-4);ctx.fillStyle='rgba(12,16,26,.72)';ctx.fillRect(sx+4,sy+TILE-8,TILE-8,4);ctx.fillStyle='#6dd7ff';ctx.fillRect(sx+4,sy+TILE-8,(TILE-8)*p,4);if(p>=1){breakBlock(b.x,b.y);mining=null;}
}
function draw(){ctx.clearRect(0,0,innerWidth,innerHeight);drawBackground();drawGrid();const startX=Math.floor(cameraX-innerWidth/TILE/2)-1,endX=Math.ceil(cameraX+innerWidth/TILE/2)+1;for(const b of blocks.values())if(b.x>=startX&&b.x<=endX)drawBlock(b);drawPlayer();drawMining();}

function collidesAt(x,y){
  const left=x-player.w/2,right=x+player.w/2,bottom=y,top=y+player.h;for(let tx=Math.floor(left);tx<=Math.floor(right);tx++)for(let ty=Math.floor(bottom);ty<=Math.floor(top);ty++)if(isSolid(tx,ty))return true;return false;
}
function physics(dt){
  if(paused)return;const accel=keys.has('shift')?42:30;if(keys.has('a')){player.vx-=accel*dt;player.face=-1;}if(keys.has('d')){player.vx+=accel*dt;player.face=1;}if(!keys.has('a')&&!keys.has('d'))player.vx*=Math.pow(.001,dt);player.vx=clamp(player.vx,-7,7);player.vy-=23*dt;
  if(keys.has(' ')&&player.grounded&&!player.jumpLatch){player.vy=9.2;player.grounded=false;}player.jumpLatch=keys.has(' ');
  let nx=player.x+player.vx*dt;if(!collidesAt(nx,player.y))player.x=nx;else player.vx=0;
  let ny=player.y+player.vy*dt;if(!collidesAt(player.x,ny)){player.y=ny;player.grounded=false;}else{if(player.vy<0){const foot=Math.floor(ny);player.y=foot+1;player.grounded=true;}player.vy=0;}
  if(player.y<1){player.y=surfaceAt(player.x)+1;player.vy=0;player.grounded=true;}player.x=clamp(player.x,WORLD_MIN_X+.5,WORLD_MAX_X-.5);cameraX+=(player.x-cameraX)*Math.min(1,dt*8);cameraX=clamp(cameraX,WORLD_MIN_X+innerWidth/TILE/2,WORLD_MAX_X-innerWidth/TILE/2);
}
function breakBlock(x,y){const b=getBlock(x,y);if(!b||y===0)return;removeBlock(x,y);inventory[b.type]=(inventory[b.type]||0)+1;renderHotbar();queueSave();toast(`+1 ${BLOCKS[b.type].name}`);}
function beginMineAt(mx,my){const p=screenToWorld(mx,my),b=getBlock(p.x,p.y);if(!b)return;if(Math.abs(p.x-player.x)>6||Math.abs(p.y-(player.y+1))>6)return toast('Too far away');mining={x:p.x,y:p.y,started:performance.now()};}
function placeAt(mx,my){const p=screenToWorld(mx,my),type=HOTBAR[selected];if(Math.abs(p.x-player.x)>6||Math.abs(p.y-(player.y+1))>6)return toast('Too far away');if(getBlock(p.x,p.y))return;if(!inventory[type])return toast(`No ${BLOCKS[type].name}`);if(p.y<0||p.y>WORLD_MAX_Y||p.x<WORLD_MIN_X||p.x>WORLD_MAX_X)return;const adjacent=getBlock(p.x+1,p.y)||getBlock(p.x-1,p.y)||getBlock(p.x,p.y+1)||getBlock(p.x,p.y-1);if(!adjacent)return toast('Place next to a block');addBlock(p.x,p.y,type);inventory[type]--;renderHotbar();queueSave();}
function renderHotbar(){const root=$('hotbar');root.innerHTML='';HOTBAR.forEach((t,i)=>{const b=document.createElement('button');b.className='slot '+(i===selected?'selected':'');b.title=`${i+1}. ${BLOCKS[t].name}`;b.innerHTML=`<span class="slot-num">${i+1}</span><span class="slot-icon" style="background:${BLOCKS[t].color}"></span><span class="slot-count">${inventory[t]||0}</span>`;b.onclick=()=>{selected=i;renderHotbar();};root.appendChild(b);});}
function renderPlayers(){$('playerCount').textContent='1 online';}
function addChatMessage(user,text){const row=document.createElement('div');row.className='chat-msg';row.innerHTML=`<b>${escapeHtml(user)}</b><span>${escapeHtml(text)}</span>`;$('chatMessages').appendChild(row);$('chatMessages').scrollTop=$('chatMessages').scrollHeight;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function openChat(){chatOpen=true;paused=true;$('chatPanel').classList.add('open');setTimeout(()=>$('chatInput').focus(),30);}
function closeChat(){chatOpen=false;paused=false;$('chatPanel').classList.remove('open');canvas.focus();}
function openInventory(){paused=true;$('inventoryPanel').hidden=false;renderInventory();}
function closeInventory(){paused=false;$('inventoryPanel').hidden=true;}
function renderInventory(){const root=$('inventoryGrid');root.innerHTML='';HOTBAR.forEach((t,i)=>{const b=document.createElement('button');b.className='inv-item';b.innerHTML=`<i style="background:${BLOCKS[t].color}"></i><div><strong>${BLOCKS[t].name}</strong><small>${inventory[t]||0} owned</small></div>`;b.onclick=()=>{selected=i;renderHotbar();closeInventory();};root.appendChild(b);});}
function toggleHelp(){ $('helpPanel').hidden=!$('helpPanel').hidden; if(!$('helpPanel').hidden) paused=true; else if(!chatOpen && $('inventoryPanel').hidden) paused=false; }
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),1400);}
let saveTimer;function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveWorld,1000);$('saveState').textContent='SAVING…';}
async function saveWorld(){if(!worldId){$('saveState').textContent='LOCAL';return;}try{const data=[...blocks.values()].map(b=>({x:b.x,y:b.y,z:0,type:b.type}));const r=await fetch(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:data})});$('saveState').textContent=r.ok?'SAVED':'LOCAL';}catch(e){$('saveState').textContent='LOCAL';}}
function loop(now){const dt=Math.min(.035,(now-last)/1000);last=now;if(started&&!paused)physics(dt);draw();requestAnimationFrame(loop);}

canvas.addEventListener('mousedown',e=>{if(paused)return;if(e.button===0)beginMineAt(e.clientX,e.clientY);if(e.button===2){e.preventDefault();placeAt(e.clientX,e.clientY);}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());addEventListener('mouseup',e=>{if(e.button===0)mining=null;});
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;const k=e.key.toLowerCase();if(k==='e'){e.preventDefault();$('inventoryPanel').hidden?openInventory():closeInventory();return;}if(k==='t'){e.preventDefault();chatOpen?closeChat():openChat();return;}if(k==='h'){e.preventDefault();toggleHelp();return;}if(k==='escape'){e.preventDefault();if(chatOpen)closeChat();else if(!$('inventoryPanel').hidden)closeInventory();else if(!$('helpPanel').hidden)toggleHelp();return;}if(/^\d$/.test(e.key)){const n=Number(e.key)-1;if(n>=0&&n<HOTBAR.length){selected=n;renderHotbar();}}keys.add(k);});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
$('saveButton').onclick=saveWorld;$('inventoryButton').onclick=()=>$('inventoryPanel').hidden?openInventory():closeInventory();$('inventoryClose').onclick=closeInventory;$('chatButton').onclick=()=>chatOpen?closeChat():openChat();$('chatClose').onclick=closeChat;$('helpButton').onclick=toggleHelp;$('helpClose').onclick=toggleHelp;$('chatForm').addEventListener('submit',e=>{e.preventDefault();const v=$('chatInput').value.trim();if(!v)return;addChatMessage('You',v);$('chatInput').value='';});$('homeButton').onclick=()=>{saveWorld();location.href='./dashboard.html';};$('modeButton').onclick=()=>toast('VEXORA 2D sandbox mode is active.');
addChatMessage('Vexora','Welcome to the world!');addChatMessage('System','WASD move · SPACE jump · LMB break · RMB place');renderHotbar();renderPlayers();generateWorld();loadServer();requestAnimationFrame(loop);
