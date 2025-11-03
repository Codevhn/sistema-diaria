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
};

