import * as THREE from 'https://esm.sh/three@0.180.0';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const worldId = qs.get('id') || '';

const TYPES = {
  grass:{name:'Grass',color:0x55c878,hard:.16}, dirt:{name:'Dirt',color:0x8a5a3d,hard:.22},
  stone:{name:'Stone',color:0x7d8793,hard:.7}, wood:{name:'Wood',color:0x996540,hard:.45},
  leaf:{name:'Leaves',color:0x2f914e,hard:.12}, sand:{name:'Sand',color:0xd7bd77,hard:.15},
  crystal:{name:'Crystal',color:0x55d8ec,hard:.8}, gold:{name:'Vexa Ore',color:0xe1b33c,hard:1}, brick:{name:'Brick',color:0xa95048,hard:.6}
};
const HOT = ['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick'];
const blocks = new Map();
const keys = new Set();
const inventory = Object.fromEntries(Object.keys(TYPES).map(k=>[k,0]));
const K = (x,y,z) => `${x},${y},${z}`;

let mode='creative', selected=0, started=false, paused=false, chatOpen=false;
let yaw=0, pitch=-0.12, velocityY=0, grounded=true, jumpLatch=false;
let mining=false, mineTarget=null, mineStarted=0, mineDuration=0, playSeconds=0;
let worldMeta={name:'VEXORA WORLD',type:'creative',seed:1337};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x83c9eb);
scene.fog = new THREE.Fog(0x83c9eb,45,120);
const camera = new THREE.PerspectiveCamera(72,1,.05,220);
const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const host = $('gameCanvas');
host.innerHTML=''; host.appendChild(renderer.domElement);
const canvas=renderer.domElement;

const worldGroup=new THREE.Group(), decoGroup=new THREE.Group();
scene.add(worldGroup,decoGroup);
scene.add(new THREE.HemisphereLight(0xeafaff,0x31553c,1.9));
const sun=new THREE.DirectionalLight(0xfff1cf,2.1); sun.position.set(35,60,20); scene.add(sun);
const cube=new THREE.BoxGeometry(1,1,1);
const materials={};
for(const [t,d] of Object.entries(TYPES)) materials[t]=new THREE.MeshStandardMaterial({color:d.color,roughness:.86,transparent:t==='glass',opacity:t==='glass'?.5:1,metalness:t==='gold'?.2:0});

function resize(){const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
addEventListener('resize',resize); resize();
function toast(text){const e=$('toast');if(!e)return;e.textContent=text;e.className='toast show';clearTimeout(window.__vtoast);window.__vtoast=setTimeout(()=>e.className='toast',1700)}
function rnd(x,z,s){const n=Math.sin(x*127.1+z*311.7+s*.731)*43758.5453;return n-Math.floor(n)}
function heightAt(x,z,s){return Math.max(2,Math.floor(3+rnd(Math.floor(x)*3,Math.floor(z)*5,s)*3))}
function addBlock(x,y,z,type){if(!TYPES[type]||y<0||y>64||blocks.has(K(x,y,z)))return;const m=new THREE.Mesh(cube,materials[type]);m.position.set(x,y,z);m.userData={x,y,z,type};worldGroup.add(m);blocks.set(K(x,y,z),m)}
function removeBlock(x,y,z){const m=blocks.get(K(x,y,z));if(m){worldGroup.remove(m);blocks.delete(K(x,y,z))}}
function clearWorld(){for(const m of blocks.values())worldGroup.remove(m);blocks.clear();while(decoGroup.children.length)decoGroup.remove(decoGroup.children[0])}
function topAt(x,z){x=Math.round(x);z=Math.round(z);for(let y=64;y>=0;y--)if(blocks.has(K(x,y,z)))return y;return -1}
function generateWorld(){
  clearWorld(); const seed=Number(worldMeta.seed||1337), r=28;
  for(let x=-r;x<=r;x++) for(let z=-r;z<=r;z++){
    if(Math.hypot(x,z)>r+1) continue;
    const h=heightAt(x,z,seed);
    for(let y=0;y<=h;y++) addBlock(x,y,z,y===h?'grass':y>=h-2?'dirt':'stone');
    if(rnd(x+3,z-2,seed+4)>.94){const y=h+1;addBlock(x,y,z,'sand')}
  }
  for(let i=0;i<34;i++){
    const x=Math.floor(rnd(i*4,seed,seed)*48)-24,z=Math.floor(rnd(seed,i*7,seed+7)*48)-24,y=topAt(x,z)+1;
    if(y<1)continue;
    const g=new THREE.Group();
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(.25,.38,2.5,7),materials.wood);
    const lf=new THREE.Mesh(new THREE.IcosahedronGeometry(1.4,1),materials.leaf);
    tr.position.y=1.25;lf.position.y=2.8;g.add(tr,lf);g.position.set(x,y,z);decoGroup.add(g);
  }
}
function loadBlocks(list){if(Array.isArray(list)&&list.length){clearWorld();for(const b of list)addBlock(+b.x,+b.y,+b.z,b.type)}else generateWorld()}
function solid(x,y,z){return blocks.has(K(Math.floor(x),Math.floor(y),Math.floor(z)))}
function collides(px,eyeY,pz){const r=.29,feet=eyeY-1.62+.03,head=eyeY-.08;for(let x=Math.floor(px-r+.5);x<=Math.floor(px+r+.5);x++)for(let z=Math.floor(pz-r+.5);z<=Math.floor(pz+r+.5);z++)for(let y=Math.floor(feet+.5);y<=Math.floor(head+.5);y++)if(solid(x,y,z))return true;return false}
function look(){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch}
function spawn(){const t=topAt(0,4);camera.position.set(0,(t>=0?t+.5:3)+1.62,4);yaw=0;pitch=-.12;velocityY=0;grounded=true;look();updateCoords()}
function updateCoords(){if($('worldCoords'))$('worldCoords').textContent=`X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y-1.62)} · Z ${Math.round(camera.position.z)}`}
function move(dt){
  if(!started||paused)return;
  const f=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),r=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),d=new THREE.Vector3();
  if(keys.has('w'))d.add(f);if(keys.has('s'))d.sub(f);if(keys.has('d'))d.add(r);if(keys.has('a'))d.sub(r);if(d.lengthSq())d.normalize();
  if(mode==='creative'){
    const speed=keys.has('shift')?10:6.5;
    const nx=camera.position.x+d.x*speed*dt,nz=camera.position.z+d.z*speed*dt;
    camera.position.x=nx;camera.position.z=nz;
    if(keys.has(' '))camera.position.y+=speed*dt;
    if(keys.has('shift'))camera.position.y-=speed*dt;
  }else{
    const speed=keys.has('shift')?7:4.6;
    const nx=camera.position.x+d.x*speed*dt,nz=camera.position.z+d.z*speed*dt;
    if(!collides(nx,camera.position.y,camera.position.z))camera.position.x=nx;
    if(!collides(camera.position.x,camera.position.y,nz))camera.position.z=nz;
    const jump=keys.has(' '); if(jump&&!jumpLatch&&grounded){velocityY=7.2;grounded=false} jumpLatch=jump;
    velocityY-=20*dt; const ny=camera.position.y+velocityY*dt;
    if(!collides(camera.position.x,ny,camera.position.z))camera.position.y=ny;
    else if(velocityY<0){const t=topAt(camera.position.x,camera.position.z);if(t>=0)camera.position.y=t+.5+1.62;velocityY=0;grounded=true}
    else velocityY=0;
  }
  camera.position.x=THREE.MathUtils.clamp(camera.position.x,-63,63);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-63,63);camera.position.y=THREE.MathUtils.clamp(camera.position.y,1.8,64);updateCoords();
}
function rayHit(){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);return ray.intersectObjects([...blocks.values()],false).find(h=>h.distance<=7)||null}
function startMine(){const h=rayHit();if(!h)return;mineTarget=h.object;mineStarted=performance.now();mineDuration=Math.max(120,(TYPES[h.object.userData.type]?.hard||.5)*520);$('breakMeter')?.classList.add('on')}
function updateMine(now){if(!mining){$('breakMeter')?.classList.remove('on');return}const h=rayHit();if(!h||h.object!==mineTarget){if(h)startMine();return}const p=Math.min(1,(now-mineStarted)/mineDuration);if($('breakMeterFill'))$('breakMeterFill').style.width=`${p*100}%`;if(p>=1){const b=mineTarget.userData;if(b.y>0){removeBlock(b.x,b.y,b.z);if(mode==='survival')inventory[b.type]++;renderHotbar()}mineTarget=null;$('breakMeter')?.classList.remove('on');toast('Block broken')}}
function place(){const h=rayHit();if(!h)return;const type=HOT[selected];if(mode!=='creative'&&!inventory[type])return toast(`No ${TYPES[type].name}`);const p=h.object.position.clone().add(h.face?.normal||new THREE.Vector3(0,1,0));const x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);if(y<0||y>64||blocks.has(K(x,y,z))||collides(x,camera.position.y,z))return;addBlock(x,y,z,type);if(mode!=='creative')inventory[type]--;renderHotbar();queueSave()}
function renderHotbar(){const root=$('hotbar');if(!root)return;root.innerHTML='';HOT.forEach((t,i)=>{const b=document.createElement('button');b.className=`slot ${i===selected?'selected':''}`;b.type='button';b.innerHTML=`<span class="num">${i+1}</span><i class="swatch" style="background:#${TYPES[t].color.toString(16).padStart(6,'0')}"></i><span class="count">${mode==='creative'?'∞':inventory[t]||0}</span>`;b.onclick=e=>{e.stopPropagation();selected=i;renderHotbar()};root.appendChild(b)})}
function renderInventory(){const root=$('inventoryGrid');if(!root)return;root.innerHTML='';Object.keys(TYPES).forEach(t=>{const b=document.createElement('button');b.className='inv-slot';b.type='button';b.innerHTML=`<i style="background:#${TYPES[t].color.toString(16).padStart(6,'0')}"></i><strong>${TYPES[t].name}</strong><small>${mode==='creative'?'Unlimited':`${inventory[t]||0} items`}</small>`;b.onclick=()=>{const i=HOT.indexOf(t);if(i>=0)selected=i;closeInventory();renderHotbar()};root.appendChild(b)})}
function release(){if(document.pointerLockElement===canvas)document.exitPointerLock();canvas.style.cursor='default'}
function capture(){if(!started||paused||chatOpen)return;try{canvas.requestPointerLock()}catch(e){}}
function startGame(){if(started)return;started=true;$('startOverlay')?.classList.add('hidden');$('status').textContent='WASD MOVE · MOUSE LOOK · LMB MINE · RMB PLACE';toast('Click the world to lock mouse');}
function openInventory(){if(!started)return;release();paused=true;$('inventoryPanel').hidden=false;$('pausePanel').hidden=true;renderInventory()}
function closeInventory(){if($('inventoryPanel'))$('inventoryPanel').hidden=true;paused=false}
function openPause(){if(!started||chatOpen)return;release();paused=true;$('pausePanel').hidden=false;$('inventoryPanel').hidden=true}
function closePause(){paused=false;$('pausePanel').hidden=true;capture()}
function openChat(){if(!started)return;release();chatOpen=true;paused=true;$('chatPanel').classList.add('open');setTimeout(()=>$('worldChatInput').focus(),20)}
function closeChat(){chatOpen=false;paused=false;$('chatPanel').classList.remove('open');capture()}
function toggleMode(){mode=mode==='creative'?'survival':'creative';$('modeButton').textContent=mode.toUpperCase();$('worldType').textContent=mode.toUpperCase();renderHotbar();renderInventory();toast(mode==='creative'?'CREATIVE: SPACE UP / SHIFT DOWN':'SURVIVAL: SPACE JUMP / SHIFT SPRINT')}
let saveTimer;
function queueSave(){clearTimeout(saveTimer);if($('saveState')){$('saveState').textContent='UNSAVED';$('saveState').classList.remove('sync')}saveTimer=setTimeout(saveWorld,1600)}
async function saveWorld(){if(!worldId)return;try{const blocksData=[...blocks.values()].map(m=>m.userData);const r=await fetch(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:blocksData})});if(r.ok&&$('saveState')){$('saveState').textContent='SYNCED';$('saveState').classList.add('sync')}}catch(e){if($('saveState'))$('saveState').textContent='LOCAL'}}
async function loadServer(){
  try{const r=await fetch(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{credentials:'include'});if(r.ok){const d=await r.json();if(Array.isArray(d.blocks)&&d.blocks.length)loadBlocks(d.blocks)}}catch(e){console.warn('Using generated local world',e)}
  try{const r=await fetch('/api/worlds',{credentials:'include'});if(r.ok){const d=await r.json();const list=Array.isArray(d.worlds)?d.worlds:[];const found=list.find(w=>String(w.id)===String(worldId));if(found){worldMeta=found;mode=found.type==='creative'?'creative':'survival';$('worldName').textContent=found.name||'VEXORA WORLD';$('worldType').textContent=mode.toUpperCase();$('modeButton').textContent=mode.toUpperCase();renderHotbar();renderInventory()}}}catch(e){console.warn('Metadata unavailable',e)}
}

$('playNow').onclick=startGame;
$('modeButton').onclick=toggleMode;
$('inventoryButton').onclick=openInventory;
$('closeInventory').onclick=closeInventory;
$('saveWorld').onclick=saveWorld;
$('backHome').onclick=()=>{saveWorld();location.href='./dashboard.html'};
$('resumeButton').onclick=closePause;
$('pauseInventory').onclick=openInventory;
$('pauseExit').onclick=()=>{saveWorld();location.href='./dashboard.html'};
$('chatToggle').onclick=()=>chatOpen?closeChat():openChat();
$('chatClose').onclick=closeChat;
$('chatForm').addEventListener('submit',e=>e.preventDefault());

canvas.addEventListener('click',()=>{if(started&&!paused&&!chatOpen)capture()});
canvas.addEventListener('mousedown',e=>{if(!started||paused||chatOpen)return;if(e.button===0){mining=true;startMine()}else if(e.button===2){e.preventDefault();place()}});
addEventListener('mouseup',e=>{if(e.button===0)mining=false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas||paused||chatOpen)return;yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.48,1.48);look()});
document.addEventListener('pointerlockchange',()=>{canvas.style.cursor=document.pointerLockElement===canvas?'none':'default'});
addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  const k=e.key.toLowerCase();
  if(['w','a','s','d','shift',' ','control'].includes(k)){e.preventDefault();keys.add(k)}
  if(k>='1'&&k<='9'){selected=Number(k)-1;renderHotbar()}
  if(k==='e'){e.preventDefault();$('inventoryPanel').hidden?openInventory():closeInventory()}
  if(k==='t'){e.preventDefault();openChat()}
  if(k==='escape'&&started&&!chatOpen){if(!$('inventoryPanel').hidden)closeInventory();else if(!$('pausePanel').hidden)closePause();else openPause()}
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>{keys.clear();if(started&&!chatOpen)openPause()});

// Generate first. Network/database must never prevent the player from entering the game.
generateWorld();
spawn();
$('worldName').textContent=worldMeta.name;
$('worldType').textContent='CREATIVE';
$('modeButton').textContent='CREATIVE';
renderHotbar();renderInventory();
$('fatal').hidden=true;
$('startOverlay').classList.remove('hidden');
loadServer();

let last=performance.now();
function frame(t){const dt=Math.min(.04,(t-last)/1000);last=t;move(dt);updateMine(t);renderer.render(scene,camera);requestAnimationFrame(frame)}
requestAnimationFrame(frame);
setInterval(()=>{if(started&&!paused&&!chatOpen)playSeconds+=5},5000);
setInterval(()=>{if(playSeconds>0){const n=playSeconds;playSeconds=0;fetch('/api/activity',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:n})}).catch(()=>{})}},30000);
