import * as THREE from 'https://esm.sh/three@0.180.0';
import { OrbitControls } from 'https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const worldId = params.get('id');
const canvasHost = document.getElementById('gameCanvas');
const worldNameEl = document.getElementById('worldName');
const worldTypeEl = document.getElementById('worldType');
const selectedBlocks = document.querySelectorAll('.block-choice');
let selectedBlock = 'grass';

if (!worldId) location.href = './dashboard.html';

async function loadWorld() {
  const response = await fetch(`/api/worlds?id=${encodeURIComponent(worldId)}`, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'World not found.');
  worldNameEl.textContent = data.world.name;
  worldTypeEl.textContent = data.world.type.toUpperCase();
}

try { await loadWorld(); } catch (error) { worldNameEl.textContent = error.message; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x09061a);
scene.fog = new THREE.Fog(0x09061a, 28, 78);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 150);
camera.position.set(16, 12, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 11;
controls.maxDistance = 32;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minPolarAngle = Math.PI * 0.20;
controls.target.set(0, 1.5, 0);

scene.add(new THREE.HemisphereLight(0xcac6ff, 0x171028, 2.0));
const sun = new THREE.DirectionalLight(0xffe4c1, 3.0);
sun.position.set(-12, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// Soft world glow.
const moon = new THREE.Mesh(
  new THREE.SphereGeometry(2.4, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xd9d5ff })
);
moon.position.set(-18, 20, -26);
scene.add(moon);
const moonGlow = new THREE.PointLight(0x9e8dff, 8, 32);
moonGlow.position.copy(moon.position);
scene.add(moonGlow);

// Stars give VEXORA its own night-world identity.
const starPositions = new Float32Array(420 * 3);
for (let i = 0; i < 420; i++) {
  starPositions[i * 3] = (Math.random() - 0.5) * 110;
  starPositions[i * 3 + 1] = 12 + Math.random() * 45;
  starPositions[i * 3 + 2] = -55 - Math.random() * 35;
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.75 })));

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
  if (blocks.has(id)) return;
  const mesh = new THREE.Mesh(blockGeometry, materials[type] || materials.grass);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x, y, z, type };
  scene.add(mesh);
  blocks.set(id, mesh);
}

function removeBlock(mesh) {
  const { x, y, z } = mesh.userData;
  if (y <= 0) return;
  scene.remove(mesh);
  blocks.delete(key(x, y, z));
}

// Main island: broad enough to feel like a real game world rather than a demo tile.
for (let x = -10; x <= 10; x++) {
  for (let z = -7; z <= 7; z++) {
    const edge = Math.max(Math.abs(x) / 10, Math.abs(z) / 7);
    if (edge <= 0.98 && Math.random() > 0.07) {
      addBlock(x, 0, z, 'stone');
      addBlock(x, 1, z, 'dirt');
      addBlock(x, 2, z, 'grass');
    }
  }
}

// Floating platforms create vertical exploration.
for (let x = -8; x <= -4; x++) for (let z = 0; z <= 2; z++) addBlock(x, 6, z, 'stone');
for (let x = 4; x <= 8; x++) for (let z = -3; z <= -1; z++) addBlock(x, 5, z, 'stone');

function addTree(x, z, scale = 1) {
  for (let y = 3; y < 6; y++) addBlock(x, y, z, 'wood');
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) + Math.abs(dz) <= 3) addBlock(x + dx, 6, z + dz, 'leaf');
  }
  addBlock(x, 7, z, 'leaf');
}
addTree(-5, -3);
addTree(6, 4);
addTree(2, -5);

// VEXORA crystal grove.
for (const [x, z, y] of [[0, 0, 3], [1, 0, 3], [-1, 1, 3], [7, 1, 3], [8, 2, 3], [-7, 3, 3]]) {
  addBlock(x, y, z, 'crystal');
  addBlock(x, y + 1, z, 'crystal');
}

// A small portal landmark.
for (let y = 3; y <= 6; y++) { addBlock(-1, y, -2, 'gold'); addBlock(2, y, -2, 'gold'); }
for (let x = -1; x <= 2; x++) addBlock(x, 6, -2, 'gold');
const portal = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.14, 10, 40), new THREE.MeshStandardMaterial({ color: 0xff7edb, emissive: 0xa52b83, emissiveIntensity: 1.4 }));
portal.rotation.y = Math.PI / 2;
portal.position.set(0.5, 4.65, -2);
scene.add(portal);
const portalLight = new THREE.PointLight(0xff4fd8, 4, 8);
portalLight.position.copy(portal.position);
scene.add(portalLight);

// Player: simple original VEXORA explorer avatar.
const player = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.58), new THREE.MeshStandardMaterial({ color: 0x9d7cff, roughness: 0.55 }));
body.position.y = 0.55;
body.castShadow = true;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 20), new THREE.MeshStandardMaterial({ color: 0xffc5e9, roughness: 0.6 }));
head.position.y = 1.25;
head.castShadow = true;
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.08), new THREE.MeshStandardMaterial({ color: 0x70eaff, emissive: 0x1c7da0, emissiveIntensity: 0.8 }));
visor.position.set(0, 1.3, -0.39);
player.add(body, head, visor);
player.position.set(0, 3.05, 4);
scene.add(player);
const playerLight = new THREE.PointLight(0xff8ee1, 2.0, 6);
player.add(playerLight);

// Movement and simple gravity.
const keys = new Set();
let velocityY = 0;
let grounded = true;
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  if ((e.key === ' ' || e.key.toLowerCase() === 'w') && grounded) { velocityY = 7; grounded = false; }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function movePlayer(dt) {
  const speed = 5.5;
  const direction = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) direction.z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) direction.z += 1;
  if (keys.has('a') || keys.has('arrowleft')) direction.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) direction.x += 1;
  if (direction.lengthSq()) {
    direction.normalize();
    player.position.addScaledVector(direction, speed * dt);
    player.rotation.y = Math.atan2(direction.x, direction.z);
  }
  velocityY -= 18 * dt;
  player.position.y += velocityY * dt;
  const floorY = 3.05;
  if (player.position.y <= floorY) { player.position.y = floorY; velocityY = 0; grounded = true; }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -9.3, 9.3);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -6.3, 6.3);
}

// Build / destroy blocks.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects([...blocks.values()], false)[0];
}
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const hit = pick(event);
  if (!hit) return;
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  if (event.shiftKey) removeBlock(hit.object);
  else {
    const p = hit.object.position.clone().add(normal.multiplyScalar(0.51));
    addBlock(Math.round(p.x), Math.round(p.y), Math.round(p.z), selectedBlock);
  }
});

selectedBlocks.forEach((element) => element.addEventListener('click', () => {
  selectedBlocks.forEach((item) => item.classList.remove('active'));
  element.classList.add('active');
  selectedBlock = element.dataset.block;
}));

document.getElementById('backHome').addEventListener('click', () => { location.href = './dashboard.html#worlds'; });
document.getElementById('buildMode').addEventListener('click', (event) => event.currentTarget.classList.toggle('active'));

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
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  movePlayer(dt);
  portal.rotation.z += dt * 0.7;
  portalLight.intensity = 3.5 + Math.sin(performance.now() * 0.004) * 0.8;
  controls.target.lerp(new THREE.Vector3(player.position.x, player.position.y + 1.2, player.position.z), 0.08);
  controls.update();
  renderer.render(scene, camera);
}
animate();
