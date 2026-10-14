const BOOT_ID = "boot-loader";

function setShellLocked(locked) {
  document.querySelectorAll('[data-app-shell]').forEach(el => {
    el.inert = locked;
    if (locked) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
  });
}

export function showBootLoader() {
  const el = document.getElementById(BOOT_ID);
  if (!el) return;
  document.documentElement.classList.add('app-booting');
  document.documentElement.dataset.bootReady = 'false';
  setShellLocked(true);
  el.classList.remove("hidden");
  el.setAttribute("aria-busy", "true");
}

// Auth and data initialization may finish in either order. Neither can reveal the shell alone.
export function revealBootWhenReady() {
  const root = document.documentElement;
  if (root.classList.contains('auth-locked') || root.dataset.bootReady !== 'true') return false;
  const el = document.getElementById(BOOT_ID);
  if (!el) return false;
  el.classList.add('hidden');
  el.setAttribute('aria-busy', 'false');
  setShellLocked(false);
  root.classList.remove('app-booting');
  return true;
}

export function hideBootLoader() {
  document.documentElement.dataset.bootReady = 'true';
  return revealBootWhenReady();
}

export function setBootStatus(message) {
  const status = document.getElementById('boot-status');
  if (status) status.textContent = message;
}
