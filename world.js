import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const params = new URLSearchParams(location.search);
const worldId = params.get('id');
const canvasHost = document.getElementById('gameCanvas');
const worldNameEl = document.getElementById('worldName');
const worldTypeEl = document.getElementById('worldType');
const selectedBlocks = document.querySelectorAll('.block-choice');
let selectedBlock = 'grass';

if (!worldId) {
  location.href = './dashboard.html';
}

async function loadWorld() {
  const response = await fetch(`/api/worlds?id=${encodeURIComponent(worldId)}`, { credentials: 'include' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'World not found.');
  worldNameEl.textContent = data.world.name;
  worldTypeEl.textContent = data.world.type.toUpperCase();
}

try {
  await loadWorld();
} catch (error) {
  worldNameEl.textContent = error.message;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0920);
scene.fog = new THREE.Fog(0x0b0920, 20, 48);

const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 100);
camera.position.set(14, 13, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvasHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minZoom = 0.65;
controls.maxZoom = 2.1;
controls.target.set(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xcfc8ff, 0x211633, 2.2));
const sun = new THREE.DirectionalLight(0xffe8c8, 3.2);
sun.position.set(8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const materials = {
  grass: new THREE.MeshStandardMaterial({ color: 0x73d38b, roughness: 0.9 }),
  dirt: new THREE.MeshStandardMaterial({ color: 0x7a4f5b, roughness: 1 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x7882a8, roughness: 0.85 }),
  crystal: new THREE.MeshStandardMaterial({ color: 0x8eeaff, emissive: 0x2d77a8, emissiveIntensity: 0.7, roughness: 0.25 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8f5e46, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x7c6be8, roughness: 0.8 }),
};
const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blocks = new Map();

function key(x, y, z) { return `${x},${y},${z}`; }
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

for (let x = -6; x <= 6; x++) {
  for (let z = -5; z <= 5; z++) {
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge <= 4 || (edge === 5 && (x + z) % 2 === 0)) {
      addBlock(x, 0, z, 'stone');
      addBlock(x, 1, z, 'grass');
    }
  }
}

// Small VEXORA landmark and trees.
for (const [x, z] of [[-3,-2], [4,-2], [3,3]]) {
  addBlock(x, 2, z, 'wood');
  addBlock(x, 3, z, 'wood');
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (Math.abs(dx) + Math.abs(dz) < 3) addBlock(x + dx, 4, z + dz, 'leaf');
  }
}
addBlock(0, 2, 0, 'crystal');
addBlock(0, 3, 0, 'crystal');
addBlock(1, 2, 0, 'crystal');

const player = new THREE.Mesh(
  new THREE.BoxGeometry(.72, 1.25, .72),
  new THREE.MeshStandardMaterial({ color: 0xff91df, roughness: .55 })
);
player.position.set(0, 2.65, 2.2);
player.castShadow = true;
scene.add(player);

const playerGlow = new THREE.PointLight(0xff8ee1, 2.5, 5);
playerGlow.position.copy(player.position).add(new THREE.Vector3(0, 1, 0));
scene.add(playerGlow);

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
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);
  if (event.shiftKey) {
    removeBlock(hit.object);
  } else {
    const p = hit.object.position.clone().add(normal.multiplyScalar(0.5));
    addBlock(Math.round(p.x), Math.round(p.y), Math.round(p.z), selectedBlock);
  }
});

selectedBlocks.forEach((element) => element.addEventListener('click', () => {
  selectedBlocks.forEach((item) => item.classList.remove('active'));
  element.classList.add('active');
  selectedBlock = element.dataset.block;
}));

document.getElementById('backHome').addEventListener('click', () => { location.href = './dashboard.html#worlds'; });
document.getElementById('buildMode').addEventListener('click', (event) => {
  event.currentTarget.classList.toggle('active');
});

function resize() {
  const width = canvasHost.clientWidth;
  const height = canvasHost.clientHeight;
  const aspect = width / Math.max(height, 1);
  const view = 8;
  camera.left = -view * aspect;
  camera.right = view * aspect;
  camera.top = view;
  camera.bottom = -view;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  player.rotation.y += 0.004;
  playerGlow.position.copy(player.position).add(new THREE.Vector3(0, 1, 0));
  controls.update();
  renderer.render(scene, camera);
}
animate();
