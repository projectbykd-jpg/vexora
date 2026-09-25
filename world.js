import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const worldId = params.get('id');
const canvasHost = document.getElementById('gameCanvas');
const worldNameEl = document.getElementById('worldName');
const worldTypeEl = document.getElementById('worldType');
const saveStateEl = document.getElementById('saveState');
const actionStatusEl = document.getElementById('actionStatus');
const coordsEl = document.getElementById('worldCoords');
const toastEl = document.getElementById('toast');
const buildButton = document.getElementById('buildMode');
const saveButton = document.getElementById('saveWorld');
const selectedBlocks = document.querySelectorAll('.block-choice');

if (!worldId) location.href = './dashboard.html';

let selectedBlock = 'grass';
let buildEnabled = true;
let dirty = false;
let saveTimer = null;
let toastTimer = null;

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
  saveStateEl.classList.toggle('error', false);
  if (value) clearTimeout(saveTimer);
}
function setSaveError() {
  saveStateEl.textContent = 'SYNC ERROR';
  saveStateEl.classList.add('error');
}

async function getJson(url, options) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function loadWorld() {
  const [meta, state] = await Promise.all([
    getJson(`/api/worlds?id=${encodeURIComponent(worldId)}`),
    getJson(`/api/worlds/state?id=${encodeURIComponent(worldId)}`),
  ]);
  worldNameEl.textContent = meta.world.name;
  worldTypeEl.textContent = meta.world.type.toUpperCase();
  return { meta: meta.world, blocks: state.blocks || [] };
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070511);
scene.fog = new THREE.Fog(0x070511, 30, 95);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
camera.position.set(15, 11, 17);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minPolarAngle = Math.PI * 0.18;
controls.target.set(0, 2.8, 0);

scene.add(new THREE.HemisphereLight(0xd6d0ff, 0x100c1f, 2.0));
const sun = new THREE.DirectionalLight(0xffe6c7, 3.1);
sun.position.set(-18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);

const moon = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xdedbff }));
moon.position.set(-20, 22, -30);
scene.add(moon);
const moonGlow = new THREE.PointLight(0x9d8cff, 9, 36);
moonGlow.position.copy(moon.position);
scene.add(moonGlow);

const starPositions = new Float32Array(700 * 3);
for (let i = 0; i < 700; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 150;
  starPositions[i * 3 + 1] = 10 + Math.random() * 55;
  starPositions[i * 3 + 2] = -60 - Math.random() * 70;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.72 })));

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x69d88b, roughness: 0.88 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x70495d, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x737ba6, roughness: 0.85 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x80e8ff, emissive: 0x2466a0, emissiveIntensity: 0.75, roughness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x895541, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7967db, roughness: 0.8 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc95c, emissive: 0x7a4b08, emissiveIntensity: 0.25, roughness: 0.3 }),
};
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blocks = new Map();
const key = (x, y, z) => `${x},${y},${z}`;

function addBlock(x, y, z, type = 'grass') {
  const id = key(x, y, z);
  if (blocks.has(id)) return false;
  const mesh = new THREE.Mesh(blockGeometry, materials[type] || materials.grass);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, type };
  scene.add(mesh);
  blocks.set(id, mesh);
  return true;
}
function removeBlock(mesh) {
  const { x, y, z } = mesh.userData;
  if (y <= 0) return false;
  scene.remove(mesh);
  blocks.delete(key(x, y, z));
  return true;
}
function generateStarterWorld() {
  for (let x = -12; x <= 12; x++) {
    for (let z = -9; z <= 9; z++) {
      const edge = Math.max(Math.abs(x) / 12, Math.abs(z) / 9);
      const noise = Math.sin(x * 0.7) * 0.05 + Math.cos(z * 0.45) * 0.04;
      if (edge <= 0.96 + noise && Math.random() > 0.035) {
        addBlock(x, 0, z, 'stone');
        addBlock(x, 1, z, 'dirt');
        addBlock(x, 2, z, 'grass');
      }
    }
  }
  for (let x = -9; x <= -5; x++) for (let z = 1; z <= 3; z++) addBlock(x, 6, z, 'stone');
  for (let x = 5; x <= 9; x++) for (let z = -4; z <= -2; z++) addBlock(x, 5, z, 'stone');
  addTree(-6, -4); addTree(6, 4); addTree(2, -6);
  for (const [x, z] of [[0, 0], [1, 0], [-1, 1], [7, 1], [8, 2], [-7, 3]]) {
    addBlock(x, 3, z, 'crystal'); addBlock(x, 4, z, 'crystal');
  }
  for (let y = 3; y <= 6; y++) { addBlock(-1, y, -2, 'gold'); addBlock(2, y, -2, 'gold'); }
  for (let x = -1; x <= 2; x++) addBlock(x, 6, -2, 'gold');
}
function addTree(x, z) {
  for (let y = 3; y < 6; y++) addBlock(x, y, z, 'wood');
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) <= 3) addBlock(x + dx, 6, z + dz, 'leaf');
  }
  addBlock(x, 7, z, 'leaf');
}

const portal = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 10, 40), new THREE.MeshStandardMaterial({ color: 0xff7edb, emissive: 0xa52b83, emissiveIntensity: 1.4 }));
portal.rotation.y = Math.PI / 2;
portal.position.set(0.5, 4.65, -2);
scene.add(portal);
const portalLight = new THREE.PointLight(0xff4fd8, 4, 8);
portalLight.position.copy(portal.position);
scene.add(portalLight);

const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.58), new THREE.MeshStandardMaterial({ color: 0x9d7cff, roughness: 0.55 }));
body.position.y = 0.55; body.castShadow = true;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), new THREE.MeshStandardMaterial({ color: 0xffc5e9, roughness: 0.6 }));
head.position.y = 1.25; head.castShadow = true;
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.08), new THREE.MeshStandardMaterial({ color: 0x70eaff, emissive: 0x1c7da0, emissiveIntensity: 0.8 }));
visor.position.set(0, 1.3, -0.39);
player.add(body, head, visor);
player.position.set(0, 3.05, 4);
scene.add(player);
player.add(new THREE.PointLight(0xff8ee1, 2, 6));

let velocityY = 0;
let grounded = true;
const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (k === ' ' && grounded) { velocityY = 7; grounded = false; }
  const slot = Number(e.key);
  if (slot >= 1 && slot <= 3) selectBlock(slot);
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function selectBlock(slot) {
  const target = [...selectedBlocks].find((el) => el.dataset.slot === String(slot));
  if (!target) return;
  selectedBlocks.forEach((el) => el.classList.remove('active'));
  target.classList.add('active');
  selectedBlock = target.dataset.block;
  toast(`${selectedBlock.toUpperCase()} selected`);
}
selectedBlocks.forEach((el) => el.addEventListener('click', () => selectBlock(Number(el.dataset.slot))));

function movePlayer(dt) {
  const input = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) input.z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) input.z += 1;
  if (keys.has('a') || keys.has('arrowleft')) input.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) input.x += 1;
  if (input.lengthSq()) {
    input.normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3().addScaledVector(right, input.x).addScaledVector(forward, -input.z).normalize();
    player.position.addScaledVector(move, 5.6 * dt);
    player.rotation.y = Math.atan2(move.x, move.z);
  }
  velocityY -= 18 * dt;
  player.position.y += velocityY * dt;
  const floorY = 3.05;
  if (player.position.y <= floorY) { player.position.y = floorY; velocityY = 0; grounded = true; }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -10.5, 10.5);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -7.5, 7.5);
  coordsEl.textContent = `X ${Math.round(player.position.x)} · Y ${Math.round(player.position.y)} · Z ${Math.round(player.position.z)}`;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDownAt = null;
function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects([...blocks.values()], false)[0];
}
renderer.domElement.addEventListener('pointerdown', (event) => { if (event.button === 0) pointerDownAt = { x: event.clientX, y: event.clientY, shift: event.shiftKey }; });
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerDownAt || event.button !== 0 || !buildEnabled) return;
  const distance = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
  const wasShift = pointerDownAt.shift;
  pointerDownAt = null;
  if (distance > 8) return;
  const hit = pick(event);
  if (!hit) return;
  if (wasShift) {
    if (removeBlock(hit.object)) { setDirty(true); toast('Block removed'); scheduleSave(); }
    return;
  }
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const p = hit.object.position.clone().add(normal.multiplyScalar(0.51));
  if (addBlock(Math.round(p.x), Math.round(p.y), Math.round(p.z), selectedBlock)) {
    setDirty(true); toast(`${selectedBlock} placed`); scheduleSave();
  }
});

function serializeBlocks() {
  return [...blocks.values()].map((mesh) => ({ ...mesh.userData }));
}
async function saveWorld() {
  if (!dirty) { toast('World is already synced'); return; }
  saveStateEl.textContent = 'SAVING…';
  try {
    const data = await getJson(`/api/worlds/state?id=${encodeURIComponent(worldId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: serializeBlocks() }),
    });
    dirty = false;
    setDirty(false);
    actionStatusEl.textContent = `SYNCED · ${data.saved} BLOCKS`;
    toast('World saved to VEXORA cloud');
  } catch (error) {
    setSaveError(); actionStatusEl.textContent = 'SYNC FAILED'; toast(error.message, 'error');
  }
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveWorld, 1800); }
saveButton.addEventListener('click', saveWorld);
buildButton.addEventListener('click', () => {
  buildEnabled = !buildEnabled;
  buildButton.classList.toggle('active', buildEnabled);
  buildButton.textContent = buildEnabled ? 'BUILD' : 'LOOK';
  actionStatusEl.textContent = buildEnabled ? 'BUILD MODE' : 'LOOK MODE';
  toast(buildEnabled ? 'Build mode enabled' : 'Look mode enabled');
});
document.getElementById('backHome').addEventListener('click', async () => { if (dirty) await saveWorld(); location.href = './dashboard.html#worlds'; });
window.addEventListener('beforeunload', () => { if (dirty) saveWorld(); });

async function boot() {
  try {
    const world = await loadWorld();
    if (world.blocks.length) {
      world.blocks.forEach((block) => addBlock(Number(block.x), Number(block.y), Number(block.z), block.type));
      actionStatusEl.textContent = `WORLD LOADED · ${world.blocks.length} BLOCKS`;
    } else {
      generateStarterWorld();
      setDirty(true);
      actionStatusEl.textContent = 'NEW WORLD · SAVING STARTER MAP';
      await saveWorld();
    }
  } catch (error) {
    worldNameEl.textContent = 'World unavailable';
    actionStatusEl.textContent = 'CONNECTION ERROR';
    setSaveError();
    toast(error.message, 'error');
  }
}

function resize() {
  const width = canvasHost.clientWidth;
  const height = canvasHost.clientHeight;
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
const followTarget = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  movePlayer(dt);
  portal.rotation.z += dt * 0.75;
  portalLight.intensity = 3.5 + Math.sin(performance.now() * 0.004) * 0.8;
  followTarget.set(player.position.x, player.position.y + 1.1, player.position.z);
  controls.target.lerp(followTarget, 0.09);
  controls.update();
  renderer.render(scene, camera);
}

boot();
animate();
