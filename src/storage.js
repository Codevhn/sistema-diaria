import { supabase } from "./supabaseClient.js";
import { parseDrawDate, formatDateISO } from "./date-utils.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PEGAS_TURNOS = ["11AM", "3PM", "9PM"];
const PAGE_SIZE = 1000;
const TABLE_PRIMARY_KEYS = {
  knowledge: "key",
};
const TABLES_TO_RESET = [
  "draws",
  "hypotheses",
  "reasons",
  "rules",
  "edges",
  "knowledge",
  "hypothesis_logs",
  "prediction_logs",
  "game_modes",
  "game_mode_examples",
  "game_mode_logs",
  "hypothesis_reminders",
  "notebook_entries",
  "pega3",
];

export const db = supabase;

const TIMESTAMP_SUFFIX = /At$/;

const withTimestamp = (data = {}) => ({
  ...data,
  createdAt: data.createdAt ?? Date.now(),
});

function camelToSnake(value = "") {
  return value.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function snakeToCamel(value = "") {
  return value.replace(/_([a-z0-9])/g, (_, chr) => chr.toUpperCase());
}

function toIsoIfNeeded(key, value) {
  if (!TIMESTAMP_SUFFIX.test(key) || value === null || typeof value === "undefined") {
    return value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return value;
}

function encodeRecord(data = {}) {
  const payload = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "undefined") continue;
    const normalizedValue = toIsoIfNeeded(key, value);
    payload[camelToSnake(key)] = normalizedValue;
  }
  return payload;
}

function normalizeTimestamps(record = {}) {
  for (const [key, value] of Object.entries(record)) {
    if (!TIMESTAMP_SUFFIX.test(key) || typeof value !== "string") continue;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) record[key] = parsed;
  }
  return record;
}

function decodeRecord(row) {
  if (!row || typeof row !== "object") return row;
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    output[snakeToCamel(key)] = value;
  }
  return normalizeTimestamps(output);
}

function decodeRows(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows.map(decodeRecord);
}

function getPrimaryKey(table) {
  return TABLE_PRIMARY_KEYS[table] ?? "id";
}

function getPrimaryColumn(table) {
  return camelToSnake(getPrimaryKey(table));
}

function reportSupabaseError(context, error) {
  if (!error) return false;
  console.error(`Supabase error (${context}):`, error.message || error);
  return true;
}

function reportSupabaseException(context, err) {
  if (!err) return;
  console.error(`Supabase exception (${context}):`, err.message || err);
}

function isDuplicatePrimaryError(err) {
  if (!err) return false;
  const msg = err.message || "";
  return err.code === "23505" || /duplicate key value/i.test(msg);
}

async function getNextId(table) {
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

function applyNullableFilter(query, column, value) {
  return value === null ? query.is(column, null) : query.eq(column, value);
}

async function insertRecord(table, data, context) {
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
    reportSupabaseException(context, err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function updateByPrimary(table, primaryValue, changes, context) {
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

async function deleteByPrimary(table, values, context) {
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

async function selectAll(table, { order = [], filters = [] } = {}) {
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

async function selectSingle(table, filters = [], context) {
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

async function clearTable(table) {
  try {
    const column = getPrimaryColumn(table);
    const { error } = await supabase.from(table).delete().not(column, "is", null);
    reportSupabaseError(`clear:${table}`, error);
  } catch (err) {
    reportSupabaseException(`clear:${table}`, err);
  }
}

async function findExistingDraw(rec) {
  return selectSingle(
    "draws",
    [
      (q) => q.eq("fecha", rec.fecha),
      (q) => q.eq("pais", rec.pais),
      (q) => q.eq("horario", rec.horario),
      (q) => q.eq("numero", rec.numero),
    ],
    "findDraw",
  );
}

export const DB = {
  async saveDraw(draw, opts = {}) {
    const rec = {
      ...draw,
      numero: parseInt(draw.numero, 10),
      isTest: opts.source === "test",
      createdAt: Date.now(),
    };
    if (!rec.fecha || !rec.pais || !rec.horario || Number.isNaN(rec.numero)) {
      throw new Error("saveDraw: datos incompletos");
    }
    if (opts.dryRun) {
      const dupDry = await findExistingDraw(rec);
      return { duplicate: !!dupDry };
    }
    if (!opts.force) {
      const dup = await findExistingDraw(rec);
      if (dup) {
        const changes = {};
        if (typeof dup.numero !== "number") changes.numero = rec.numero;
        if (dup.isTest !== rec.isTest) changes.isTest = rec.isTest;
        if (Object.keys(changes).length) {
          await updateByPrimary("draws", dup.id, changes, "updateDuplicateDraw");
        }
        return dup.id;
      }
    }
    try {
      const inserted = await insertRecord("draws", rec, "insertDraw");
      if (!inserted?.id) throw new Error("insertDraw: Supabase no devolvió id");
      return inserted.id;
    } catch (err) {
      if (isDuplicatePrimaryError(err)) {
        console.warn("Reintentando inserción de draw con id manual por secuencia desfasada.");
        const nextId = await getNextId("draws");
        if (!nextId) throw err;
        const inserted = await insertRecord("draws", { ...rec, id: nextId }, "insertDrawRetry");
        if (!inserted?.id) throw new Error("insertDrawRetry: Supabase no devolvió id");
        return inserted.id;
      }
      throw err;
    }
  },

  async listDraws({ excludeTest = true } = {}) {
    const rows = await selectAll("draws", {
      order: [{ column: "created_at", ascending: true }],
    });
    return excludeTest ? rows.filter((row) => !row.isTest) : rows;
  },

  async deleteDraw(id) {
    await deleteByPrimary("draws", [id], "deleteDraw");
    return true;
  },

  async deleteDrawById(id) {
    return this.deleteDraw(id);
  },

  async clearAllDraws() {
    await clearTable("draws");
    return true;
  },

  async nuke() {
    for (const table of TABLES_TO_RESET) {
      await clearTable(table);
    }
    return true;
  },

  async _add(table, data) {
    const inserted = await insertRecord(table, withTimestamp(data), `_add:${table}`);
    return inserted?.id ?? inserted?.key ?? null;
  },

  async _getAll(table) {
    return selectAll(table);
  },

  async _update(table, id, changes) {
    await updateByPrimary(table, id, changes, `_update:${table}`);
    return true;
  },

  async fixFutureDatedDraws({ maxAheadDays = 1 } = {}) {
    const rows = await selectAll("draws");
    const corrected = [];
    for (const draw of rows) {
      if (!draw || typeof draw.createdAt !== "number") continue;
      const fechaDate = parseDrawDate(draw.fecha);
      if (!fechaDate) continue;
      const createdStamp = new Date(draw.createdAt);
      if (Number.isNaN(createdStamp.getTime())) continue;
      const createdLocal = new Date(
        createdStamp.getFullYear(),
        createdStamp.getMonth(),
        createdStamp.getDate(),
      );
      const diffDays = Math.floor((fechaDate - createdLocal) / DAY_MS);
      if (diffDays <= 0 || diffDays > maxAheadDays) continue;
      const correctedFecha = formatDateISO(createdLocal);
      if (!correctedFecha) continue;
      await updateByPrimary("draws", draw.id, { fecha: correctedFecha }, "fixFutureDraw");
      corrected.push({
        id: draw.id,
        before: draw.fecha,
        after: correctedFecha,
        horario: draw.horario,
        pais: draw.pais,
        numero: draw.numero,
      });
    }
    return corrected;
  },

  async findDuplicates() {
    const all = await selectAll("draws");
    const map = new Map();
    for (const draw of all) {
      const key = `${draw.fecha}|${draw.pais}|${draw.horario}|${String(draw.numero).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(draw);
    }
    return Array.from(map.values()).filter((group) => group.length > 1);
  },

  async bulkMarkTest(ids = [], flag = true) {
    if (!ids.length) return false;
    const payload = encodeRecord({ isTest: flag });
    try {
      const { error } = await supabase.from("draws").update(payload).in("id", ids);
      if (reportSupabaseError("bulkMarkTest", error)) return false;
      return true;
    } catch (err) {
      reportSupabaseException("bulkMarkTest", err);
      return false;
    }
  },

  async saveKnowledge(entries = []) {
    if (!entries.length) return false;
    const normalized = entries.map((entry) => ({
      key: entry.key,
      scope: entry.scope || "general",
      data: entry.data ?? null,
      updatedAt: entry.updatedAt ?? Date.now(),
    }));
    const payload = normalized.map((row) => encodeRecord(row));
    try {
      const { error } = await supabase.from("knowledge").upsert(payload, { onConflict: "key" });
      if (reportSupabaseError("saveKnowledge", error)) return false;
      return true;
    } catch (err) {
      reportSupabaseException("saveKnowledge", err);
      return false;
    }
  },

  async getKnowledgeByScope(scope) {
    return selectAll("knowledge", {
      filters: scope ? [(q) => q.eq("scope", scope)] : [],
      order: [{ column: "updated_at", ascending: false }],
    });
  },

  async getKnowledge(key) {
    if (!key) return null;
    return selectSingle("knowledge", [(q) => q.eq("key", key)], "getKnowledge");
  },

  async clearKnowledge(scope) {
    if (!scope) {
      await clearTable("knowledge");
      return true;
    }
    try {
      const { error } = await supabase.from("knowledge").delete().eq("scope", scope);
      if (reportSupabaseError("clearKnowledge", error)) return false;
      return true;
    } catch (err) {
      reportSupabaseException("clearKnowledge", err);
      return false;
    }
  },

  async logHypothesisOutcome(data) {
    const entry = {
      hypothesisId: data.hypothesisId,
      numero: data.numero,
      estado: data.estado,
      fechaResultado: data.fechaResultado,
      paisResultado: data.paisResultado,
      horarioResultado: data.horarioResultado,
      fechaHipotesis: data.fechaHipotesis,
      turnoHipotesis: data.turnoHipotesis,
      createdAt: data.createdAt ?? Date.now(),
    };
    const inserted = await insertRecord("hypothesis_logs", entry, "logHypothesisOutcome");
    return inserted?.id ?? null;
  },

  async getHypothesisLogs() {
    return selectAll("hypothesis_logs", {
      order: [{ column: "created_at", ascending: true }],
    });
  },

  async getHypothesisLogsByNumber(numero) {
    return selectAll("hypothesis_logs", {
      filters: [(q) => q.eq("numero", numero)],
      order: [{ column: "created_at", ascending: true }],
    });
  },

  async logPredictions(predictions = [], context = {}) {
    if (!predictions.length) return false;
    const targetFecha = context.fecha ?? null;
    const targetPais = context.pais ?? null;
    const turno = context.turno ?? null;

    if (targetFecha !== null || targetPais !== null) {
      try {
        let updater = supabase
          .from("prediction_logs")
          .update(encodeRecord({ estado: "descartado", closedAt: Date.now() }))
          .eq("estado", "pendiente");
        updater = applyNullableFilter(updater, "target_fecha", targetFecha);
        updater = applyNullableFilter(updater, "target_pais", targetPais);
        const { error } = await updater;
        if (reportSupabaseError("discardPredictionBatch", error)) return false;
      } catch (err) {
        reportSupabaseException("discardPredictionBatch", err);
        return false;
      }
    }

    const now = Date.now();
    const entries = predictions.map((p, idx) => ({
      targetFecha,
      targetPais,
      turno: p.turno ?? turno ?? null,
      numero: p.numero,
      score: p.score ?? null,
      estado: "pendiente",
      createdAt: now + idx,
    }));
    const payload = entries.map((entry) => encodeRecord(entry));
    try {
      const { error } = await supabase.from("prediction_logs").insert(payload);
      if (reportSupabaseError("logPredictions", error)) return false;
      return true;
    } catch (err) {
      reportSupabaseException("logPredictions", err);
      return false;
    }
  },

  async markPredictionResult({ fecha, pais, numero, horario }) {
    const targetFecha = fecha ?? null;
    const targetPais = pais ?? null;
    try {
      let query = supabase
        .from("prediction_logs")
        .select("*")
        .eq("estado", "pendiente")
        .eq("numero", numero)
        .limit(1)
        .order("created_at", { ascending: true });
      query = applyNullableFilter(query, "target_fecha", targetFecha);
      query = applyNullableFilter(query, "target_pais", targetPais);
      const { data, error } = await query.maybeSingle();
      if (reportSupabaseError("findPredictionMatch", error)) return false;
      if (!data) return false;
      const match = decodeRecord(data);
      await updateByPrimary(
        "prediction_logs",
        match.id,
        {
          estado: "acierto",
          resultadoHorario: horario ?? match.turno ?? null,
          resolvedAt: Date.now(),
        },
        "markPredictionResult",
      );
      return true;
    } catch (err) {
      reportSupabaseException("markPredictionResult", err);
      return false;
    }
  },

  async closePredictionBatch({ fecha, pais }) {
    const targetFecha = fecha ?? null;
    const targetPais = pais ?? null;
    try {
      let updater = supabase
        .from("prediction_logs")
        .update(encodeRecord({ estado: "fallo", resolvedAt: Date.now() }))
        .eq("estado", "pendiente");
      updater = applyNullableFilter(updater, "target_fecha", targetFecha);
      updater = applyNullableFilter(updater, "target_pais", targetPais);
      const { error } = await updater;
      if (reportSupabaseError("closePredictionBatch", error)) return false;
      return true;
    } catch (err) {
      reportSupabaseException("closePredictionBatch", err);
      return false;
    }
  },

  async getPredictionLogs() {
    return selectAll("prediction_logs", {
      order: [{ column: "created_at", ascending: true }],
    });
  },

  async listHypothesisReminders() {
    return selectAll("hypothesis_reminders", {
      order: [{ column: "created_at", ascending: false }],
    });
  },

  async addHypothesisReminder({ numero, nota = "", simbolo = "" } = {}) {
    const n = parseInt(numero, 10);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      throw new Error("Número inválido para recordatorio");
    }
    const normalizedNote = typeof nota === "string" ? nota.trim() : "";
    const normalizedSymbol = typeof simbolo === "string" ? simbolo.trim() : "";
    const existing = await selectSingle(
      "hypothesis_reminders",
      [(q) => q.eq("numero", n)],
      "getReminder",
    );
    if (existing) {
      await updateByPrimary(
        "hypothesis_reminders",
        existing.id,
        {
          nota: normalizedNote || existing.nota || "",
          simbolo: normalizedSymbol || existing.simbolo || "",
          updatedAt: Date.now(),
        },
        "updateReminder",
      );
      return existing.id;
    }
    const inserted = await insertRecord(
      "hypothesis_reminders",
      {
        numero: n,
        nota: normalizedNote,
        simbolo: normalizedSymbol,
        createdAt: Date.now(),
      },
      "insertReminder",
    );
    return inserted?.id ?? null;
  },

  async removeHypothesisReminder(id) {
    if (id === null || typeof id === "undefined") return false;
    await deleteByPrimary("hypothesis_reminders", [id], "removeReminder");
    return true;
  },

  async createGameMode({ nombre, tipo, descripcion, operacion = "", parametros = null, offset = null }) {
    const inserted = await insertRecord(
      "game_modes",
      {
        nombre,
        tipo,
        descripcion,
        operacion,
        parametros,
        offset,
        createdAt: Date.now(),
      },
      "createGameMode",
    );
    return inserted?.id ?? null;
  },

  async updateGameMode(id, changes) {
    await updateByPrimary("game_modes", id, changes, "updateGameMode");
    return true;
  },

  async listGameModes() {
    return selectAll("game_modes", {
      order: [{ column: "created_at", ascending: true }],
    });
  },

  async deleteGameMode(id) {
    await deleteByPrimary("game_modes", [id], "deleteGameMode");
    return true;
  },

  async addGameModeExample({ modeId, original, resultado, nota }) {
    const inserted = await insertRecord(
      "game_mode_examples",
      {
        modeId,
        original,
        resultado,
        nota,
        createdAt: Date.now(),
      },
      "addGameModeExample",
    );
    return inserted?.id ?? null;
  },

  async listGameModeExamples(modeId) {
    if (!modeId) return [];
    return selectAll("game_mode_examples", {
      filters: [(q) => q.eq("mode_id", modeId)],
      order: [{ column: "created_at", ascending: true }],
    });
  },

  async deleteGameModeExample(id) {
    await deleteByPrimary("game_mode_examples", [id], "deleteGameModeExample");
    return true;
  },

  async logGameModeUsage({ modeId, fecha, pais, turno, notas }) {
    if (!modeId) throw new Error("logGameModeUsage: modeId requerido");
    const inserted = await insertRecord(
      "game_mode_logs",
      {
        modeId,
        fecha,
        pais,
        turno,
        notas,
        createdAt: Date.now(),
      },
      "logGameModeUsage",
    );
    return inserted?.id ?? null;
  },

  async listGameModeLogs({ modeId, fecha } = {}) {
    const rows = await selectAll("game_mode_logs", {
      filters: modeId ? [(q) => q.eq("mode_id", modeId)] : [],
      order: [{ column: "created_at", ascending: true }],
    });
    return fecha ? rows.filter((row) => row.fecha === fecha) : rows;
  },

  async addNotebookEntry({ fecha, pais, numeros }) {
    if (!fecha) throw new Error("Fecha requerida para el cuaderno");
    const normalizedPais = (pais || "").trim().toUpperCase() || "HN";
    const payload = {
      fecha,
      pais: normalizedPais,
      numeros: numeros || {},
      createdAt: Date.now(),
    };
    const inserted = await insertRecord("notebook_entries", payload, "addNotebookEntry");
    return inserted?.id ?? null;
  },

  async listNotebookEntries() {
    return selectAll("notebook_entries", {
      order: [{ column: "created_at", ascending: false }],
    });
  },

  async deleteNotebookEntry(id) {
    if (id === null || typeof id === "undefined") return false;
    await deleteByPrimary("notebook_entries", [id], "deleteNotebookEntry");
    return true;
  },

  async updateNotebookEntry(id, changes = {}) {
    await updateByPrimary("notebook_entries", id, changes, "updateNotebookEntry");
    return true;
  },

  async savePega3Draw(draw = {}) {
    const fecha = (draw.fecha || "").trim();
    const horario = PEGAS_TURNOS.includes(draw.horario) ? draw.horario : null;
    const pais = (draw.pais || "").trim().toUpperCase() || "HN";
    const paresRaw = Array.isArray(draw.pares) ? draw.pares : [];
    if (!fecha || !horario || !paresRaw.length) {
      throw new Error("savePega3Draw: datos incompletos");
    }
    const pares = paresRaw.map((value) => {
      const numero = typeof value === "number" ? value : parseInt(value, 10);
      if (!Number.isFinite(numero) || numero < 0 || numero > 99) {
        throw new Error("savePega3Draw: pares deben ser números 00-99");
      }
      return numero;
    });
    if (pares.length !== 3) {
      throw new Error("savePega3Draw: cada sorteo debe contener 3 pares");
    }
    const existing = await selectSingle(
      "pega3",
      [
        (q) => q.eq("fecha", fecha),
        (q) => q.eq("horario", horario),
        (q) => q.eq("pais", pais),
      ],
      "getPega3",
    );
    const payload = {
      fecha,
      horario,
      pais,
      pares,
      createdAt: Date.now(),
    };
    if (existing) {
      await updateByPrimary("pega3", existing.id, payload, "updatePega3");
      return existing.id;
    }
    const inserted = await insertRecord("pega3", payload, "insertPega3");
    return inserted?.id ?? null;
  },

  async listPega3Draws({ pais = null, turno = null } = {}) {
    const filters = [];
    if (pais) filters.push((q) => q.eq("pais", pais));
    if (turno) filters.push((q) => q.eq("horario", turno));
    return selectAll("pega3", {
      filters,
      order: [{ column: "fecha", ascending: true }],
    });
  },

  async deletePega3Draw(id) {
    if (!id && id !== 0) {
      throw new Error("deletePega3Draw: id requerido");
    }
    await deleteByPrimary("pega3", [id], "deletePega3Draw");
    return true;
  },
};
