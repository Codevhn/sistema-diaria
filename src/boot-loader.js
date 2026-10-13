const BOOT_ID = "boot-loader";

function getBootEl() {
  return document.getElementById(BOOT_ID);
}

export function showBootLoader() {
  const el = getBootEl();
  if (!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-busy", "true");
}

export function hideBootLoader() {
  const el = getBootEl();
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-busy", "false");
}

export function setBootStatus(message) {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = message;
}
