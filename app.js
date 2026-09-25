const form = document.getElementById('loginForm');
const identity = document.getElementById('identity');
const password = document.getElementById('password');
const message = document.getElementById('message');
const togglePassword = document.getElementById('togglePassword');
const guestButton = document.getElementById('guestButton');

togglePassword.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  togglePassword.textContent = show ? 'Hide' : 'Show';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = 'message';
  message.textContent = 'Signing you in…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: identity.value.trim(), password: password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Login failed.');
    message.textContent = `Welcome back, ${data.user.displayName || data.user.username}!`;
    setTimeout(() => { window.location.href = './dashboard.html'; }, 350);
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
});

guestButton.addEventListener('click', () => {
  sessionStorage.setItem('vexora_guest', '1');
  window.location.href = './dashboard.html?guest=1';
});

document.getElementById('forgotLink').addEventListener('click', (e) => {
  e.preventDefault();
  message.className = 'message';
  message.textContent = 'Password recovery will be added after the core account system.';
});
