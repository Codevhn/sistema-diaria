import Dexie from "https://esm.sh/dexie@3.2.4?bundle";
import { supabase } from "./supabaseClient.js";

const STORE_DEFINITION = {
  draws: "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
  hypotheses: "++id, numero, simbolo, estado, fecha, turno, createdAt",
  reasons: "++id, ownerType, ownerId, texto, tags, createdAt",
  rules: "++id, tipo, descripcion, createdAt",
  edges: "++id, fromFactId, toId, ruleId, weight, createdAt",
  knowledge: "&key, scope, updatedAt",
  hypothesis_logs:
    "++id, hypothesisId, numero, estado, fechaResultado, paisResultado, horarioResultado, createdAt, [numero+estado]",
  prediction_logs:
    "++id, targetFecha, targetPais, turno, numero, estado, createdAt, [targetFecha+targetPais]",
  game_modes: "++id, nombre, tipo, descripcion, createdAt",
  game_mode_examples: "++id, modeId, original, resultado, nota, createdAt",
  game_mode_logs:
    "++id, modeId, fecha, pais, turno, notas, createdAt, [modeId+fecha]",
  hypothesis_reminders: "++id, numero, createdAt",
  notebook_entries: "++id, fecha, pais, createdAt",
  pega3: "++id, fecha, horario, pais, pares, createdAt, [fecha+horario+pais]",
};

const TABLE_CONFIG = [
  { name: "draws", primary: "id", orderBy: "id" },
  { name: "hypotheses", primary: "id", orderBy: "id" },
  { name: "reasons", primary: "id", orderBy: "id" },
  { name: "rules", primary: "id", orderBy: "id" },
  { name: "edges", primary: "id", orderBy: "id" },
  { name: "knowledge", primary: "key", orderBy: "key" },
  { name: "hypothesis_logs", primary: "id", orderBy: "id" },
  { name: "prediction_logs", primary: "id", orderBy: "id" },
  { name: "game_modes", primary: "id", orderBy: "id" },
  { name: "game_mode_examples", primary: "id", orderBy: "id" },
  { name: "game_mode_logs", primary: "id", orderBy: "id" },
  { name: "hypothesis_reminders", primary: "id", orderBy: "id" },
  { name: "notebook_entries", primary: "id", orderBy: "id" },
  { name: "pega3", primary: "id", orderBy: "id" },
];

const TIMESTAMP_SUFFIX = /At$/;
const CHUNK_SIZE = 250;
const YIELD_DELAY_MS = 5;

let dexieDb = null;

function camelToSnake(value = "") {
  return value.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function normalizeValue(key, value) {
  if (!TIMESTAMP_SUFFIX.test(key)) return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function encodeRow(row = {}) {
  const payload = {};
  Object.entries(row).forEach(([key, value]) => {
    if (typeof value === "undefined") return;
    payload[camelToSnake(key)] = normalizeValue(key, value);
  });
  return payload;
}

async function wait(ms = YIELD_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDexie() {
  if (dexieDb) return dexieDb;
  const db = new Dexie("la_diaria_v3");
  db.version(10).stores(STORE_DEFINITION);
  await db.open();
  dexieDb = db;
  return dexieDb;
}

async function insertChunk(tableName, primaryKey, rows) {
  if (!rows.length) return;
  const payload = rows.map(encodeRow);
  const { error } = await supabase
    .from(tableName)
    .upsert(payload, { onConflict: camelToSnake(primaryKey) });
  if (error) {
    throw new Error(`Supabase error en ${tableName}: ${error.message}`);
  }
}

async function importTable(db, config) {
  const table = db.table(config.name);
  const total = await table.count();
  console.info(`[${config.name}] Iniciando importación (${total} registros)`);
  if (!total) {
    console.info(`[${config.name}] Tabla vacía, se omite.`);
    return { table: config.name, total: 0 };
  }
  let processed = 0;
  while (processed < total) {
    const batch = await table
      .orderBy(config.orderBy)
      .offset(processed)
      .limit(CHUNK_SIZE)
      .toArray();
    if (!batch.length) break;
    await insertChunk(config.name, config.primary, batch);
    processed += batch.length;
    console.info(`[${config.name}] ${processed}/${total}`);
    await wait();
  }
  console.info(`[${config.name}] Importación completa (${processed} registros).`);
  return { table: config.name, total: processed };
}

export async function runDexieToSupabaseImport(tables = TABLE_CONFIG) {
  try {
    const db = await ensureDexie();
    const summary = [];
    for (const config of tables) {
      try {
        const result = await importTable(db, config);
        summary.push(result);
      } catch (err) {
        console.error(`[${config.name}] Error durante la importación:`, err);
      }
    }
    console.info("Importación desde Dexie completada", summary);
  } catch (err) {
    console.error("No se pudo ejecutar el importador Dexie → Supabase", err);
  }
}

if (typeof window !== "undefined") {
  window.runDexieToSupabaseImport = runDexieToSupabaseImport;
}
