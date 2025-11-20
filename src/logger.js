const globalTarget =
  typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null;

let cachedDebug = null;

function computeStoredDebug() {
  if (!globalTarget || typeof globalTarget.localStorage === "undefined") return false;
  try {
    const value = globalTarget.localStorage.getItem("ld_debug");
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

function isDebugEnabled() {
  if (globalTarget && typeof globalTarget.LD_DEBUG !== "undefined") {
    return !!globalTarget.LD_DEBUG;
  }
  if (cachedDebug === null) cachedDebug = computeStoredDebug();
  return cachedDebug;
}

export function logInfo(...args) {
  if (!isDebugEnabled()) return;
  console.info(...args);
}

export function logWarn(...args) {
  if (!isDebugEnabled()) return;
  console.warn(...args);
}

export function logDebug(...args) {
  if (!isDebugEnabled()) return;
  console.debug(...args);
}

export function logError(...args) {
  console.error(...args);
}
