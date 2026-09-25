import * as THREE from 'https://esm.sh/three@0.180.0';

const qs = new URLSearchParams(location.search);
const worldId = qs.get('id');
if (!worldId) location.replace('./dashboard.html');

const $ = (id) => document.getElementById(id);
const host = $('gameCanvas');
const blocks = new Map();
const others = new Map();
const K = (x, y, z) => `${x},${y},${z}`;

const N = { grass:'Grass', dirt:'Dirt', stone:'Stone', wood:'Wood', leaf:'Leaves', sand:'Sand', crystal:'Vexa Crystal', gold:'Vexa Ore', glass:'Glass', brick:'Brick' };
const C = { grass:0x55c878, dirt:0x8c5b3c, stone:0x87919e, wood:0x9c6a42, leaf:0x359457, sand:0xd9bd73, crystal:0x65d9ee, gold:0xe6b63b, glass:0x9bdff2, brick:0xa95149 };
const HARD = { grass:.18, dirt:.25, stone:.75, wood:.55, leaf:.12, sand:.16, crystal:1, gold:1.2, glass:.12, brick:.65 };
const HOT = ['grass','dirt','stone','wood','leaf','sand','crystal','gold','brick'];
const inventoryData = Object.fromEntries(Object.keys(N).map(k => [k, 0]));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bc7e8);
scene.fog = new THREE.Fog(0x8bc7e8, 55, 155);
const camera = new THREE.PerspectiveCamera(70, 1, .05, 240);
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xeaf9ff, 0x31503b, 1.65);
const sun = new THREE.DirectionalLight(0xfff1ca, 2.25);
sun.position.set(30, 55, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(hemi, sun);

const worldGroup = new THREE.Group();
const decoGroup = new THREE.Group();
const playerGroup = new THREE.Group();
scene.add(worldGroup, decoGroup, playerGroup);
const cube = new THREE.BoxGeometry(1, 1, 1);
const materials = {};
for (const [type, color] of Object.entries(C)) {
  materials[type] = new THREE.MeshStandardMaterial({ color, roughness:type === 'glass' ? .15 : .88, transparent:type === 'glass', opacity:type === 'glass' ? .52 : 1, metalness:type === 'gold' ? .2 : 0, emissive:type === 'crystal' ? 0x075c70 : type === 'gold' ? 0x2d2105 : 0, emissiveIntensity:type === 'crystal' ? .65 : type === 'gold' ? .18 : 0 });
}

let world = null, me = null, mode = 'survival', selected = 0, started = false, paused = false, dirty = false;
let yaw = 0, pitch = -0.12, velocityY = 0, grounded = false, jumpWasDown = false;
let looking = false, lastMouseX = 0, lastMouseY = 0, mining = false, mineTarget = null, mineStartedAt = 0, mineDuration = 0;
let saveTimer = null, toastTimer = null, lastChatId = 0;
const keys = new Set();

async function api(url, options={}) {
  const response = await fetch(url, { credentials:'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function toast(message, kind='success') { const el=$('toast'); if(!el)return; el.textContent=message; el.className=`game-toast show ${kind}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className='game-toast',2200); }
function setDirty(value) { dirty=value; const el=$('saveState'); if(el){el.textContent=value?'UNSAVED':'SYNCED'; el.classList.toggle('dirty',value);} }
function resize(){const w=host.clientWidth||innerWidth,h=host.clientHeight||innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
addEventListener('resize',resize); resize();
function rnd(x,z,s){const n=Math.sin(x*127.1+z*311.7+s*.731)*43758.5453;return n-Math.floor(n);}
function noise(x,z,s){const X=Math.floor(x),Z=Math.floor(z),u=(x-X)*(x-X)*(3-2*(x-X)),v=(z-Z)*(z-Z)*(3-2*(z-Z));const a=rnd(X,Z,s),b=rnd(X+1,Z,s),c=rnd(X,Z+1,s),d=rnd(X+1,Z+1,s);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,u),THREE.MathUtils.lerp(c,d,u),v);}
function terrainHeight(x,z,s){return Math.max(2,Math.floor(3+noise(x*.09,z*.09,s)*4+noise(x*.25,z*.25,s+91)*1.5));}
function addBlock(x,y,z,type){const id=K(x,y,z);if(blocks.has(id))return;const mesh=new THREE.Mesh(cube,materials[type]||materials.grass);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={x,y,z,type};worldGroup.add(mesh);blocks.set(id,mesh);}
function removeBlock(x,y,z){const mesh=blocks.get(K(x,y,z));if(!mesh)return;worldGroup.remove(mesh);blocks.delete(K(x,y,z));}
function topBlock(x,z){const ix=Math.round(x),iz=Math.round(z);let top=-1;for(let y=0;y<=70;y++)if(blocks.has(K(ix,y,iz)))top=y;return top;}
function floorY(x,z){const top=topBlock(x,z);return top<0?terrainHeight(Math.round(x),Math.round(z),world?.seed||1)+.5:top+.5;}
function clearWorld(){for(const mesh of blocks.values())worldGroup.remove(mesh);blocks.clear();while(decoGroup.children.length)decoGroup.remove(decoGroup.children[0]);}
function generateWorld(){clearWorld();const seed=Number(world?.seed||1),radius=34;for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++){if(Math.hypot(x,z)>radius+2)continue;const h=terrainHeight(x,z,seed);for(let y=0;y<=h;y++){let type=y===h?'grass':y>=h-2?'dirt':'stone';if(y<2&&rnd(x,z,seed+3)>.93)type='gold';if(y===h&&rnd(x,z,seed+4)>.968)type='crystal';addBlock(x,y,z,type);}}for(let i=0;i<55;i++){const x=Math.floor(rnd(i*4,seed,seed)*57)-28,z=Math.floor(rnd(seed,i*7,seed+7)*57)-28,y=topBlock(x,z)+1;if(y<1)continue;const g=new THREE.Group(),trunk=new THREE.Mesh(new THREE.CylinderGeometry(.3,.42,3.1,7),new THREE.MeshStandardMaterial({color:0x765038,roughness:.9})),leaves=new THREE.Mesh(new THREE.IcosahedronGeometry(1.55,1),materials.leaf);trunk.position.y=1.55;leaves.position.y=3.45;g.add(trunk,leaves);g.position.set(x,y,z);decoGroup.add(g);}}
function loadBlocks(list){clearWorld();if(Array.isArray(list)&&list.length){for(const b of list)addBlock(Number(b.x),Number(b.y),Number(b.z),String(b.type));}else generateWorld();}
function playerFloorCollision(x,z){const r=.28,feetY=camera.position.y-1.65,low=Math.floor(feetY+.05),high=Math.floor(feetY+1.55);for(const [sx,sz] of [[x-r,z-r],[x+r,z-r],[x-r,z+r],[x+r,z+r]]){const cx=Math.floor(sx),cz=Math.floor(sz);if(blocks.has(K(cx,low,cz))||blocks.has(K(cx,high,cz)))return true;}return false;}
function resetSpawn(){camera.position.set(0,floorY(0,0)+1.65+.04,4);velocityY=0;grounded=true;yaw=0;pitch=-.12;updateCamera();}
function updateCamera(){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;}
function move(dt){if(!started||paused)return;updateCamera();const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),direction=new THREE.Vector3();if(keys.has('w'))direction.add(forward);if(keys.has('s'))direction.sub(forward);if(keys.has('d'))direction.add(right);if(keys.has('a'))direction.sub(right);if(direction.lengthSq())direction.normalize();const speed=mode==='creative'?(keys.has('shift')?13:7):(keys.has('shift')?7.5:4.8);if(mode==='creative'){camera.position.addScaledVector(direction,speed*dt);if(keys.has(' '))camera.position.y+=speed*dt;if(keys.has('control'))camera.position.y-=speed*dt;}else{const oldX=camera.position.x,oldZ=camera.position.z;camera.position.x+=direction.x*speed*dt;if(playerFloorCollision(camera.position.x,camera.position.z))camera.position.x=oldX;camera.position.z+=direction.z*speed*dt;if(playerFloorCollision(camera.position.x,camera.position.z))camera.position.z=oldZ;const jump=keys.has(' ');if(jump&&!jumpWasDown&&grounded){velocityY=7.2;grounded=false;}jumpWasDown=jump;velocityY-=19*dt;camera.position.y+=velocityY*dt;const floor=floorY(camera.position.x,camera.position.z),wanted=floor+1.65;if(camera.position.y<=wanted){camera.position.y=wanted;velocityY=0;grounded=true;}else grounded=false;}camera.position.x=THREE.MathUtils.clamp(camera.position.x,-64,64);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-64,64);camera.position.y=THREE.MathUtils.clamp(camera.position.y,1.8,64);$('worldCoords').textContent=`X ${Math.round(camera.position.x)} · Y ${Math.round(camera.position.y-1.65)} · Z ${Math.round(camera.position.z)}`;}
function raycastBlock(){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);return ray.intersectObjects([...blocks.values()],false).find(hit=>hit.distance<=7)||null;}
function startMining(){const hit=raycastBlock();if(!hit)return;mineTarget=hit.object;mineStartedAt=performance.now();mineDuration=Math.max(120,(HARD[mineTarget.userData.type]||.5)*520);$('breakMeter').style.display='block';}
function updateMining(now){if(!mining){mineTarget=null;$('breakMeter').style.display='none';return;}const hit=raycastBlock();if(!hit||hit.object!==mineTarget){mineTarget=null;$('breakMeter').style.display='none';if(hit)startMining();return;}const progress=Math.min(1,(now-mineStartedAt)/mineDuration);$('breakMeter').querySelector('span').style.width=`${progress*100}%`;if(progress>=1){const b=mineTarget.userData;if(b.y>0){removeBlock(b.x,b.y,b.z);if(mode==='survival')inventoryData[b.type]=(inventoryData[b.type]||0)+1;setDirty(true);renderHotbar();scheduleSave();toast(`${N[b.type]} collected`);}mineTarget=null;$('breakMeter').style.display='none';}}
function placeBlock(){const hit=raycastBlock();if(!hit)return;const type=HOT[selected];if(mode==='survival'&&!(inventoryData[type]||0)){toast(`No ${N[type]} left`,'error');return;}const normal=hit.face?.normal||new THREE.Vector3(0,1,0),p=hit.object.position.clone().add(normal),x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);if(Math.abs(x)>64||Math.abs(z)>64||y<0||y>64||blocks.has(K(x,y,z)))return;addBlock(x,y,z,type);if(mode==='survival')inventoryData[type]--;setDirty(true);renderHotbar();scheduleSave();}
function renderHotbar(){const root=$('hotbar');if(!root)return;root.innerHTML='';HOT.forEach((type,index)=>{const button=document.createElement('button');button.className=`hot-slot ${index===selected?'selected':''}`;button.type='button';button.innerHTML=`<span class="slot-number">${index+1}</span><span class="voxel-icon voxel-${type}"></span><b class="count">${mode==='creative'?'∞':inventoryData[type]||0}</b>`;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();selected=index;renderHotbar();});root.appendChild(button);});}
function renderInventory(){const grid=$('inventoryGrid'),recipes=$('recipeGrid');if(!grid||!recipes)return;grid.innerHTML='';Object.keys(N).forEach(type=>{const button=document.createElement('button');button.className='inv-slot';button.type='button';button.innerHTML=`<span class="voxel-icon voxel-${type}"></span><b>${mode==='creative'?'∞':inventoryData[type]||0}</b><small>${N[type]}</small>`;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const index=HOT.indexOf(type);if(index>=0)selected=index;renderHotbar();$('inventoryPanel').hidden=true;resumeIfNeeded();});grid.appendChild(button);});const recipesData=[['Planks','wood',1,'wood',4],['Glass','sand',4,'glass',1],['Brick','stone',2,'brick',1],['Crystal Block','crystal',2,'crystal',1],['Vexa Ingot','gold',3,'gold',1]];recipesData.forEach(([name,input,need,output,amount])=>{const button=document.createElement('button');button.className='recipe';button.type='button';button.disabled=mode!=='creative'&&(inventoryData[input]||0)<need;button.innerHTML=`<span class="voxel-icon voxel-${output}"></span><span><strong>${name}</strong><small>${need} × ${N[input]} → ${amount}</small></span>`;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(mode!=='creative')inventoryData[input]-=need;inventoryData[output]=(inventoryData[output]||0)+amount;renderInventory();renderHotbar();toast(`${name} crafted`);});recipes.appendChild(button);});}
function openInventory(){mining=false;paused=true;$('inventoryPanel').hidden=false;renderInventory();}
function closeInventory(){ $('inventoryPanel').hidden=true;paused=false;updateCamera(); }
function toggleInventory(){if($('inventoryPanel').hidden)openInventory();else closeInventory();}
function pauseGame(show=true){if(show){paused=true;mining=false;$('pausePanel').hidden=false;$('inventoryPanel').hidden=true;}else{paused=false;$('pausePanel').hidden=true;updateCamera();}}
function startGame(){started=true;paused=false;$('startOverlay').style.display='none';$('pausePanel').hidden=true;$('inventoryPanel').hidden=true;$('actionStatus').textContent='WORLD LIVE · WASD MOVE · MMB LOOK';toast('World ready — use WASD to move');}
function resumeIfNeeded(){if(started){paused=false;$('pausePanel').hidden=true;}}
function updateMode(){mode=mode==='survival'?'creative':'survival';$('modeButton').textContent=mode.toUpperCase();$('worldType').textContent=mode.toUpperCase();$('modeLabel').textContent=mode.toUpperCase();renderHotbar();renderInventory();toast(`${mode.toUpperCase()} mode`);}
function labelSprite(name){const canvas=document.createElement('canvas');canvas.width=320;canvas.height=72;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(8,10,16,.88)';ctx.roundRect(8,8,304,56,16);ctx.fill();ctx.fillStyle='#fff';ctx.font='800 24px Arial';ctx.textAlign='center';ctx.fillText('@'+name,160,44);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false}));sprite.scale.set(3.1,.7,1);sprite.position.y=2.8;return sprite;}
function makeRemotePlayer(player){const group=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(.68,1.1,.48),new THREE.MeshStandardMaterial({color:0x7b6cff,roughness:.7})),head=new THREE.Mesh(new THREE.SphereGeometry(.34,14,10),new THREE.MeshStandardMaterial({color:0xffc6aa,roughness:.7}));body.position.y=1.05;head.position.y=1.85;group.add(body,head,labelSprite(player.username||player.displayName||'explorer'));group.position.set(player.x,player.y-1.65,player.z);return group;}
async function syncPresence(){try{await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw})});const data=await api(`/api/presence?worldId=${encodeURIComponent(worldId)}`),seen=new Set();for(const p of(data.players||[])){seen.add(p.userId);if(me&&p.userId===me.id)continue;let avatar=others.get(p.userId);if(!avatar){avatar=makeRemotePlayer(p);others.set(p.userId,avatar);playerGroup.add(avatar);}avatar.position.lerp(new THREE.Vector3(p.x,p.y-1.65,p.z),.35);avatar.rotation.y=p.yaw||0;}for(const[id,avatar]of others)if(!seen.has(id)){playerGroup.remove(avatar);others.delete(id);}$('playerCount').textContent=`${Math.max(1,(data.players||[]).length)} online`;}catch{}}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function loadChat(){try{const data=await api(`/api/chat?worldId=${encodeURIComponent(worldId)}&after=${lastChatId}`);for(const message of(data.messages||[])){lastChatId=message.id;const row=document.createElement('div');row.className='chat-line';row.innerHTML=`<b>@${escapeHtml(message.username)}</b><span>${escapeHtml(message.message)}</span>`;$('worldChatMessages').appendChild(row);}const box=$('worldChatMessages');box.scrollTop=box.scrollHeight;}catch{}}
async function sendChat(){const input=$('worldChatInput'),message=input.value.trim();if(!message)return;input.value='';try{await api(`/api/chat?worldId=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message})});await loadChat();}catch(error){toast(error.message,'error');}}
function toggleChat(force){const panel=$('chatPanel'),open=force??!panel.classList.contains('open');panel.classList.toggle('open',open);if(open){paused=true;$('worldChatInput').focus();loadChat();}else paused=false;}
async function saveWorld(){try{await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:[...blocks.values()].map(mesh=>mesh.userData)})});setDirty(false);toast('World saved');}catch(error){toast(error.message,'error');}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveWorld,900);}
async function loadWorld(){try{const info=await api(`/api/worlds?id=${encodeURIComponent(worldId)}`);world=info.world;$('worldName').textContent=world.name;$('startWorldName').textContent=world.name;$('worldType').textContent=(world.type||'normal').toUpperCase();mode=world.type==='creative'?'creative':'survival';$('modeButton').textContent=mode.toUpperCase();$('modeLabel').textContent=mode.toUpperCase();try{const state=await api(`/api/worlds/state?id=${encodeURIComponent(worldId)}`);loadBlocks(state.blocks||[]);}catch{generateWorld();}const account=await api('/api/auth/me').catch(()=>null);me=account?.user||null;$('playerName').textContent=me?.displayName||me?.username||'Explorer';resetSpawn();renderHotbar();renderInventory();await syncPresence();await loadChat();setInterval(syncPresence,4000);setInterval(loadChat,2200);$('saveState').textContent='SYNCED';renderer.setAnimationLoop(loop);}catch(error){$('startWorldName').textContent='Unable to load world';toast(error.message,'error');console.error(error);}}
function loop(time){const dt=Math.min(.05,Math.max(.001,(time-(loop.last||time))/1000));loop.last=time;move(dt);updateMining(time);renderer.render(scene,camera);}

document.addEventListener('keydown',event=>{if(event.target.matches('input,textarea,button'))return;const key=event.key.toLowerCase();if(['w','a','s','d','shift','control',' '].includes(key)){keys.add(key);event.preventDefault();}if(key>='1'&&key<='9'){selected=Number(key)-1;renderHotbar();}if(key==='e'){event.preventDefault();toggleInventory();}if(key==='t'){event.preventDefault();toggleChat();}if(key==='escape'){event.preventDefault();if($('chatPanel').classList.contains('open'))toggleChat(false);else if(!$('inventoryPanel').hidden)closeInventory();else pauseGame(!paused);}});
document.addEventListener('keyup',event=>{const key=event.key.toLowerCase();keys.delete(key);if(key===' ')jumpWasDown=false;});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
renderer.domElement.addEventListener('mousedown',event=>{if(!started||paused)return;if(event.button===1){looking=true;lastMouseX=event.clientX;lastMouseY=event.clientY;event.preventDefault();}else if(event.button===0){mining=true;startMining();}else if(event.button===2){placeBlock();}});
addEventListener('mouseup',event=>{if(event.button===1)looking=false;if(event.button===0){mining=false;mineTarget=null;$('breakMeter').style.display='none';}});
addEventListener('mousemove',event=>{if(!looking||paused||!started)return;const dx=event.clientX-lastMouseX,dy=event.clientY-lastMouseY;lastMouseX=event.clientX;lastMouseY=event.clientY;yaw-=dx*.006;pitch=THREE.MathUtils.clamp(pitch-dy*.006,-1.45,1.45);updateCamera();});
renderer.domElement.addEventListener('mouseleave',()=>{looking=false;});

$('playNow').addEventListener('click',e=>{e.preventDefault();startGame();});
$('resumeButton').addEventListener('click',e=>{e.preventDefault();pauseGame(false);});
$('pauseInventory').addEventListener('click',e=>{e.preventDefault();openInventory();});
$('pauseExit').addEventListener('click',e=>{e.preventDefault();location.href='./dashboard.html';});
$('inventoryButton').addEventListener('click',e=>{e.preventDefault();toggleInventory();});
$('closeInventory').addEventListener('click',e=>{e.preventDefault();closeInventory();});
$('modeButton').addEventListener('click',e=>{e.preventDefault();updateMode();});
$('chatToggle').addEventListener('click',e=>{e.preventDefault();toggleChat();});
$('chatClose').addEventListener('click',e=>{e.preventDefault();toggleChat(false);});
$('worldChatSend').addEventListener('click',e=>{e.preventDefault();sendChat();});
$('worldChatInput').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter')sendChat();if(e.key==='Escape')toggleChat(false);});
$('saveWorld').addEventListener('click',e=>{e.preventDefault();saveWorld();});
$('backHome').addEventListener('click',e=>{e.preventDefault();location.href='./dashboard.html';});
$('gameShell').addEventListener('mousedown',e=>{if(e.target.closest('.game-hud,.game-actions,.hotbar,.world-chat,.inventory-panel,.pause-panel,.start-overlay'))e.stopPropagation();});

loadWorld();
