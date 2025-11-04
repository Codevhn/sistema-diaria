// storage.js — v3.3.1
import Dexie from "https://unpkg.com/dexie@3.2.7/dist/dexie.mjs";

export const db = new Dexie("la_diaria_v3");

db.version(1).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
});

db.version(2).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
  hypotheses: "++id, numero, simbolo, estado, fecha, turno, createdAt",
  reasons: "++id, ownerType, ownerId, texto, tags, createdAt",
  rules: "++id, tipo, descripcion, createdAt",
  edges: "++id, fromFactId, toId, ruleId, weight, createdAt",
});

db.version(3).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
  hypotheses: "++id, numero, simbolo, estado, fecha, turno, createdAt",
  reasons: "++id, ownerType, ownerId, texto, tags, createdAt",
  rules: "++id, tipo, descripcion, createdAt",
  edges: "++id, fromFactId, toId, ruleId, weight, createdAt",
  knowledge: "&key, scope, updatedAt",
});

db.version(4).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
  hypotheses: "++id, numero, simbolo, estado, fecha, turno, createdAt",
  reasons: "++id, ownerType, ownerId, texto, tags, createdAt",
  rules: "++id, tipo, descripcion, createdAt",
  edges: "++id, fromFactId, toId, ruleId, weight, createdAt",
  knowledge: "&key, scope, updatedAt",
  hypothesis_logs:
    "++id, hypothesisId, numero, estado, fechaResultado, paisResultado, horarioResultado, createdAt, [numero+estado]",
});

db.version(5).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
  hypotheses: "++id, numero, simbolo, estado, fecha, turno, createdAt",
  reasons: "++id, ownerType, ownerId, texto, tags, createdAt",
  rules: "++id, tipo, descripcion, createdAt",
  edges: "++id, fromFactId, toId, ruleId, weight, createdAt",
  knowledge: "&key, scope, updatedAt",
  hypothesis_logs:
    "++id, hypothesisId, numero, estado, fechaResultado, paisResultado, horarioResultado, createdAt, [numero+estado]",
  prediction_logs:
    "++id, targetFecha, targetPais, turno, numero, estado, createdAt, [targetFecha+targetPais]",
});

db.version(6).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
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
});

db.version(7).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
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
});

const withTimestamp = (data = {}) => ({
  ...data,
  createdAt: data.createdAt ?? Date.now(),
});

function getTable(table) {
  if (!db[table]) throw new Error(`Tabla Dexie no encontrada: ${table}`);
  return db[table];
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
      let dupDry = await db.draws
        .where("[fecha+pais+horario+numero]")
        .equals([rec.fecha, rec.pais, rec.horario, rec.numero])
        .first();
      if (!dupDry) {
        dupDry = await db.draws
          .filter(
            (d) =>
              d.fecha === rec.fecha &&
              d.pais === rec.pais &&
              d.horario === rec.horario &&
              Number(d.numero) === rec.numero
          )
          .first();
      }
      return { duplicate: !!dupDry };
    }
    if (opts.force) return db.draws.add(rec);

    let dup = await db.draws
      .where("[fecha+pais+horario+numero]")
      .equals([rec.fecha, rec.pais, rec.horario, rec.numero])
      .first();

    if (!dup) {
      dup = await db.draws
        .filter(
          (d) =>
            d.fecha === rec.fecha &&
            d.pais === rec.pais &&
            d.horario === rec.horario &&
            Number(d.numero) === rec.numero
        )
        .first();
    }

    if (dup) {
      const changes = {};
      if (typeof dup.numero !== "number") changes.numero = rec.numero;
      if (dup.isTest !== rec.isTest) changes.isTest = rec.isTest;
      if (Object.keys(changes).length) await db.draws.update(dup.id, changes);
      return dup.id;
    }
    return db.draws.add(rec);
  },

  async listDraws({ excludeTest = true } = {}) {
    const all = await db.draws.orderBy("createdAt").toArray();
    return excludeTest ? all.filter((x) => !x.isTest) : all;
  },

  async deleteDraw(id) {
    await db.draws.delete(id);
    return true;
  },

  async deleteDrawById(id) {
    return this.deleteDraw(id);
  },

  async clearAllDraws() {
    await db.draws.clear();
    return true;
  },

  async nuke() {
    await db.delete();
    await db.open();
    return true;
  },

  async _add(table, data) {
    const tbl = getTable(table);
    return tbl.add(withTimestamp(data));
  },

  async _getAll(table) {
    const tbl = getTable(table);
    return tbl.toArray();
  },

  async _update(table, id, changes) {
    const tbl = getTable(table);
    return tbl.update(id, changes);
  },

  async findDuplicates() {
    const all = await db.draws
      .orderBy("[fecha+pais+horario+numero]")
      .toArray();
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
    await db.draws.where("id").anyOf(ids).modify((d) => {
      d.isTest = flag;
    });
    return true;
  },

  async saveKnowledge(entries = []) {
    if (!entries.length) return false;
    const normalized = entries.map((entry) => ({
      key: entry.key,
      scope: entry.scope || "general",
      data: entry.data ?? null,
      updatedAt: entry.updatedAt ?? Date.now(),
    }));
    await db.knowledge.bulkPut(normalized);
    return true;
  },

  async getKnowledgeByScope(scope) {
    if (!scope) return db.knowledge.toArray();
    return db.knowledge.where({ scope }).toArray();
  },

  async getKnowledge(key) {
    if (!key) return null;
    return db.knowledge.get(key);
  },

  async clearKnowledge(scope) {
    if (!scope) return db.knowledge.clear();
    const rows = await db.knowledge.where({ scope }).primaryKeys();
    if (!rows.length) return false;
    await db.knowledge.bulkDelete(rows);
    return true;
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
    return db.hypothesis_logs.add(entry);
  },

  async getHypothesisLogs() {
    return db.hypothesis_logs.toArray();
  },

  async getHypothesisLogsByNumber(numero) {
    return db.hypothesis_logs.where({ numero }).toArray();
  },

  async logPredictions(predictions = [], context = {}) {
    if (!predictions.length) return false;
    const targetFecha = context.fecha ?? null;
    const targetPais = context.pais ?? null;
    const turno = context.turno ?? null;

    if (targetFecha !== null || targetPais !== null) {
      await db.prediction_logs
        .where("[targetFecha+targetPais]")
        .equals([targetFecha, targetPais])
        .filter((row) => row.estado === "pendiente")
        .modify((row) => {
          row.estado = "descartado";
          row.closedAt = Date.now();
        });
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
    await db.prediction_logs.bulkAdd(entries);
    return true;
  },

  async markPredictionResult({ fecha, pais, numero, horario }) {
    const targetFecha = fecha ?? null;
    const targetPais = pais ?? null;
    const match = await db.prediction_logs
      .where("[targetFecha+targetPais]")
      .equals([targetFecha, targetPais])
      .and((row) => row.estado === "pendiente" && row.numero === numero)
      .first();
    if (!match) return false;
    await db.prediction_logs.update(match.id, {
      estado: "acierto",
      resultadoHorario: horario ?? match.turno ?? null,
      resolvedAt: Date.now(),
    });
    return true;
  },

  async closePredictionBatch({ fecha, pais }) {
    const targetFecha = fecha ?? null;
    const targetPais = pais ?? null;
    await db.prediction_logs
      .where("[targetFecha+targetPais]")
      .equals([targetFecha, targetPais])
      .filter((row) => row.estado === "pendiente")
      .modify((row) => {
        row.estado = "fallo";
        row.resolvedAt = Date.now();
      });
    return true;
  },

  async getPredictionLogs() {
    return db.prediction_logs.toArray();
  },

  async listHypothesisReminders() {
    if (!db.hypothesis_reminders) return [];
    return db.hypothesis_reminders.orderBy("createdAt").reverse().toArray();
  },

  async addHypothesisReminder({ numero, nota = "", simbolo = "" } = {}) {
    if (!db.hypothesis_reminders) return null;
    const n = parseInt(numero, 10);
    if (!Number.isFinite(n) || n < 0 || n > 99) {
      throw new Error("Número inválido para recordatorio");
    }
    const normalizedNote = typeof nota === "string" ? nota.trim() : "";
    const normalizedSymbol = typeof simbolo === "string" ? simbolo.trim() : "";
    const existing = await db.hypothesis_reminders.where("numero").equals(n).first();
    if (existing) {
      await db.hypothesis_reminders.update(existing.id, {
        nota: normalizedNote || existing.nota || "",
        simbolo: normalizedSymbol || existing.simbolo || "",
        updatedAt: Date.now(),
      });
      return existing.id;
    }
    return db.hypothesis_reminders.add({
      numero: n,
      nota: normalizedNote,
      simbolo: normalizedSymbol,
      createdAt: Date.now(),
    });
  },

  async removeHypothesisReminder(id) {
    if (!db.hypothesis_reminders) return false;
    if (id === null || id === undefined) return false;
    await db.hypothesis_reminders.delete(id);
    return true;
  },

  async createGameMode({ nombre, tipo, descripcion, operacion = "", parametros = null, offset = null }) {
    return db.game_modes.add({
      nombre,
      tipo,
      descripcion,
      operacion,
      parametros,
      offset,
      createdAt: Date.now(),
    });
  },

  async updateGameMode(id, changes) {
    return db.game_modes.update(id, changes);
  },

  async listGameModes() {
    return db.game_modes.orderBy("createdAt").toArray();
  },

  async deleteGameMode(id) {
    await db.game_modes.delete(id);
    const examples = await db.game_mode_examples.where({ modeId: id }).primaryKeys();
    if (examples.length) await db.game_mode_examples.bulkDelete(examples);
    const logs = await db.game_mode_logs.where({ modeId: id }).primaryKeys();
    if (logs.length) await db.game_mode_logs.bulkDelete(logs);
    return true;
  },

  async addGameModeExample({ modeId, original, resultado, nota }) {
    return db.game_mode_examples.add({
      modeId,
      original,
      resultado,
      nota,
      createdAt: Date.now(),
    });
  },

  async listGameModeExamples(modeId) {
    if (!modeId) return [];
    return db.game_mode_examples.where({ modeId }).toArray();
  },

  async deleteGameModeExample(id) {
    return db.game_mode_examples.delete(id);
  },

  async logGameModeUsage({ modeId, fecha, pais, turno, notas }) {
    if (!modeId) throw new Error("logGameModeUsage: modeId requerido");
    return db.game_mode_logs.add({
      modeId,
      fecha,
      pais,
      turno,
      notas,
      createdAt: Date.now(),
    });
  },

  async listGameModeLogs({ modeId, fecha } = {}) {
    let collection = db.game_mode_logs;
    if (modeId) collection = collection.where({ modeId });
    const rows = await collection.toArray();
    return fecha ? rows.filter((row) => row.fecha === fecha) : rows;
  },
};
