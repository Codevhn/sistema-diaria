const BOOT_ID = "boot-loader";

function getBootEl() {
  return document.getElementById(BOOT_ID);
}

export function showBootLoader() {
  const el = getBootEl();
  if (!el) return;
  el.classList.remove("hidden");
}

export function hideBootLoader() {
  const el = getBootEl();
  if (!el) return;
  el.classList.add("hidden");
}
