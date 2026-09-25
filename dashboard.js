async function loadAccount() {
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
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.href = './';
});

document.getElementById('playButton').addEventListener('click', () => {
  alert('3D game client will be connected next. Your account system is ready.');
});

loadAccount();
