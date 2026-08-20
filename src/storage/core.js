import { supabase } from "../supabaseClient.js";

export const DAY_MS = 86400000;
export const PAGE_SIZE = 500;

const TABLE_PRIMARY_KEYS = {
  draws: "id",
  knowledge: "key",
  hypothesis_logs: "id",
  prediction_logs: "id",
  hypothesis_reminders: "id",
  game_modes: "id",
  game_mode_examples: "id",
  game_mode_logs: "id",
  notebook_entries: "id",
  pega3: "id",
};

const TABLES_TO_RESET = [
  "draws",
  "knowledge",
  "hypothesis_logs",
  "prediction_logs",
  "hypothesis_reminders",
  "game_modes",
  "game_mode_examples",
  "game_mode_logs",
  "notebook_entries",
  "pega3",
];

const PEGAS_TURNOS = ["11AM", "3PM", "9PM"];

export { TABLE_PRIMARY_KEYS, TABLES_TO_RESET, PEGAS_TURNOS };

export function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isIsoLikeString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

export function toIsoIfNeeded(value) {
  if (typeof value === "number" && value > 1e12 && value < 1e15) {
    return new Date(value).toISOString();
  }
  return value;
}

export function normalizeTimestamps(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "number" && /[Tt]ime|[Ss]tamp|[Aa]t$/.test(key)) {
      out[key] = toIsoIfNeeded(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function encodeRecord(record) {
  if (!record || typeof record !== "object") return record;
  const snake = {};
  for (const [key, value] of Object.entries(record)) {
    const column = camelToSnake(key);
    snake[column] = toIsoIfNeeded(value);
  }
  return snake;
}

export function decodeRecord(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [column, value] of Object.entries(row)) {
    const key = snakeToCamel(column);
    if (typeof value === "string" && isIsoLikeString(value)) {
      const ms = Date.parse(value);
      if (!Number.isNaN(ms)) {
        out[key] = ms;
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

export function decodeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => decodeRecord(row));
}

export function getPrimaryKey(table) {
  return TABLE_PRIMARY_KEYS[table] || "id";
}

export function getPrimaryColumn(table) {
  return getPrimaryKey(table) === "id" ? "id" : "key";
}

export function reportSupabaseError(context, error) {
  if (!error) return false;
  console.error(`[Supabase:${context}]`, error.message || error);
  return true;
}

export function reportSupabaseException(context, err) {
  console.error(`[Supabase:${context}:exception]`, err?.message || err);
  return true;
}

export function isDuplicatePrimaryError(err) {
  if (!err) return false;
  const msg = String(err?.message || err?.code || "").toLowerCase();
  const code = String(err?.code || "");
  return (
    msg.includes("duplicate") ||
    msg.includes("23505") ||
    code === "23505" ||
    msg.includes("unique constraint") ||
    msg.includes("already exists")
  );
}

export async function getNextId(table) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reportSupabaseError(`getNextId:${table}`, error)) return null;
    const maxId = data?.id ?? 0;
    const numericMax = typeof maxId === "number" ? maxId : parseInt(maxId, 10);
    if (Number.isNaN(numericMax)) return null;
    return numericMax + 1;
  } catch (err) {
    reportSupabaseException(`getNextId:${table}`, err);
    return null;
  }
}

export function applyNullableFilter(query, column, value) {
  return value === null ? query.is(column, null) : query.eq(column, value);
}

export async function insertRecord(table, data, context, attempt = 0) {
  try {
    const payload = encodeRecord(data);
    const { data: row, error } = await supabase.from(table).insert([payload]).select().maybeSingle();
    if (reportSupabaseError(context, error)) {
      const err = new Error(error?.message || "Supabase insert error");
      err.code = error?.code;
      throw err;
    }
    if (!row) throw new Error(`${context}: Supabase no devolvió fila insertada`);
    return decodeRecord(row);
  } catch (err) {
    const primaryKey = getPrimaryKey(table);
    const hasCustomPrimary = Object.prototype.hasOwnProperty.call(data || {}, primaryKey);
    if (
      isDuplicatePrimaryError(err) &&
      attempt === 0 &&
      primaryKey === "id" &&
      !hasCustomPrimary
    ) {
      const nextId = await getNextId(table);
      if (Number.isFinite(nextId)) {
        return insertRecord(table, { ...data, id: nextId }, `${context}:retry`, attempt + 1);
      }
    }
    reportSupabaseException(context, err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

export async function updateByPrimary(table, primaryValue, changes, context) {
  if (primaryValue === null || typeof primaryValue === "undefined") return 0;
  const payload = encodeRecord(changes);
  if (!Object.keys(payload).length) return 0;
  const primaryColumn = getPrimaryColumn(table);
  try {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq(primaryColumn, primaryValue)
      .select();
    if (reportSupabaseError(context, error)) return 0;
    return data?.length ?? 0;
  } catch (err) {
    reportSupabaseException(context, err);
    return 0;
  }
}

export async function deleteByPrimary(table, values, context) {
  if (!Array.isArray(values) || !values.length) return 0;
  const primaryColumn = getPrimaryColumn(table);
  try {
    const { error } = await supabase.from(table).delete().in(primaryColumn, values);
    if (reportSupabaseError(context, error)) return 0;
    return values.length;
  } catch (err) {
    reportSupabaseException(context, err);
    return 0;
  }
}

export async function selectAll(table, { order = [], filters = [] } = {}) {
  try {
    let from = 0;
    const allRows = [];
    while (true) {
      let query = supabase.from(table).select("*");
      filters.forEach((apply) => {
        query = apply(query);
      });
      order.forEach((rule) => {
        query = query.order(rule.column, { ascending: rule.ascending !== false });
      });
      query = query.range(from, from + PAGE_SIZE - 1);
      const { data, error } = await query;
      if (reportSupabaseError(`selectAll:${table}`, error)) return allRows;
      const decoded = decodeRows(data);
      allRows.push(...decoded);
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return allRows;
  } catch (err) {
    reportSupabaseException(`selectAll:${table}`, err);
    return [];
  }
}

export async function selectSingle(table, filters = [], context) {
  try {
    let query = supabase.from(table).select("*");
    filters.forEach((apply) => {
      query = apply(query);
    });
    const { data, error } = await query.maybeSingle();
    if (reportSupabaseError(context, error)) return null;
    return data ? decodeRecord(data) : null;
  } catch (err) {
    reportSupabaseException(context, err);
    return null;
  }
}

export async function clearTable(table) {
  try {
    const column = getPrimaryColumn(table);
    const { error } = await supabase.from(table).delete().not(column, "is", null);
    reportSupabaseError(`clear:${table}`, error);
  } catch (err) {
    reportSupabaseException(`clear:${table}`, err);
  }
}

export function withTimestamp(data) {
  return { ...data, updatedAt: data.updatedAt ?? Date.now() };
}
