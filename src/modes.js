import { DB } from "./storage.js";

export async function createMode(data) {
  if (!data?.nombre) throw new Error("Nombre requerido");
  const id = await DB.createGameMode({
    nombre: data.nombre.trim(),
    tipo: data.tipo || "manual",
    descripcion: data.descripcion || "",
    operacion: data.operacion || "",
    parametros: data.operacion ? data.parametros || {} : null,
    offset: Number.isFinite(data.offset) ? data.offset : null,
  });
  if (Array.isArray(data.ejemplos)) {
    for (const ex of data.ejemplos) {
      if (!ex?.original || !ex?.resultado) continue;
      await DB.addGameModeExample({
        modeId: id,
        original: ex.original,
        resultado: ex.resultado,
        nota: ex.nota,
      });
    }
  }
  return id;
}

export async function updateMode(id, data) {
  await DB.updateGameMode(id, {
    nombre: data.nombre,
    tipo: data.tipo,
    descripcion: data.descripcion,
    operacion: data.operacion || "",
    parametros: data.operacion ? data.parametros || {} : null,
    offset: Number.isFinite(data.offset) ? data.offset : null,
  });
  if (Array.isArray(data.ejemplos)) {
    const prev = await DB.listGameModeExamples(id);
    const keepIds = new Set();
    for (const ex of data.ejemplos) {
      if (ex.id) {
        keepIds.add(ex.id);
      } else if (ex.original && ex.resultado) {
        const newId = await DB.addGameModeExample({
          modeId: id,
          original: ex.original,
          resultado: ex.resultado,
          nota: ex.nota,
        });
        keepIds.add(newId);
      }
    }
    for (const ex of prev) {
      if (!keepIds.has(ex.id)) await DB.deleteGameModeExample(ex.id);
    }
  }
  return true;
}

export async function deleteMode(id) {
  return DB.deleteGameMode(id);
}

export async function deleteModeExample(id) {
  return DB.deleteGameModeExample(id);
}

export async function listModesWithExamples() {
  const modes = await DB.listGameModes();
  const result = [];
  for (const mode of modes) {
    const ejemplos = await DB.listGameModeExamples(mode.id);
    result.push({ ...mode, ejemplos });
  }
  return result;
}

export async function logModeUsage(log) {
  if (!log.modeId) throw new Error("modeId requerido");
  return DB.logGameModeUsage(log);
}

export async function listModeUsage(params) {
  return DB.listGameModeLogs(params);
}
