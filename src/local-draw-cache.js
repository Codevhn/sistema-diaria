const SNAPSHOT_KEY = "ld:drawSnapshot:v1";
const MODE_KEY = "ld:preferLocalDraws";

const storage =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : undefined;

const safeNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

function normalizeDraw(draw = {}) {
  const fecha = typeof draw.fecha === "string" ? draw.fecha.trim() : "";
  const pais = typeof draw.pais === "string" ? draw.pais.trim().toUpperCase() : "";
  const horario = typeof draw.horario === "string" ? draw.horario.trim().toUpperCase() : "";
  const numero = safeNumber(draw.numero, NaN);
  if (!fecha || !pais || !horario || Number.isNaN(numero)) return null;
  const createdAt =
    typeof draw.createdAt === "number" && Number.isFinite(draw.createdAt)
      ? draw.createdAt
      : safeNumber(draw.createdAt, Date.now());
  return {
    fecha,
    pais,
    horario,
    numero,
    isTest: !!draw.isTest,
    createdAt,
  };
}

function minifyDraw(draw) {
  return {
    f: draw.fecha,
    p: draw.pais,
    h: draw.horario,
    n: draw.numero,
    t: draw.isTest ? 1 : 0,
    c: draw.createdAt,
  };
}

function hydrateDraw(raw = {}) {
  if (!raw.f || !raw.p || !raw.h) return null;
  const numero = safeNumber(raw.n, NaN);
  if (Number.isNaN(numero)) return null;
  const createdAt = safeNumber(raw.c, Date.now());
  return {
    fecha: String(raw.f),
    pais: String(raw.p),
    horario: String(raw.h),
    numero,
    isTest: raw.t === 1,
    createdAt,
  };
}

function readRawSnapshot() {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadLocalDrawSnapshot() {
  const parsed = readRawSnapshot();
  if (!parsed || !Array.isArray(parsed.draws)) {
    return { draws: [], updatedAt: 0 };
  }
  const draws = parsed.draws.map(hydrateDraw).filter(Boolean);
  return {
    draws,
    updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
  };
}

export function saveLocalDrawSnapshot(draws = []) {
  if (!storage || !Array.isArray(draws)) return null;
  const normalized = draws.map(normalizeDraw).filter(Boolean);
  if (!normalized.length) {
    try {
      storage.removeItem(SNAPSHOT_KEY);
    } catch {
      /* noop */
    }
    return null;
  }
  const updatedAt = Date.now();
  try {
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        v: 1,
        updatedAt,
        draws: normalized.map(minifyDraw),
      }),
    );
  } catch {
    return null;
  }
  return { draws: normalized, updatedAt };
}

export function isLocalDrawSnapshotModeEnabled() {
  if (!storage) return false;
  try {
    return storage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLocalDrawSnapshotMode(enabled) {
  if (!storage) return false;
  try {
    if (enabled) {
      storage.setItem(MODE_KEY, "1");
    } else {
      storage.removeItem(MODE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
