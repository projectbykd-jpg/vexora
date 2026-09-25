const worldList = document.getElementById('worldList');
const worldModal = document.getElementById('worldModal');
const worldMessage = document.getElementById('worldMessage');

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function worldTypeLabel(type) {
  return ({ normal: '🌎 Normal', creative: '✨ Creative', adventure: '⚔️ Adventure' })[type] || '🌎 Normal';
}

function worldCard(world) {
  const isMine = world.ownerId === undefined || world.ownerId === window.__vexoraUserId;
  const ownerText = world.privacy === 'public' && world.ownerUsername
    ? ` · by @${escapeHtml(world.ownerUsername)}`
    : '';
  return `<article class="world-card">
    <div class="world-icon">✦</div>
    <div class="world-info"><strong>${escapeHtml(world.name)}</strong><p>${worldTypeLabel(world.type)} · ${world.privacy === 'public' ? '🌐 Public' : '🔒 Private'}${ownerText}</p></div>
    <a class="secondary-button world-enter" href="./world.html?id=${encodeURIComponent(world.id)}">ENTER WORLD <span>→</span></a>
  </article>`;
}

async function loadWorlds() {
  try {
    const response = await fetch('/api/worlds', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load worlds.');
    if (!data.worlds.length) {
      worldList.innerHTML = `<div class="empty-world world-empty"><div class="plus">+</div><div><strong>Your first world is waiting.</strong><p>Create a world and make it your own.</p></div><button id="emptyCreateWorld" class="secondary-button create-world">CREATE FIRST WORLD</button></div>`;
      document.getElementById('emptyCreateWorld').addEventListener('click', openWorldModal);
      return;
    }
    worldList.innerHTML = data.worlds.map(worldCard).join('');
  } catch (error) {
    worldList.innerHTML = `<div class="world-error">${escapeHtml(error.message)}</div>`;
  }
}

function openWorldModal() {
  worldModal.hidden = false;
  worldMessage.textContent = '';
  worldMessage.classList.remove('error');
  document.getElementById('worldName').focus();
}

function closeWorldModal() {
  worldModal.hidden = true;
}

async function createWorld(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const name = document.getElementById('worldName').value.trim();
  const type = document.getElementById('worldType').value;
  const privacy = document.getElementById('worldPrivacy').value;
  worldMessage.textContent = 'Creating your world…';
  worldMessage.classList.remove('error');
  button.disabled = true;
  try {
    const response = await fetch('/api/worlds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, type, privacy }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to create world.');
    closeWorldModal();
    document.getElementById('createWorldForm').reset();
    await loadWorlds();
  } catch (error) {
    worldMessage.textContent = error.message;
    worldMessage.classList.add('error');
  } finally {
    button.disabled = false;
  }
}

async function loadAccount() {
  const isGuest = new URLSearchParams(window.location.search).get('guest') === '1' || sessionStorage.getItem('vexora_guest') === '1';
  if (isGuest) {
    document.getElementById('displayName').textContent = 'Guest Explorer';
    document.getElementById('profileName').textContent = 'Guest Explorer';
    document.getElementById('profileUsername').textContent = '@guest';
    document.getElementById('profileEmail').textContent = 'Guest mode — no account saved';
    document.getElementById('avatar').textContent = 'G';
    document.getElementById('logoutButton').textContent = 'Exit Guest';
    worldList.innerHTML = `<div class="world-error">Guest mode can explore the interface, but creating worlds requires an account.</div>`;
    return;
  }
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();
    if (!response.ok || !data.authenticated) {
      window.location.href = './';
      return;
    }
    const user = data.user;
    window.__vexoraUserId = user.id;
    document.getElementById('displayName').textContent = user.displayName || user.username;
    document.getElementById('profileName').textContent = user.displayName || user.username;
    document.getElementById('profileUsername').textContent = `@${user.username}`;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('avatar').textContent = (user.displayName || user.username).charAt(0).toUpperCase();
    await loadWorlds();
  } catch {
    window.location.href = './';
  }
}

document.getElementById('logoutButton').addEventListener('click', async () => {
  sessionStorage.removeItem('vexora_guest');
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = './';
});

document.getElementById('playButton').addEventListener('click', () => {
  document.getElementById('worlds').scrollIntoView({ behavior: 'smooth' });
});
document.getElementById('openCreateWorld').addEventListener('click', openWorldModal);
document.getElementById('closeWorldModal').addEventListener('click', closeWorldModal);
document.getElementById('createWorldForm').addEventListener('submit', createWorld);
worldModal.addEventListener('click', (event) => { if (event.target === worldModal) closeWorldModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !worldModal.hidden) closeWorldModal(); });

loadAccount();
