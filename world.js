import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const worldId = params.get('id');
if (!worldId) location.href = './dashboard.html';

const $ = (id) => document.getElementById(id);
const canvasHost = $('gameCanvas');
const worldNameEl = $('worldName');
const worldTypeEl = $('worldType');
const saveStateEl = $('saveState');
const actionStatusEl = $('actionStatus');
const coordsEl = $('worldCoords');
const locationEl = $('locationName');
const toastEl = $('toast');
const buildButton = $('buildMode');
const saveButton = $('saveWorld');
const selectedBlocks = document.querySelectorAll('.block-choice');

let selectedBlock = 'grass';
let buildEnabled = true;
let dirty = false;
let saveTimer = null;
let toastTimer = null;
const blocks = new Map();
const key = (x, y, z) => `${x},${y},${z}`;

function toast(message, kind = 'success') {
  toastEl.textContent = message;
  toastEl.className = `game-toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'game-toast'; }, 2200);
}
function setDirty(value) {
  dirty = value;
  saveStateEl.textContent = value ? 'UNSAVED' : 'SYNCED';
  saveStateEl.classList.toggle('dirty', value);
  saveStateEl.classList.remove('error');
}
function setSaveError() { saveStateEl.textContent = 'SYNC ERROR'; saveStateEl.classList.add('error'); }
async function getJson(url, options) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9e8);
scene.fog = new THREE.FogExp2(0x8ec9e8, 0.0085);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
camera.position.set(13, 9, 16);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
canvasHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5.5;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minPolarAngle = Math.PI * 0.12;
controls.target.set(0, 3, 0);
scene.add(new THREE.HemisphereLight(0xdff7ff, 0x31516a, 2.2));
const sun = new THREE.DirectionalLight(0xfff2d4, 3.8);
sun.position.set(-25, 35, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55; sun.shadow.camera.right = 55; sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
scene.add(sun);

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x69d78d, roughness: 0.92 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x855b50, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x74809a, roughness: 0.86 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x79e9ff, emissive: 0x1578a0, emissiveIntensity: 0.9, roughness: 0.18, metalness: 0.08 }),
};
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blocks = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
function addBlock(x, y, z, type = 'grass') {
  const id = key(x, y, z); if (blocks.has(id)) return false;
  const mesh = new THREE.Mesh(blockGeometry, materials[type] || materials.grass);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { x, y, z, type };
  scene.add(mesh); blocks.set(id, mesh); return true;
}
function removeBlock(mesh) { const { x, y, z } = mesh.userData; if (y <= 0) return false; scene.remove(mesh); blocks.delete(key(x, y, z)); return true; }
function terrainHeight(x, z) {
  const a = Math.sin(x * 0.13) * 1.15, b = Math.cos(z * 0.16) * 1.0, c = Math.sin((x + z) * 0.085) * 1.4, d = Math.cos((x - z) * 0.055) * 1.25;
  const valley = Math.exp(-((x * x + z * z) / 280)) * 1.3;
  return Math.max(2, Math.floor(3.5 + a + b + c + d - valley));
}
function generateWorldBlocks() {
  for (let x = -28; x <= 28; x++) for (let z = -22; z <= 22; z++) {
    const edge = Math.max(Math.abs(x) / 31, Math.abs(z) / 25); if (edge > 0.97) continue;
    const h = terrainHeight(x, z);
    for (let y = 0; y <= h; y++) addBlock(x, y, z, y === h ? 'grass' : y > h - 3 ? 'dirt' : 'stone');
  }
}

const scenery = new THREE.Group(); scene.add(scenery);
function makeTree(x, z, scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.34*scale,.48*scale,2.7*scale,8),new THREE.MeshStandardMaterial({color:0x70462f,roughness:1}));
  trunk.position.y=1.35*scale; trunk.castShadow=true; group.add(trunk);
  const leafMat=new THREE.MeshStandardMaterial({color:0x3f9f71,roughness:.88});
  [[0,3.05,0,1.35],[-.7,2.65,.1,1],[.75,2.7,-.1,1],[0,3.8,0,.82]].forEach(([px,py,pz,s])=>{const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(s*scale,1),leafMat);crown.position.set(px*scale,py*scale,pz*scale);crown.castShadow=true;group.add(crown);});
  group.position.set(x,terrainHeight(Math.round(x),Math.round(z))+.1,z); scenery.add(group);
}
function makeRock(x,z,s=1){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),new THREE.MeshStandardMaterial({color:0x7f8c9a,roughness:.96}));rock.position.set(x,terrainHeight(Math.round(x),Math.round(z))+s*.45,z);rock.scale.set(1.25,.75,.95);rock.rotation.set(.1*x,.3*z,.1);rock.castShadow=true;scenery.add(rock);}
function makeFlower(x,z,color){const stem=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.35,5),new THREE.MeshStandardMaterial({color:0x3f8c5b}));stem.position.set(x,terrainHeight(Math.round(x),Math.round(z))+.2,z);const bloom=new THREE.Mesh(new THREE.SphereGeometry(.11,8,8),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.08}));bloom.position.set(x,stem.position.y+.23,z);scenery.add(stem,bloom);}
for(const [x,z,s] of [[-20,-12,1.2],[-15,10,1.1],[-7,-14,1.3],[7,15,1.2],[16,8,1.25],[21,-8,1.1],[12,-16,.95],[-22,4,1.25]]) makeTree(x,z,s);
for(const [x,z,s] of [[-23,-3,1.3],[-12,15,1.1],[0,-18,1.5],[13,11,1.25],[22,1,1.4],[17,-14,1]]) makeRock(x,z,s);
for(let i=0;i<34;i++){const x=Math.round((Math.random()-.5)*48),z=Math.round((Math.random()-.5)*38);makeFlower(x,z,[0xffa6df,0xffd56f,0x9ee9ff][i%3]);}

const water=new THREE.Mesh(new THREE.CircleGeometry(11,64),new THREE.MeshStandardMaterial({color:0x42b9dc,transparent:true,opacity:.72,roughness:.15}));
water.rotation.x=-Math.PI/2;water.scale.set(1.35,.72,1);water.position.set(10,3.15,-7);scenery.add(water);
const waterRing=new THREE.Mesh(new THREE.RingGeometry(10.5,11.1,64),new THREE.MeshStandardMaterial({color:0x9beaff,transparent:true,opacity:.28,side:THREE.DoubleSide}));
waterRing.rotation.x=-Math.PI/2;waterRing.scale.set(1.35,.72,1);waterRing.position.copy(water.position);waterRing.position.y+=.03;scenery.add(waterRing);

const mountains=new THREE.Group();
for(let i=0;i<18;i++){const angle=i/18*Math.PI*2,r=48+(i%3)*5,h=10+(i%5)*3;const m=new THREE.Mesh(new THREE.ConeGeometry(7+(i%4)*2,h,6),new THREE.MeshStandardMaterial({color:i%2?0x547b86:0x496b7b,roughness:1}));m.position.set(Math.cos(angle)*r,h/2-1,Math.sin(angle)*r);m.rotation.y=angle;m.castShadow=true;mountains.add(m);}scene.add(mountains);
const clouds=new THREE.Group();const cloudMat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.78,roughness:1});
for(let i=0;i<9;i++){const g=new THREE.Group();for(let j=0;j<4;j++){const c=new THREE.Mesh(new THREE.SphereGeometry(1.7+Math.random()*1.2,16,12),cloudMat);c.position.set(j*2.2,Math.random()*.6,Math.sin(j)*.7);g.add(c);}g.position.set(-45+i*11,18+(i%3)*4,-20-i*4);g.scale.setScalar(.65+(i%2)*.25);clouds.add(g);}scene.add(clouds);

const portalGroup=new THREE.Group();
const portal=new THREE.Mesh(new THREE.TorusGeometry(1.6,.18,14,48),new THREE.MeshStandardMaterial({color:0xff8be4,emissive:0xb62c96,emissiveIntensity:1.5,metalness:.2,roughness:.2}));portal.rotation.y=Math.PI/2;portalGroup.add(portal);
const portalCore=new THREE.Mesh(new THREE.CircleGeometry(1.4,48),new THREE.MeshBasicMaterial({color:0x4d2a77,transparent:true,opacity:.82,side:THREE.DoubleSide}));portalCore.rotation.y=Math.PI/2;portalGroup.add(portalCore);
const portalLight=new THREE.PointLight(0xff62d8,7,13);portalGroup.add(portalLight);const portalX=0,portalZ=-2,portalY=terrainHeight(0,-2)+1.8;portalGroup.position.set(portalX,portalY,portalZ);scene.add(portalGroup);

const player=new THREE.Group();
const skin=new THREE.MeshStandardMaterial({color:0xffc6e9,roughness:.6}),suit=new THREE.MeshStandardMaterial({color:0x9b78ff,roughness:.5}),boot=new THREE.MeshStandardMaterial({color:0x25243f,roughness:.65});
const head=new THREE.Mesh(new THREE.SphereGeometry(.43,20,16),skin);head.position.y=1.65;
const torso=new THREE.Mesh(new THREE.BoxGeometry(.72,.85,.52),suit);torso.position.y=1;
const visor=new THREE.Mesh(new THREE.BoxGeometry(.56,.2,.07),new THREE.MeshStandardMaterial({color:0x77eaff,emissive:0x2387a7,emissiveIntensity:1}));visor.position.set(0,1.68,-.4);
const armL=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.48,6,10),suit);armL.position.set(-.48,1.02,0);armL.rotation.z=-.18;const armR=armL.clone();armR.position.x=.48;armR.rotation.z=.18;
const legL=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.48,6,10),boot);legL.position.set(-.2,.38,0);const legR=legL.clone();legR.position.x=.2;
player.add(head,torso,visor,armL,armR,legL,legR);[head,torso,visor,armL,armR,legL,legR].forEach(m=>m.castShadow=true);player.add(new THREE.PointLight(0xff7edb,1.5,5));
let playerGroundY=terrainHeight(0,4)+1.05;player.position.set(0,playerGroundY,4);scene.add(player);let velocityY=0,grounded=true,walkTime=0;
const keys=new Set();window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys.add(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k===' '&&grounded){velocityY=7.5;grounded=false;}const n=Number(e.key);if(n>=1&&n<=3)selectBlock(n);});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
function selectBlock(slot){const target=[...selectedBlocks].find(el=>el.dataset.slot===String(slot));if(!target)return;selectedBlocks.forEach(el=>el.classList.remove('active'));target.classList.add('active');selectedBlock=target.dataset.block;toast(`${selectedBlock.toUpperCase()} selected`);}selectedBlocks.forEach(el=>el.addEventListener('click',()=>selectBlock(Number(el.dataset.slot))));
function getGroundY(x,z){const gx=Math.round(x),gz=Math.round(z);let top=-1;for(let y=0;y<18;y++)if(blocks.has(key(gx,y,gz)))top=y;return top>=0?top+1.05:terrainHeight(gx,gz)+1.05;}
function movePlayer(dt){const input=new THREE.Vector3();if(keys.has('w')||keys.has('arrowup'))input.z-=1;if(keys.has('s')||keys.has('arrowdown'))input.z+=1;if(keys.has('a')||keys.has('arrowleft'))input.x-=1;if(keys.has('d')||keys.has('arrowright'))input.x+=1;let moving=false;if(input.lengthSq()){input.normalize();const forward=new THREE.Vector3();camera.getWorldDirection(forward);forward.y=0;forward.normalize();const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();const move=new THREE.Vector3().addScaledVector(right,input.x).addScaledVector(forward,-input.z).normalize();player.position.addScaledVector(move,6.4*dt);player.rotation.y=Math.atan2(move.x,move.z);moving=true;}velocityY-=20*dt;player.position.y+=velocityY*dt;playerGroundY=getGroundY(player.position.x,player.position.z);if(player.position.y<=playerGroundY){player.position.y=playerGroundY;velocityY=0;grounded=true;}player.position.x=THREE.MathUtils.clamp(player.position.x,-27,27);player.position.z=THREE.MathUtils.clamp(player.position.z,-21,21);if(moving&&grounded){walkTime+=dt*11;legL.rotation.x=Math.sin(walkTime)*.48;legR.rotation.x=-Math.sin(walkTime)*.48;armL.rotation.x=-Math.sin(walkTime)*.35;armR.rotation.x=Math.sin(walkTime)*.35;}else{legL.rotation.x*=.8;legR.rotation.x*=.8;armL.rotation.x*=.8;armR.rotation.x*=.8;}coordsEl.textContent=`X ${Math.round(player.position.x)} · Y ${Math.round(player.position.y)} · Z ${Math.round(player.position.z)}`;const d=player.position.distanceTo(new THREE.Vector3(portalX,portalY,portalZ));locationEl.textContent=d<7?'VEXA GATE':player.position.x>10?'SUNSET LAKE':player.position.z<-10?'CRYSTAL RIDGE':player.position.z>10?'WILLOW HILLS':'VEXA MEADOWS';}

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerDownAt=null;
function pick(event){const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects([...blocks.values()],false)[0];}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)pointerDownAt={x:e.clientX,y:e.clientY,shift:e.shiftKey||keys.has('shift')};});
renderer.domElement.addEventListener('pointerup',e=>{if(!pointerDownAt||e.button!==0||!buildEnabled)return;const dist=Math.hypot(e.clientX-pointerDownAt.x,e.clientY-pointerDownAt.y),wasShift=pointerDownAt.shift;pointerDownAt=null;if(dist>8)return;const hit=pick(e);if(!hit)return;if(wasShift){if(removeBlock(hit.object)){setDirty(true);toast('Block removed');scheduleSave();}return;}const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld),p=hit.object.position.clone().add(normal.multiplyScalar(.51));if(Math.abs(p.x)>29||Math.abs(p.z)>23)return;if(addBlock(Math.round(p.x),Math.round(p.y),Math.round(p.z),selectedBlock)){setDirty(true);toast(`${selectedBlock} placed`);scheduleSave();}});

function serializeBlocks(){return [...blocks.values()].map(m=>({...m.userData}));}
async function saveWorld(){if(!dirty){toast('World is already synced');return;}saveStateEl.textContent='SAVING…';try{const data=await getJson(`/api/worlds/state?id=${encodeURIComponent(worldId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({blocks:serializeBlocks()})});setDirty(false);actionStatusEl.textContent=`SYNCED · ${data.saved} BLOCKS`;toast('World saved to VEXORA cloud');}catch(error){setSaveError();actionStatusEl.textContent='SYNC FAILED';toast(error.message,'error');}}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveWorld,1800);}saveButton.addEventListener('click',saveWorld);
buildButton.addEventListener('click',()=>{buildEnabled=!buildEnabled;buildButton.classList.toggle('active',buildEnabled);buildButton.textContent=buildEnabled?'BUILD':'LOOK';toast(buildEnabled?'Build mode enabled':'Look mode enabled');});
$('backHome').addEventListener('click',()=>{if(dirty&&confirm('You have unsaved changes. Exit anyway?'))location.href='./dashboard.html';else if(!dirty)location.href='./dashboard.html';});

async function loadWorld(){try{const [meta,state]=await Promise.all([getJson(`/api/worlds?id=${encodeURIComponent(worldId)}`),getJson(`/api/worlds/state?id=${encodeURIComponent(worldId)}`)]);worldNameEl.textContent=meta.world.name;worldTypeEl.textContent=meta.world.type.toUpperCase();const saved=state.blocks||[];if(saved.length>=1000){saved.forEach(b=>addBlock(b.x,b.y,b.z,b.type));}else{generateWorldBlocks();setDirty(true);scheduleSave();}setDirty(false);actionStatusEl.textContent='WORLD ONLINE';if(saved.length<1000)toast('Welcome to the expanded VEXORA world');}catch(error){actionStatusEl.textContent='OFFLINE WORLD';setSaveError();generateWorldBlocks();toast(error.message,'error');}}
function resize(){const w=canvasHost.clientWidth,h=canvasHost.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}window.addEventListener('resize',resize);resize();
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.035);movePlayer(dt);controls.target.lerp(new THREE.Vector3(player.position.x,player.position.y+1.4,player.position.z),.08);controls.update();portal.rotation.z+=dt*.5;portalCore.rotation.z-=dt*.28;water.material.opacity=.68+Math.sin(performance.now()*.0014)*.06;clouds.position.x=(performance.now()*.0007)%18;renderer.render(scene,camera);}
await loadWorld();animate();
