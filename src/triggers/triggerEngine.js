import { supabase } from "../supabaseClient.js";
import { parseDrawDate } from "../date-utils.js";

const RELATIONS_TABLE = "trigger_relations";
const EVENTS_TABLE = "trigger_events";
const STATS_VIEW = "trigger_relation_stats";
const DAY_MS = 24 * 60 * 60 * 1000;
const HORARIO_TO_HOUR = {
  "11AM": 11,
  "12PM": 12,
  "3PM": 15,
  "6PM": 18,
  "9PM": 21,
};

let cachedUserId = null;

async function requireUserId() {
  if (cachedUserId) return cachedUserId;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message || "No se pudo obtener el usuario actual");
  const userId = data?.user?.id;
  if (!userId) throw new Error("Sesión inválida, inicia sesión nuevamente.");
  cachedUserId = userId;
  return userId;
}

function normalizeNumber(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  const positive = ((parsed % 100) + 100) % 100;
  return positive;
}

function normalizeDays(value, fallback = 0) {
  if (value === null || typeof value === "undefined") return fallback;
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function ensureRelationPayload(data = {}) {
  const origin = normalizeNumber(data.origin);
  const target = normalizeNumber(data.target);
  if (!Number.isInteger(origin) || !Number.isInteger(target)) {
    throw new Error("Selecciona números válidos entre 00 y 99 para origen y disparado.");
  }
  const relationType = (data.relationType || data.relation_type || "").toUpperCase();
  if (!["DISPARA", "AVISA", "REFUERZA"].includes(relationType)) {
    throw new Error("Tipo de relación inválido.");
  }
  const windowMinDays = normalizeDays(data.windowMinDays ?? data.window_min_days, 0);
  const windowMaxDays = normalizeDays(data.windowMaxDays ?? data.window_max_days, 5);
  if (windowMaxDays < windowMinDays) {
    throw new Error("El máximo de días debe ser mayor o igual al mínimo.");
  }
  return {
    origin,
    target,
    relationType,
    windowMinDays,
    windowMaxDays,
    notes: data.notes?.trim() || null,
    isActive: typeof data.isActive === "boolean" ? data.isActive : data.is_active !== false,
  };
}

function mapRelationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    origin: row.origin,
    target: row.target,
    relationType: row.relation_type,
    windowMinDays: row.window_min_days,
    windowMaxDays: row.window_max_days,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEventRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    relationId: row.relation_id,
    origin: row.origin,
    target: row.target,
    originDrawId: row.origin_draw_id,
    originTs: row.origin_ts,
    deadlineTs: row.deadline_ts,
    status: row.status,
    hitDrawId: row.hit_draw_id,
    hitTs: row.hit_ts,
    lagDays: row.lag_days,
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}

function mapStatsRow(row) {
  if (!row) return null;
  return {
    relationId: row.relation_id,
    userId: row.user_id,
    origin: row.origin,
    target: row.target,
    relationType: row.relation_type,
    windowMinDays: row.window_min_days,
    windowMaxDays: row.window_max_days,
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalEvents: row.total_events ?? 0,
    hitCount: row.hit_count ?? 0,
    missCount: row.miss_count ?? 0,
    lateHitCount: row.late_hit_count ?? 0,
    hitRate: Number(row.hit_rate ?? 0),
    missRate: Number(row.miss_rate ?? 0),
    lateRate: Number(row.late_rate ?? 0),
    avgLagDays: typeof row.avg_lag_days === "number" ? row.avg_lag_days : null,
    medianLagDays: typeof row.median_lag_days === "number" ? row.median_lag_days : null,
    p80LagDays: typeof row.p80_lag_days === "number" ? row.p80_lag_days : null,
  };
}

function resolveDrawTimestamp(draw = {}) {
  if (draw.origin_ts) return new Date(draw.origin_ts).toISOString();
  if (typeof draw.createdAt === "number") {
    const byNumber = new Date(draw.createdAt);
    if (!Number.isNaN(byNumber.getTime())) return byNumber.toISOString();
  }
  if (typeof draw.createdAt === "string") {
    const byString = new Date(draw.createdAt);
    if (!Number.isNaN(byString.getTime())) return byString.toISOString();
  }
  const fechaDate = parseDrawDate(draw.fecha);
  const hours = HORARIO_TO_HOUR[(draw.horario || "").toUpperCase()] ?? 0;
  const base = fechaDate || new Date();
  const ts = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, 0, 0, 0);
  return ts.toISOString();
}

function computeDeadline(originIso, windowMaxDays) {
  const base = new Date(originIso);
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  const deadline = new Date(base.getTime() + windowMaxDays * DAY_MS);
  return deadline.toISOString();
}

function normalizeFilterNumber(value) {
  const normalized = normalizeNumber(value);
  return Number.isInteger(normalized) ? normalized : null;
}

export async function createRelation(data) {
  const userId = await requireUserId();
  const payload = ensureRelationPayload(data);
  const insertPayload = {
    user_id: userId,
    origin: payload.origin,
    target: payload.target,
    relation_type: payload.relationType,
    window_min_days: payload.windowMinDays,
    window_max_days: payload.windowMaxDays,
    is_active: payload.isActive,
    notes: payload.notes,
  };
  const { data: row, error } = await supabase
    .from(RELATIONS_TABLE)
    .insert([insertPayload])
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "No se pudo crear la relación");
  return mapRelationRow(row);
}

export async function updateRelation(id, patch = {}) {
  if (!id) throw new Error("Selecciona una relación para actualizar.");
  await requireUserId();
  const payload = {};
  if (patch.origin !== undefined) {
    const value = normalizeNumber(patch.origin);
    if (!Number.isInteger(value)) throw new Error("Origen inválido.");
    payload.origin = value;
  }
  if (patch.target !== undefined) {
    const value = normalizeNumber(patch.target);
    if (!Number.isInteger(value)) throw new Error("Disparado inválido.");
    payload.target = value;
  }
  if (patch.relationType || patch.relation_type) {
    const type = (patch.relationType || patch.relation_type || "").toUpperCase();
    if (!["DISPARA", "AVISA", "REFUERZA"].includes(type)) throw new Error("Tipo inválido.");
    payload.relation_type = type;
  }
  if (patch.windowMinDays !== undefined || patch.window_min_days !== undefined) {
    payload.window_min_days = normalizeDays(patch.windowMinDays ?? patch.window_min_days, 0);
  }
  if (patch.windowMaxDays !== undefined || patch.window_max_days !== undefined) {
    payload.window_max_days = normalizeDays(patch.windowMaxDays ?? patch.window_max_days, 0);
  }
  if (
    payload.window_min_days !== undefined &&
    payload.window_max_days !== undefined &&
    payload.window_max_days < payload.window_min_days
  ) {
    throw new Error("El máximo de días debe ser mayor o igual al mínimo.");
  }
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
  if (patch.isActive !== undefined) payload.is_active = !!patch.isActive;
  const { data, error } = await supabase
    .from(RELATIONS_TABLE)
    .update(payload)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message || "No se pudo actualizar la relación");
  return mapRelationRow(data);
}

export async function deleteRelation(id) {
  if (!id) throw new Error("Relación no encontrada.");
  await requireUserId();
  const { error } = await supabase.from(RELATIONS_TABLE).delete().eq("id", id);
  if (error) throw new Error(error.message || "No se pudo eliminar la relación");
  return true;
}

export async function listRelations(filters = {}) {
  await requireUserId();
  let query = supabase.from(RELATIONS_TABLE).select("*").order("origin").order("target");
  const origin = normalizeFilterNumber(filters.origin);
  if (Number.isInteger(origin)) query = query.eq("origin", origin);
  const target = normalizeFilterNumber(filters.target);
  if (Number.isInteger(target)) query = query.eq("target", target);
  if (filters.relationType) query = query.eq("relation_type", filters.relationType.toUpperCase());
  if (typeof filters.isActive === "boolean") query = query.eq("is_active", filters.isActive);
  const { data, error } = await query;
  if (error) throw new Error(error.message || "No se pudieron listar las relaciones.");
  return (data || []).map(mapRelationRow);
}

export async function listEvents(filters = {}) {
  await requireUserId();
  let query = supabase.from(EVENTS_TABLE).select("*").order("origin_ts", { ascending: false });
  query = query.limit(filters.limit ?? 60);
  if (filters.status) query = query.eq("status", filters.status);
  const origin = normalizeFilterNumber(filters.origin);
  if (Number.isInteger(origin)) query = query.eq("origin", origin);
  const target = normalizeFilterNumber(filters.target);
  if (Number.isInteger(target)) query = query.eq("target", target);
  const { data, error } = await query;
  if (error) throw new Error(error.message || "No se pudieron listar los eventos.");
  return (data || []).map(mapEventRow);
}

export async function computeRelationStats(filters = {}) {
  await requireUserId();
  let query = supabase.from(STATS_VIEW).select("*");
  const origin = normalizeFilterNumber(filters.origin);
  if (Number.isInteger(origin)) query = query.eq("origin", origin);
  const target = normalizeFilterNumber(filters.target);
  if (Number.isInteger(target)) query = query.eq("target", target);
  if (filters.relationType) query = query.eq("relation_type", filters.relationType.toUpperCase());
  if (typeof filters.isActive === "boolean") query = query.eq("is_active", filters.isActive);
  query = query.order("hit_rate", { ascending: false }).order("total_events", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message || "No se pudieron calcular las métricas.");
  return (data || []).map(mapStatsRow);
}

async function createEventsForOrigin(draw) {
  const numero = normalizeNumber(draw.numero);
  if (!Number.isInteger(numero)) return 0;
  const originTs = resolveDrawTimestamp(draw);
  const userId = await requireUserId();
  const { data: relations, error } = await supabase
    .from(RELATIONS_TABLE)
    .select("id, origin, target, window_max_days")
    .eq("user_id", userId)
    .eq("origin", numero)
    .eq("is_active", true);
  if (error) throw new Error(error.message || "No se pudieron consultar las relaciones activas.");
  if (!relations?.length) return 0;
  const payload = relations.map((relation) => ({
    user_id: userId,
    relation_id: relation.id,
    origin: relation.origin,
    target: relation.target,
    origin_draw_id: draw.id ?? null,
    origin_ts: originTs,
    deadline_ts: computeDeadline(originTs, relation.window_max_days),
    status: "OPEN",
  }));
  const { error: insertError } = await supabase.from(EVENTS_TABLE).insert(payload);
  if (insertError) throw new Error(insertError.message || "No se pudieron crear los eventos.");
  return payload.length;
}

async function resolveHitsForTarget(draw) {
  const numero = normalizeNumber(draw.numero);
  if (!Number.isInteger(numero)) return 0;
  const drawTs = resolveDrawTimestamp(draw);
  const userId = await requireUserId();
  const { data: events, error } = await supabase
    .from(EVENTS_TABLE)
    .select("id, relation_id, origin_ts, deadline_ts")
    .eq("user_id", userId)
    .eq("status", "OPEN")
    .eq("target", numero);
  if (error) throw new Error(error.message || "No se pudieron consultar eventos abiertos.");
  if (!events?.length) return 0;
  const relationIds = [...new Set(events.map((event) => event.relation_id))];
  const { data: relationRows, error: relError } = await supabase
    .from(RELATIONS_TABLE)
    .select("id, window_min_days, window_max_days")
    .in("id", relationIds);
  if (relError) throw new Error(relError.message || "No se pudieron consultar las ventanas.");
  const relationMap = new Map();
  relationRows?.forEach((row) => relationMap.set(row.id, row));
  let updated = 0;
  for (const event of events) {
    const relation = relationMap.get(event.relation_id);
    if (!relation) continue;
    const originTs = new Date(event.origin_ts);
    const targetTs = new Date(drawTs);
    if (Number.isNaN(originTs.getTime()) || Number.isNaN(targetTs.getTime())) continue;
    const lagDays = Math.max(0, Math.floor((targetTs - originTs) / DAY_MS));
    if (lagDays < relation.window_min_days) continue;
    const status = lagDays <= relation.window_max_days ? "HIT" : "LATE_HIT";
    const updatePayload = {
      status,
      lag_days: lagDays,
      hit_ts: drawTs,
      hit_draw_id: draw.id ?? null,
      closed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase.from(EVENTS_TABLE).update(updatePayload).eq("id", event.id);
    if (updateError) throw new Error(updateError.message || "No se pudo actualizar un evento.");
    updated += 1;
  }
  return updated;
}

export async function processNewDraw(draw) {
  if (!draw) return;
  await createEventsForOrigin(draw);
  await resolveHitsForTarget(draw);
}

export async function closeExpiredEvents(nowTs = new Date()) {
  await requireUserId();
  const nowIso = nowTs instanceof Date ? nowTs.toISOString() : new Date(nowTs).toISOString();
  const { error, data } = await supabase
    .from(EVENTS_TABLE)
    .update({ status: "MISS", closed_at: nowIso })
    .eq("status", "OPEN")
    .lt("deadline_ts", nowIso)
    .select("id");
  if (error) throw new Error(error.message || "No se pudieron cerrar eventos vencidos.");
  return data?.length ?? 0;
}

export async function seedSampleRelations() {
  const userId = await requireUserId();
  const samples = [
    { origin: 37, target: 47, relationType: "DISPARA", windowMinDays: 0, windowMaxDays: 5 },
    { origin: 37, target: 96, relationType: "DISPARA", windowMinDays: 0, windowMaxDays: 5 },
    { origin: 44, target: 95, relationType: "AVISA", windowMinDays: 0, windowMaxDays: 5 },
  ];
  const { data: existing, error } = await supabase
    .from(RELATIONS_TABLE)
    .select("origin, target, relation_type")
    .eq("user_id", userId)
    .in("origin", samples.map((s) => s.origin));
  if (error) throw new Error(error.message || "No se pudieron validar las relaciones existentes.");
  const existingSet = new Set(
    (existing || []).map((row) => `${row.origin}-${row.target}-${row.relation_type}`),
  );
  const missing = samples.filter(
    (sample) => !existingSet.has(`${sample.origin}-${sample.target}-${sample.relationType}`),
  );
  if (!missing.length) {
    return { created: 0, message: "Ya tienes cargados los ejemplos solicitados." };
  }
  for (const sample of missing) {
    await createRelation({ ...sample, notes: "Semilla automática" });
  }
  return { created: missing.length };
}
