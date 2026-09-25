const form = document.getElementById('registerForm');
const message = document.getElementById('registerMessage');
const password = document.getElementById('password');
const confirmPassword = document.getElementById('confirmPassword');

document.getElementById('togglePassword').addEventListener('click', (e) => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  confirmPassword.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.className = 'message';
  message.textContent = 'Creating your account…';
  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const displayName = document.getElementById('displayName').value.trim();
  const pass = password.value;
  const confirm = confirmPassword.value;
  if (pass !== confirm) {
    message.textContent = 'Passwords do not match.';
    message.classList.add('error');
    return;
  }
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, displayName, password: pass })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Registration failed.');
    message.textContent = 'Account created. Entering VEXORA…';
    setTimeout(() => { window.location.href = './dashboard.html'; }, 500);
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
});
