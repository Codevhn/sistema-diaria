const VALID_EMAIL = "admin@gmail.com";
const VALID_PASSWORD = "@satanQuiereTuAlma@";

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const errorBox = document.getElementById("login-error");

function setError(message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  if (!errorBox) return;
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

emailInput?.addEventListener("input", clearError);
passwordInput?.addEventListener("input", clearError);

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = (emailInput?.value || "").trim().toLowerCase();
  const password = passwordInput?.value || "";

  if (email === VALID_EMAIL && password === VALID_PASSWORD) {
    localStorage.setItem("auth", "true");
    window.location.href = "./index.html";
    return;
  }

  setError("Credenciales incorrectas. Intenta de nuevo.");
});
