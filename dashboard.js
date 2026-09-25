async function loadAccount() {
  const isGuest = new URLSearchParams(window.location.search).get('guest') === '1' || sessionStorage.getItem('vexora_guest') === '1';
  if (isGuest) {
    document.getElementById('displayName').textContent = 'Guest Explorer';
    document.getElementById('profileName').textContent = 'Guest Explorer';
    document.getElementById('profileUsername').textContent = '@guest';
    document.getElementById('profileEmail').textContent = 'Guest mode — no account saved';
    document.getElementById('avatar').textContent = 'G';
    document.getElementById('logoutButton').textContent = 'Exit Guest';
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
    document.getElementById('displayName').textContent = user.displayName || user.username;
    document.getElementById('profileName').textContent = user.displayName || user.username;
    document.getElementById('profileUsername').textContent = `@${user.username}`;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('avatar').textContent = (user.displayName || user.username).charAt(0).toUpperCase();
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
  alert('3D game client will be connected next. Your account system is ready.');
});

loadAccount();
