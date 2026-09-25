import * as THREE from 'https://esm.sh/three@0.180.0';
import { PointerLockControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/PointerLockControls.js';

const qs = new URLSearchParams(location.search);
const worldId = qs.get('id');
if (!worldId) location.replace('./dashboard.html');

const $ = (id) => document.getElementById(id);
const host = $('gameCanvas');
const blocks = new Map();
const key = (x, y, z) => `${x},${y},${z}`;

let world = null;
let mode = 'survival';
let selected = 0;
let dirty = false;
let pointerLocked = false;
let started = false;
let velocityY = 0;
let grounded = false;
let jumpHeld = false;
let mineTarget = null;
let mineStarted = 0;
let mineDuration = 0;
let mining = false;
let saveTimer = null;
let toastTimer = null;
let dayClock = 0.22;

const names = {
  grass: 'Grass', dirt: 'Dirt', stone: 'Stone', wood: 'Wood', leaf: 'Leaves',
  sand: 'Sand', crystal: 'Vexa Crystal', gold: 'Vexa Ore', glass: 'Glass', brick: 'Brick'
};
const colors = {
  grass: 0x55c878, dirt: 0x8c5b3c, stone: 0x87919e, wood: 0x9c6a42,
  leaf: 0x359457, sand: 0xd9bd73, crystal: 0x65d9ee, gold: 0xe6b63b,
  glass: 0x9bdff2, brick: 0xa95149
};
const hardness = { grass:.22, dirt:.30, stone:.85, wood:.65, leaf:.12, sand:.18, crystal:1.1, gold:1.35, glass:.15, brick:.7 };
const hot = ['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick'];
const inv = Object.fromEntries(Object.keys(names).map(k => [k, 0]));
const materials = {};

for (const [type, color] of Object.entries(colors)) {
  materials[type] = new THREE.MeshStandardMaterial({
    color,
    roughness: type === 'glass' ? .15 : .88,
    transparent: type === 'glass',
    opacity: type === 'glass' ? .52 : 1,
    metalness: type === 'gold' ? .18 : 0,
    emissive: type === 'crystal' ? 0x075c70 : type === 'gold' ? 0x2d2105 : 0,
    emissiveIntensity: type === 'crystal' ? .7 : type === 'gold' ? .18 : 0
  });
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9e4);
scene.fog = new THREE.Fog(0x8ec9e4, 45, 145);
const camera = new THREE.PerspectiveCamera(75, 1, .05, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
host.appendChild(renderer.domElement);
const controls = new PointerLockControls(camera, renderer.domElement);
controls.pointerSpeed = .85;
window.__vexoraPointerControls = controls;

const hemi = new THREE.HemisphereLight(0xe8f8ff, 0x304638, 1.8);
const sun = new THREE.DirectionalLight(0xfff0c8, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
scene.add(hemi, sun);
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const scenery = new THREE.Group();
scene.add(scenery);
const cube = new THREE.BoxGeometry(1,1,1);

function toast(text, kind='success') {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.className = `game-toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'game-toast'; }, 2200);
}
function setDirty(value) {
  dirty = value;
  const el = $('saveState');
  if (el) { el.textContent = value ? 'UNSAVED' : 'SYNCED'; el.classList.toggle('dirty', value); }
}
async function api(url, options={}) {
  const res = await fetch(url, { credentials: 'include', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function rand2(x, z, seed) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * .731) * 43758.5453;
  return n - Math.floor(n);
}
function noise(x, z, seed) {
  const X = Math.floor(x), Z = Math.floor(z);
  const u = (x-X) * (x-X) * (3 - 2*(x-X));
  const v = (z-Z) * (z-Z) * (3 - 2*(z-Z));
  const a = rand2(X,Z,seed), b = rand2(X+1,Z,seed), c = rand2(X,Z+1,seed), d = rand2(X+1,Z+1,seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,u), THREE.MathUtils.lerp(c,d,u), v);
}
function terrainHeight(x,z,seed) {
  return Math.max(2, Math.floor(3 + noise(x*.11,z*.11,seed)*3 + noise(x*.27,z*.27,seed+91)*1.4));
}
function addBlock(x,y,z,type) {
  const id = key(x,y,z);
  if (blocks.has(id)) return false;
  const mesh = new THREE.Mesh(cube, materials[type] || materials.grass);
  mesh.position.set(x,y,z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, type };
  worldGroup.add(mesh);
  blocks.set(id, mesh);
  return true;
}
function removeAllBlocks() {
  blocks.forEach(m => worldGroup.remove(m));
  blocks.clear();
}
function topBlock(x,z) {
  let top = -1;
  for (let y=0; y<70; y++) if (blocks.has(key(Math.round(x),y,Math.round(z)))) top = y;
  return top;
}
function groundY(x,z) {
  const top = topBlock(x,z);
  return (top >= 0 ? top : terrainHeight(Math.round(x),Math.round(z),world?.seed || 1)) + 1.65;
}
function decorate() {
  scenery.clear();
  const seed = world?.seed || 1;
  for (let i=0;i<28;i++) {
    const x = Math.floor(rand2(i*4,seed,seed)*43)-21;
    const z = Math.floor(rand2(seed,i*7,seed+7)*43)-21;
    const y = topBlock(x,z)+1;
    if (y < 1) continue;
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(.72,3,.72), new THREE.MeshStandardMaterial({color:0x765038,roughness:1}));
    trunk.position.y=1.5; g.add(trunk);
    for (const [px,py,pz,s] of [[0,3.1,0,1.45],[-.7,2.8,.1,1],[.7,2.8,-.1,1],[0,3.9,0,.8]]) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(s,1), materials.leaf);
      leaf.position.set(px,py,pz); leaf.castShadow=true; g.add(leaf);
    }
    g.position.set(x,y,z); scenery.add(g);
  }
}
function generateWorld() {
  removeAllBlocks();
  const seed = world?.seed || 1;
  const radius = 24;
  for (let x=-radius;x<=radius;x++) for (let z=-radius;z<=radius;z++) {
    if (Math.hypot(x,z)>radius+1) continue;
    const h = terrainHeight(x,z,seed);
    for (let y=0;y<=h;y++) {
      let type = y===h ? 'grass' : y>=h-2 ? 'dirt' : 'stone';
      if (y<2 && rand2(x,z,seed+3)>.91) type='gold';
      if (y===h && rand2(x,z,seed+4)>.965) type='crystal';
      addBlock(x,y,z,type);
    }
  }
  decorate();
}
function loadState(blockList) {
  removeAllBlocks();
  if (Array.isArray(blockList) && blockList.length) {
    for (const b of blockList) addBlock(Number(b.x),Number(b.y),Number(b.z),String(b.type));
    decorate();
  } else generateWorld();
}

function renderHotbar() {
  const bar = $('hotbar'); if (!bar) return;
  bar.innerHTML='';
  hot.forEach((type,i)=>{
    const b=document.createElement('button');
    b.className=`hot-slot ${i===selected?'selected':''}`;
    b.innerHTML=`<span class="slot-number">${i+1}</span><span class="voxel-icon voxel-${type}"></span><b class="count">${mode==='creative'?'∞':inv[type]||0}</b>`;
    b.addEventListener('click',()=>selectHot(i));
    bar.appendChild(b);
  });
}
function selectHot(i) {
  selected = THREE.MathUtils.clamp(i,0,8);
  renderHotbar();
  const hint=$('targetHint'); if(hint) hint.textContent=`${names[hot[selected]]} · RMB to place`;
}
function renderInventory() {
  const grid=$('inventoryGrid');
  if (grid) {
    grid.innerHTML='';
    Object.keys(names).forEach(type=>{
      const b=document.createElement('button'); b.className='inv-slot';
      b.innerHTML=`<span class="voxel-icon voxel-${type}"></span><b>${mode==='creative'?'∞':inv[type]||0}</b>`;
      b.addEventListener('click',()=>{ const idx=hot.indexOf(type); if(idx>=0) selectHot(idx); closeInventory(); resumeGame(); });
      grid.appendChild(b);
    });
  }
  const recipes=$('recipeGrid');
  if (recipes) {
    recipes.innerHTML='';
    const list=[['Planks','wood',1,'wood',4],['Glass','sand',4,'glass',1],['Brick','stone',2,'brick',1],['Crystal Block','crystal',2,'crystal',1],['Vexa Ingot','gold',3,'gold',1]];
    for (const r of list) {
      const b=document.createElement('button'); b.className='recipe';
      b.disabled=mode!=='creative' && (inv[r[1]]||0)<r[2];
      b.innerHTML=`<span class="voxel-icon voxel-${r[3]}"></span><span><strong>${r[0]}</strong><small>${r[2]} × ${names[r[1]]} → ${r[4]}</small></span>`;
      b.addEventListener('click',()=>{ if(mode!=='creative') inv[r[1]]-=r[2]; inv[r[3]]+=r[4]; renderInventory(); renderHotbar(); toast(`${r[0]} crafted`); });
      recipes.appendChild(b);
    }
  }
}
function openInventory() {
  $('inventoryPanel').hidden=false;
  $('pausePanel').hidden=true;
  renderInventory();
  controls.unlock();
}
function closeInventory() { $('inventoryPanel').hidden=true; }
function pauseGame() {
  if (!started || !$('inventoryPanel').hidden) return;
  $('pausePanel').hidden=false;
  setCursorVisible(true);
}
function resumeGame() {
  if (!started) return startGame();
  $('pausePanel').hidden=true;
  $('inventoryPanel').hidden=true;
  requestLock();
}
function setCursorVisible(visible) {
  document.documentElement.style.cursor=visible?'default':'none';
  document.body.style.cursor=visible?'default':'none';
}
function requestLock() {
  try { controls.lock(); } catch (e) { try { renderer.domElement.requestPointerLock(); } catch (_) {} }
}
function startGame() {
  started=true;
  $('startOverlay').style.display='none';
  $('pausePanel').hidden=true;
  $('inventoryPanel').hidden=true;
  setCursorVisible(false);
  requestLock();
}
function setMode(next) {
  mode=next;
  $('modeButton').textContent=mode.toUpperCase();
  $('modeLabel').textContent=mode.toUpperCase();
  $('worldType').textContent=mode.toUpperCase();
  renderHotbar(); renderInventory();
  toast(mode==='creative'?'Creative: unlimited blocks + flight':'Survival: gather, craft and build');
}

function rayHit() {
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0,0),camera);
  return ray.intersectObjects([...blocks.values()],false).find(h=>h.distance<=7);
}
function beginMine() {
  const hit=rayHit(); if(!hit) return;
  mineTarget=hit.object; mineStarted=performance.now();
  mineDuration=Math.max(140,(hardness[hit.object.userData.type]||.5)*620);
  $('breakMeter').style.display='block';
}
function updateMining(now) {
  if(!mining) { mineTarget=null; $('breakMeter').style.display='none'; return; }
  const hit=rayHit();
  if(!hit || hit.object!==mineTarget) { mineTarget=null; $('breakMeter').style.display='none'; if(hit) beginMine(); return; }
  const pct=Math.min(1,(now-mineStarted)/mineDuration);
  $('breakMeter').querySelector('span').style.width=`${pct*100}%`;
  if(pct>=1) {
    const b=mineTarget.userData;
    if(b.y>0) {
      worldGroup.remove(mineTarget); blocks.delete(key(b.x,b.y,b.z));
      if(mode==='survival') inv[b.type]=(inv[b.type]||0)+1;
      renderHotbar(); setDirty(true); toast(`${names[b.type]} collected`); scheduleSave();
    }
    mineTarget=null; $('breakMeter').style.display='none';
  }
}
function placeBlock() {
  const hit=rayHit(); if(!hit) return;
  const type=hot[selected];
  if(mode==='survival' && !(inv[type]>0)) { toast(`No ${names[type]} left`,'error'); return; }
  const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p=hit.object.position.clone().add(normal);
  const x=Math.round(p.x), y=Math.round(p.y), z=Math.round(p.z);
  if(y<0||y>64||Math.abs(x)>28||Math.abs(z)>28) return;
  if(addBlock(x,y,z,type)) {
    if(mode==='survival') inv[type]--;
    renderHotbar(); setDirty(true); toast(`${names[type]} placed`); scheduleSave();
  }
}

const keys=new Set();
function collides(x,y,z) {
  const r=.28, bottom=y-1.62, top=y-.12;
  for(const [dx,dz] of [[-r,-r],[r,-r],[-r,r],[r,r]]) {
    if(blocks.has(key(Math.floor(x+dx),Math.floor(bottom),Math.floor(z+dz))) || blocks.has(key(Math.floor(x+dx),Math.floor(top),Math.floor(z+dz)))) return true;
  }
  return false;
}
function move(dt) {
  if(!pointerLocked) return;
  const forward=new THREE.Vector3(); camera.getWorldDirection(forward); forward.y=0; forward.normalize();
  const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
  const dir=new THREE.Vector3();
  if(keys.has('w')) dir.add(forward); if(keys.has('s')) dir.sub(forward); if(keys.has('d')) dir.add(right); if(keys.has('a')) dir.sub(right);
  if(dir.lengthSq()>0) dir.normalize();
  const speed=mode==='creative'?(keys.has('shift')?14:8):(keys.has('shift')?8:5.2);
  if(mode==='creative') {
    if(keys.has(' ')) camera.position.y+=speed*dt;
    if(keys.has('control')) camera.position.y-=speed*dt;
    camera.position.addScaledVector(dir,speed*dt);
  } else {
    const ox=camera.position.x, oz=camera.position.z;
    camera.position.x += dir.x*speed*dt;
    if(collides(camera.position.x,camera.position.y,camera.position.z)) camera.position.x=ox;
    camera.position.z += dir.z*speed*dt;
    if(collides(camera.position.x,camera.position.y,camera.position.z)) camera.position.z=oz;
    if(keys.has(' ')&&!jumpHeld&&grounded){velocityY=7.2;grounded=false;}
    velocityY-=19*dt; camera.position.y+=velocityY*dt;
    const gy=groundY(camera.position.x,camera.position.z);
    if(camera.position.y<=gy){camera.position.y=gy;velocityY=0;grounded=true;} else grounded=false;
  }
  jumpHeld=keys.has(' ');
  camera.position.x=THREE.MathUtils.clamp(camera.position.x,-27,27);
  camera.position.z=THREE.MathUtils.clamp(camera.position.z,-27,27);
  camera.position.y=THREE.MathUtils.clamp(camera.position.y,1.8,63);
  $('worldCoords').textContent=`X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y-1.65)} · Z ${Math.round(camera.position.z)}`;
  $('locationName').textContent=camera.position.x>7&&camera.position.z<-6?'SUNSET LAKE':camera.position.x<-8&&camera.position.z>8?'WILLOW WOODS':camera.position.z<-10?'CRYSTAL RIDGE':'VEXA MEADOWS';
}

async function saveWorld() {
  if(!worldId) return;
  try {
    const data=[...blocks.values()].map(m=>m.userData);
    await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:data})});
    setDirty(false); toast('World saved');
  } catch(e) { toast(e.message||'Save failed','error'); }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveWorld(),900);
}

controls.addEventListener('lock',()=>{
  pointerLocked=true;
  setCursorVisible(false);
  $('startOverlay').style.display='none';
  $('pausePanel').hidden=true;
  $('inventoryPanel').hidden=true;
  $('targetHint').style.opacity='0';
});
controls.addEventListener('unlock',()=>{
  pointerLocked=false;
  setCursorVisible(true);
  $('targetHint').style.opacity='.95';
  if(started && $('inventoryPanel').hidden) $('pausePanel').hidden=false;
});

$('playNow')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();startGame();});
$('resumeButton')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();resumeGame();});
$('pauseInventory')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openInventory();});
$('pauseExit')?.addEventListener('click',()=>{ if(dirty) saveWorld(); location.href='./dashboard.html'; });
$('inventoryButton')?.addEventListener('click',()=>openInventory());
$('closeInventory')?.addEventListener('click',()=>{closeInventory();resumeGame();});
$('saveWorld')?.addEventListener('click',saveWorld);
$('backHome')?.addEventListener('click',async()=>{if(dirty)await saveWorld();location.href='./dashboard.html';});
$('modeButton')?.addEventListener('click',()=>setMode(mode==='creative'?'survival':'creative'));

window.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  keys.add(k);
  if(k==='e'&&!e.repeat){ e.preventDefault(); if($('inventoryPanel').hidden) openInventory(); else { closeInventory(); resumeGame(); } }
  const n=Number(e.key); if(n>=1&&n<=9) selectHot(n-1);
  if(k==='escape') { if(!$('inventoryPanel').hidden){closeInventory();return;} }
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)) e.preventDefault();
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener('mousedown',e=>{
  if(!pointerLocked){ if(started && $('pausePanel').hidden) requestLock(); return; }
  if(e.button===0){mining=true;beginMine();}
  if(e.button===2)placeBlock();
});
window.addEventListener('mouseup',e=>{if(e.button===0)mining=false;});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{keys.clear();mining=false;if(pointerLocked)controls.unlock();});
window.addEventListener('resize',resize);
function resize(){const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}

async function boot() {
  resize();
  renderHotbar();
  try {
    const result=await api(`/api/worlds?id=${encodeURIComponent(worldId)}`);
    world=result.world;
    mode=world.type==='creative'?'creative':'survival';
    $('worldName').textContent=world.name;
    $('startWorldName').textContent=world.name;
    $('playerName').textContent=world.ownerDisplayName || world.ownerUsername || 'Vexora';
    $('modeButton').textContent=mode.toUpperCase();
    $('modeLabel').textContent=mode.toUpperCase();
    $('worldType').textContent=mode.toUpperCase();
    try {
      const state=await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`);
      loadState(state.blocks);
    } catch(e) {
      generateWorld();
      toast('World loaded locally; saved blocks could not be synced','error');
    }
    const startY=groundY(0,0);
    camera.position.set(0,startY,7);
    camera.lookAt(0,startY-0.2,0);
    $('saveState').textContent='SYNCED';
    renderHotbar(); renderInventory();
    setCursorVisible(true);
    $('actionStatus').textContent='WORLD ONLINE';
  } catch(e) {
    $('worldName').textContent='World unavailable';
    $('startWorldName').textContent='World unavailable';
    toast(e.message||'Unable to load world','error');
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt=Math.min(.05,Math.max(0,(now-(animate.last||now))/1000));
  animate.last=now;
  move(dt);
  updateMining(now);
  dayClock=(dayClock+dt*.006)%1;
  const angle=dayClock*Math.PI*2;
  sun.position.set(Math.cos(angle)*35,Math.sin(angle)*35,12);
  sun.intensity=Math.max(.25,Math.sin(angle)*2.2+1.0);
  scene.fog.near=45; scene.fog.far=145;
  renderer.render(scene,camera);
}

boot();
requestAnimationFrame(animate);
