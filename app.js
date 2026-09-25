const form = document.getElementById("loginForm");
const identity = document.getElementById("identity");
const password = document.getElementById("password");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");
const guestButton = document.getElementById("guestButton");

togglePassword.addEventListener("click", () => {
  const isPassword = password.type === "password";
  password.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "Hide" : "Show";
  togglePassword.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  message.className = "message";

  const user = identity.value.trim();
  const pass = password.value;

  if (!user || !pass) {
    message.textContent = "Please fill in your login details.";
    message.classList.add("error");
    return;
  }

  if (pass.length < 6) {
    message.textContent = "Password must be at least 6 characters.";
    message.classList.add("error");
    return;
  }

  message.textContent = "UI ready — authentication will be connected next.";
});

guestButton.addEventListener("click", () => {
  message.className = "message";
  message.textContent = "Guest mode will be connected next.";
});

document.getElementById("forgotLink").addEventListener("click", (e) => {
  e.preventDefault();
  message.className = "message";
  message.textContent = "Password recovery will be connected next.";
});

document.getElementById("signupLink").addEventListener("click", (e) => {
  e.preventDefault();
  message.className = "message";
  message.textContent = "Registration will be connected next.";
});