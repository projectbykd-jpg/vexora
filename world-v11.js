import * as THREE from 'https://esm.sh/three@0.180.0';

const $=id=>document.getElementById(id);
const qs=new URLSearchParams(location.search),worldId=qs.get('id');
if(!worldId){location.replace('./worlds.html');throw new Error('Missing world id');}

const TYPES={
 grass:{name:'Grass',color:0x58c978,hard:.18},dirt:{name:'Dirt',color:0x8b5b3d,hard:.25},stone:{name:'Stone',color:0x7f8996,hard:.72},wood:{name:'Wood',color:0x9b6942,hard:.5},leaf:{name:'Leaves',color:0x349452,hard:.12},sand:{name:'Sand',color:0xd9bf7a,hard:.16},crystal:{name:'Vexa Crystal',color:0x55d9ef,hard:.9},gold:{name:'Vexa Ore',color:0xe4b63a,hard:1.1},glass:{name:'Glass',color:0x9de4f4,hard:.1},brick:{name:'Brick',color:0xa85249,hard:.62}
};
const HOT=['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick'];
const blocks=new Map(),remotes=new Map(),keys=new Set(),inventory=Object.fromEntries(Object.keys(TYPES).map(k=>[k,0]));
const K=(x,y,z)=>`${x},${y},${z}`;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x83c9eb);scene.fog=new THREE.Fog(0x83c9eb,48,130);
const camera=new THREE.PerspectiveCamera(72,1,.05,220);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
const host=$('gameCanvas');host.appendChild(renderer.domElement);const canvas=renderer.domElement;
const worldGroup=new THREE.Group(),decoGroup=new THREE.Group(),playerGroup=new THREE.Group();scene.add(worldGroup,decoGroup,playerGroup);
scene.add(new THREE.HemisphereLight(0xeafaff,0x31553c,1.75));
const sun=new THREE.DirectionalLight(0xfff1cf,2.15);sun.position.set(35,55,20);sun.castShadow=true;scene.add(sun);
const cube=new THREE.BoxGeometry(1,1,1),materials={};
for(const[t,d]of Object.entries(TYPES))materials[t]=new THREE.MeshStandardMaterial({color:d.color,roughness:t==='glass'?.18:.88,transparent:t==='glass',opacity:t==='glass'?.52:1,metalness:t==='gold'?.2:0,emissive:t==='crystal'?0x075d70:t==='gold'?0x302305:0,emissiveIntensity:t==='crystal'?.55:t==='gold'?.15:0});

let meta=null,profile=null,mode='survival',selected=0,started=false,paused=false,chatOpen=false;
let yaw=0,pitch=-.12,velocityY=0,grounded=false,jumpLatch=false;
let mining=false,mineTarget=null,mineStarted=0,mineDuration=0,lastChatId=0,saveTimer=null,lastFrame=performance.now(),playAccumulator=0;

async function api(url,opt={}){const r=await fetch(url,{credentials:'include',...opt}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d;}
function toast(msg){const e=$('toast');e.textContent=msg;e.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.classList.remove('show'),1800);}
function resize(){const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}addEventListener('resize',resize);resize();

function rnd(x,z,s){const n=Math.sin(x*127.1+z*311.7+s*.731)*43758.5453;return n-Math.floor(n);}
function noise(x,z,s){const X=Math.floor(x),Z=Math.floor(z),u=(x-X)*(x-X)*(3-2*(x-X)),v=(z-Z)*(z-Z)*(3-2*(z-Z));return THREE.MathUtils.lerp(THREE.MathUtils.lerp(rnd(X,Z,s),rnd(X+1,Z,s),u),THREE.MathUtils.lerp(rnd(X,Z+1,s),rnd(X+1,Z+1,s),u),v);}
function hgt(x,z,s){return Math.max(2,Math.floor(3+noise(x*.11,z*.11,s)*3+noise(x*.25,z*.25,s+31)*1.2));}
function add(x,y,z,type){if(y<0||y>64||blocks.has(K(x,y,z))||!TYPES[type])return;const m=new THREE.Mesh(cube,materials[type]);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.userData={x,y,z,type};worldGroup.add(m);blocks.set(K(x,y,z),m);}
function remove(x,y,z){const m=blocks.get(K(x,y,z));if(m){worldGroup.remove(m);blocks.delete(K(x,y,z));}}
function clearWorld(){for(const m of blocks.values())worldGroup.remove(m);blocks.clear();while(decoGroup.children.length)decoGroup.remove(decoGroup.children[0]);}
function topAt(x,z){x=Math.round(x);z=Math.round(z);for(let y=64;y>=0;y--)if(blocks.has(K(x,y,z)))return y;return -1;}
function spawnY(x,z){const t=topAt(x,z);return (t<0?hgt(Math.round(x),Math.round(z),Number(meta?.seed||1)):t)+.5+1.62;}
function generate(){clearWorld();const seed=Number(meta?.seed||1),r=22;for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++){if(Math.hypot(x,z)>r+1)continue;const h=hgt(x,z,seed);for(let y=0;y<=h;y++){let t=y===h?'grass':y>=h-2?'dirt':'stone';if(y<2&&rnd(x,z,seed+3)>.965)t='gold';if(y===h&&rnd(x,z,seed+4)>.972)t='crystal';add(x,y,z,t);}}for(let i=0;i<26;i++){const x=Math.floor(rnd(i*4,seed,seed)*39)-19,z=Math.floor(rnd(seed,i*7,seed+7)*39)-19,y=topAt(x,z)+1;if(y<1)continue;const g=new THREE.Group(),tr=new THREE.Mesh(new THREE.CylinderGeometry(.28,.4,2.7,7),new THREE.MeshStandardMaterial({color:0x765039})),lf=new THREE.Mesh(new THREE.IcosahedronGeometry(1.45,1),materials.leaf);tr.position.y=1.35;lf.position.y=3;g.add(tr,lf);g.position.set(x,y,z);decoGroup.add(g);}}
function loadBlocks(list){if(Array.isArray(list)&&list.length){clearWorld();for(const b of list)add(+b.x,+b.y,+b.z,b.type);}else generate();}

// Player collision: eye height 1.62m, body width 0.6m. Movement is resolved per axis so WASD cannot get stuck on corners.
function solid(x,y,z){return blocks.has(K(Math.floor(x),Math.floor(y),Math.floor(z)));}
function collides(px,eyeY,pz){const r=.29,feet=eyeY-1.62+0.04,head=eyeY-.08;const minX=Math.floor(px-r+.5),maxX=Math.floor(px+r+.5),minZ=Math.floor(pz-r+.5),maxZ=Math.floor(pz+r+.5),minY=Math.floor(feet+.5),maxY=Math.floor(head+.5);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(let y=minY;y<=maxY;y++){if(solid(x,y,z))return true;}return false;}
function verticalStep(dt){velocityY-=20*dt;const ny=camera.position.y+velocityY*dt;if(!collides(camera.position.x,ny,camera.position.z)){camera.position.y=ny;grounded=false;return;}if(velocityY<0){let best=-Infinity;const r=.3,fx=Math.floor(camera.position.x-r+.5),tx=Math.floor(camera.position.x+r+.5),fz=Math.floor(camera.position.z-r+.5),tz=Math.floor(camera.position.z+r+.5);for(let x=fx;x<=tx;x++)for(let z=fz;z<=tz;z++){const t=topAt(x,z);if(t>=0)best=Math.max(best,t+.5+1.62);}if(best>-Infinity)camera.position.y=best;velocityY=0;grounded=true;}else{camera.position.y-=velocityY*dt;velocityY=0;}}
function cameraLook(){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;}
function spawn(){camera.position.set(0,spawnY(0,4),4);yaw=0;pitch=-.12;velocityY=0;grounded=true;cameraLook();}
function move(dt){if(!started||paused)return;const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),dir=new THREE.Vector3();if(keys.has('w'))dir.add(forward);if(keys.has('s'))dir.sub(forward);if(keys.has('d'))dir.add(right);if(keys.has('a'))dir.sub(right);if(dir.lengthSq())dir.normalize();
if(mode==='creative'){const speed=keys.has('control')?10:6.5;if(dir.lengthSq()){camera.position.x+=dir.x*speed*dt;camera.position.z+=dir.z*speed*dt;}if(keys.has(' '))camera.position.y+=speed*dt;if(keys.has('shift'))camera.position.y-=speed*dt;}
else{const speed=keys.has('shift')?7:4.6;const nx=camera.position.x+dir.x*speed*dt,nz=camera.position.z+dir.z*speed*dt;if(!collides(nx,camera.position.y,camera.position.z))camera.position.x=nx;if(!collides(camera.position.x,camera.position.y,nz))camera.position.z=nz;const jump=keys.has(' ');if(jump&&!jumpLatch&&grounded){velocityY=7.2;grounded=false;}jumpLatch=jump;verticalStep(dt);}
camera.position.x=THREE.MathUtils.clamp(camera.position.x,-63,63);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-63,63);camera.position.y=THREE.MathUtils.clamp(camera.position.y,1.8,64);$('worldCoords').textContent=`X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y-1.62)} · Z ${Math.round(camera.position.z)}`;}

function hit(){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);return ray.intersectObjects([...blocks.values()],false).find(h=>h.distance<=7)||null;}
function beginMine(){const h=hit();if(!h)return;mineTarget=h.object;mineStarted=performance.now();mineDuration=Math.max(110,(TYPES[mineTarget.userData.type]?.hard||.5)*520);$('breakMeter').classList.add('on');}
function updateMine(now){if(!mining){$('breakMeter').classList.remove('on');mineTarget=null;return;}const h=hit();if(!h||h.object!==mineTarget){if(h)beginMine();else{$('breakMeter').classList.remove('on');mineTarget=null;}return;}const p=Math.min(1,(now-mineStarted)/mineDuration);$('breakMeterFill').style.width=`${p*100}%`;if(p>=1){const b=mineTarget.userData;if(b.y>0){remove(b.x,b.y,b.z);if(mode==='survival')inventory[b.type]++;dirty();toast(`${TYPES[b.type].name} collected`);}mineTarget=null;$('breakMeter').classList.remove('on');}}
function place(){const h=hit();if(!h)return;const type=HOT[selected];if(mode!=='creative'&&!inventory[type])return toast(`No ${TYPES[type].name} in bag`);const n=h.face?.normal?.clone()||new THREE.Vector3(0,1,0),p=h.object.position.clone().add(n),x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);if(y<0||y>64||Math.abs(x)>64||Math.abs(z)>64||blocks.has(K(x,y,z)))return;if(collides(x,camera.position.y,z))return;add(x,y,z,type);if(mode!=='creative')inventory[type]--;dirty();}
function dirty(){clearTimeout(saveTimer);$('saveState').textContent='UNSAVED';$('saveState').classList.remove('sync');saveTimer=setTimeout(saveWorld,1200);renderHotbar();}
async function saveWorld(){try{const payload=[...blocks.values()].map(m=>m.userData);await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:payload})});$('saveState').textContent='SYNCED';$('saveState').classList.add('sync');}catch(e){$('saveState').textContent='SAVE ERROR';toast(e.message);}}

function colorHex(n){return '#'+n.toString(16).padStart(6,'0');}
function renderHotbar(){const root=$('hotbar');root.innerHTML='';HOT.forEach((t,i)=>{const b=document.createElement('button');b.className=`slot ${i===selected?'selected':''}`;b.type='button';b.innerHTML=`<span class="num">${i+1}</span><i class="swatch" style="background:${colorHex(TYPES[t].color)}"></i><span class="count">${mode==='creative'?'∞':inventory[t]||0}</span>`;b.onclick=e=>{e.stopPropagation();selected=i;renderHotbar();};root.appendChild(b);});}
function renderInventory(){const root=$('inventoryGrid');root.innerHTML='';Object.keys(TYPES).forEach(t=>{const b=document.createElement('button');b.className='inv-slot';b.type='button';b.innerHTML=`<i style="background:${colorHex(TYPES[t].color)}"></i><strong>${TYPES[t].name}</strong><small>${mode==='creative'?'Unlimited':`${inventory[t]||0} items`}</small>`;b.onclick=()=>{const i=HOT.indexOf(t);if(i>=0)selected=i;closeInventory();renderHotbar();};root.appendChild(b);});}

function release(){if(document.pointerLockElement===canvas)document.exitPointerLock();canvas.style.cursor='default';}
function capture(){if(!started||paused||chatOpen)return;canvas.requestPointerLock?.();}
function openInventory(){if(!started)return;release();paused=true;$('inventoryPanel').hidden=false;$('pausePanel').hidden=true;renderInventory();}
function closeInventory(){$('inventoryPanel').hidden=true;if(!chatOpen)paused=false;}
function openPause(){if(!started||chatOpen)return;release();paused=true;$('pausePanel').hidden=false;$('inventoryPanel').hidden=true;}
function closePause(){paused=false;$('pausePanel').hidden=true;capture();}
function openChat(){if(!started)return;release();chatOpen=true;paused=true;$('chatPanel').classList.add('open');setTimeout(()=>$('worldChatInput').focus(),20);}
function closeChat(){chatOpen=false;$('chatPanel').classList.remove('open');paused=false;capture();}
function toggleMode(){mode=mode==='creative'?'survival':'creative';$('modeButton').textContent=mode.toUpperCase();$('worldType').textContent=mode.toUpperCase();renderHotbar();renderInventory();toast(`Mode: ${mode}`);}

function addRemote(p){if(p.userId===profile?.id)return;let g=remotes.get(p.userId);if(!g){g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.65,1.2,.48),new THREE.MeshStandardMaterial({color:0x8d66df})),head=new THREE.Mesh(new THREE.BoxGeometry(.58,.58,.58),new THREE.MeshStandardMaterial({color:0xffc7a1}));body.position.y=.1;head.position.y=.9;g.add(body,head);const c=document.createElement('canvas');c.width=320;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='rgba(8,10,16,.86)';ctx.roundRect(8,7,304,50,12);ctx.fill();ctx.fillStyle='#fff';ctx.font='700 23px Arial';ctx.textAlign='center';ctx.fillText('@'+String(p.username||'Explorer').slice(0,20),160,39);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));s.scale.set(2.7,.54,1);s.position.y=2.1;g.add(s);playerGroup.add(g);remotes.set(p.userId,g);}g.position.set(p.x,p.y,p.z);g.rotation.y=p.yaw||0;g.userData.updated=Date.now();}
async function presence(){if(!started)return;try{await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:camera.position.x,y:camera.position.y-1.62,z:camera.position.z,yaw})});const d=await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`);for(const p of d.players||[])addRemote(p);for(const[id,g]of remotes)if(Date.now()-(g.userData.updated||0)>6000){playerGroup.remove(g);remotes.delete(id);}$('playerCount').textContent=`${Math.max(1,(d.players||[]).length)} online`;}catch{}}

function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function addChat(m){const e=document.createElement('div');e.className='msg';e.innerHTML=`<b>@${safe(m.username||'Explorer')}</b><span>${safe(m.message||'')}</span>`;$('worldChatMessages').appendChild(e);const box=$('worldChatMessages');box.scrollTop=box.scrollHeight;lastChatId=Math.max(lastChatId,Number(m.id||0));}
async function pollChat(){try{const d=await api(`/api/chat?worldId=${encodeURIComponent(worldId)}&after=${lastChatId}`);for(const m of d.messages||[])addChat(m);}catch{}}
async function sendChat(){const input=$('worldChatInput'),message=input.value.trim();if(!message)return;try{const d=await api(`/api/chat?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});addChat(d.message);input.value='';}catch(e){toast(e.message);}}

async function load(){try{const d=await api(`/api/worlds?id=${encodeURIComponent(worldId)}`);meta=d.world;if(!meta)throw Error('World not found');mode=meta.type==='creative'?'creative':'survival';$('worldName').textContent=meta.name;$('startWorldName').textContent=meta.name;$('worldType').textContent=mode.toUpperCase();$('modeButton').textContent=mode.toUpperCase();
try{profile=(await api('/api/profile')).user;$('playerName').textContent=profile?.displayName||profile?.username||'Explorer';}catch{}
const state=await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`);loadBlocks(state.blocks);spawn();renderHotbar();renderInventory();
$('startOverlay').classList.remove('hidden');
}catch(e){$('fatalText').textContent=e.message;$('fatal').hidden=false;}}

function start(){if(started)return;started=true;$('startOverlay').classList.add('hidden');capture();$('status').textContent='WASD MOVE · MOUSE LOOK · SPACE JUMP';presence();pollChat();}

canvas.addEventListener('click',e=>{if(!started)return;if(chatOpen)return;capture();});
canvas.addEventListener('mousedown',e=>{if(!started||paused)return;if(e.button===0){mining=true;beginMine();}if(e.button===2){e.preventDefault();place();}});
addEventListener('mouseup',e=>{if(e.button===0)mining=false;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{if(document.pointerLockElement!==canvas||paused||chatOpen)return;yaw-=e.movementX*.0024;pitch-=e.movementY*.0024;pitch=THREE.MathUtils.clamp(pitch,-Math.PI/2+.05,Math.PI/2-.05);cameraLook();});
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(chatOpen)return;if(['w','a','s','d',' ','shift','control'].includes(k)||/^\d$/.test(k))e.preventDefault();if(/^\d$/.test(k)){const n=Number(k);if(n>=1&&n<=9){selected=n-1;renderHotbar();}return;}if(k==='escape'){if($('inventoryPanel').hidden===false){closeInventory();capture();return;}if($('pausePanel').hidden===false){closePause();return;}if(chatOpen){closeChat();return;}openPause();return;}if(k==='e'){openInventory();return;}if(k==='t'){openChat();return;}keys.add(k);});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement===canvas){$('status').textContent=mode==='creative'?'WASD MOVE · SPACE UP · SHIFT DOWN · MOUSE LOOK':'WASD MOVE · SPACE JUMP · SHIFT SPRINT · MOUSE LOOK';canvas.style.cursor='none';}else if(started&&!paused&&!chatOpen){$('status').textContent='CLICK WORLD TO CONTINUE';canvas.style.cursor='default';}});

$('playNow').onclick=start;$('modeButton').onclick=toggleMode;$('chatToggle').onclick=()=>chatOpen?closeChat():openChat();$('chatClose').onclick=closeChat;$('inventoryButton').onclick=openInventory;$('closeInventory').onclick=closeInventory;$('saveWorld').onclick=saveWorld;$('backHome').onclick=()=>{saveWorld();location.href='./dashboard.html';};$('resumeButton').onclick=closePause;$('pauseInventory').onclick=openInventory;$('pauseExit').onclick=()=>{saveWorld();location.href='./dashboard.html';};$('chatForm').addEventListener('submit',e=>{e.preventDefault();sendChat();});

addEventListener('beforeunload',()=>{navigator.sendBeacon?.(`/api/presence?worldId=${encodeURIComponent(worldId)}`,'');});
setInterval(()=>{if(started){presence();pollChat();}},2500);
setInterval(async()=>{if(started&&!document.hidden){const s=Math.min(120,Math.floor(playAccumulator));if(s>0){playAccumulator-=s;try{await api('/api/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seconds:s})});}catch{}}}},10000);

function loop(now){const dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;move(dt);updateMine(now);if(started&&!paused&&!document.hidden)playAccumulator+=dt;renderer.render(scene,camera);requestAnimationFrame(loop);}load();requestAnimationFrame(loop);
