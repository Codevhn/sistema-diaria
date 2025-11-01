// storage.js — v3.3.1
import Dexie from "https://unpkg.com/dexie@3.2.7/dist/dexie.mjs";

export const db = new Dexie("la_diaria_v3");
db.version(1).stores({
  draws:
    "++id, fecha, pais, horario, numero, isTest, createdAt, [fecha+pais+horario+numero]",
});

export const DB = {
  async saveDraw(draw, opts = {}) {
    const rec = {
      ...draw,
      isTest: opts.source === "test",
      createdAt: Date.now(),
    };
    if (!rec.fecha || !rec.pais || !rec.horario || isNaN(rec.numero)) {
      throw new Error("saveDraw: datos incompletos");
    }
    if (opts.dryRun) {
      const dup = await db.draws
        .where("[fecha+pais+horario+numero]")
        .equals([rec.fecha, rec.pais, rec.horario, rec.numero])
        .first();
      return { duplicate: !!dup };
    }
    if (opts.force) return db.draws.add(rec);

    const dup = await db.draws
      .where("[fecha+pais+horario+numero]")
      .equals([rec.fecha, rec.pais, rec.horario, rec.numero])
      .first();
    if (dup) return dup.id;
    return db.draws.add(rec);
  },

  async listDraws({ excludeTest = true } = {}) {
    const all = await db.draws.orderBy("createdAt").toArray();
    return excludeTest ? all.filter((x) => !x.isTest) : all;
  },

  async deleteDrawById(id) {
    await db.draws.delete(id);
    return true;
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
};
