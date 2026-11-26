import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/supabaseClient.js", () => {
  const chainable = () => {
    const self = {
      select: vi.fn(() => self),
      insert: vi.fn(() => self),
      update: vi.fn(() => self),
      delete: vi.fn(() => self),
      eq: vi.fn(() => self),
      neq: vi.fn(() => self),
      is: vi.fn(() => self),
      in: vi.fn(() => self),
      order: vi.fn(() => self),
      range: vi.fn(() => self),
      single: vi.fn(() => self),
      maybeSingle: vi.fn(() => self),
      then: vi.fn((resolve) => resolve({ data: [], error: null, count: 0 })),
    };
    return self;
  };

  return {
    supabase: {
      from: vi.fn(() => chainable()),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      },
    },
  };
});

vi.mock("../src/triggers/triggerEngine.js", () => ({
  processNewDraw: vi.fn().mockResolvedValue(undefined),
}));

import { DB, db } from "../src/storage.js";
import { supabase } from "../src/supabaseClient.js";

describe("storage.js — helpers internos (a través de DB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DB.saveDraw", () => {
    it("lanza error si faltan campos requeridos", async () => {
      await expect(DB.saveDraw({})).rejects.toThrow("saveDraw: datos incompletos");
      await expect(DB.saveDraw({ numero: 5 })).rejects.toThrow("saveDraw: datos incompletos");
    });

    it("dryRun retorna { duplicate } sin insertar", async () => {
      const result = await DB.saveDraw(
        { fecha: "2025-07-20", pais: "HN", horario: "11AM", numero: 23 },
        { dryRun: true }
      );
      expect(result).toHaveProperty("duplicate");
    });
  });

  describe("DB.listDraws", () => {
    it("retorna array", async () => {
      const draws = await DB.listDraws();
      expect(Array.isArray(draws)).toBe(true);
    });
  });

  describe("DB.exportDraws", () => {
    const page = (data, error = null) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() => query),
        then: (resolve) => resolve({ data, error }),
      };
      return query;
    };

    it("lee todas las páginas y conserva los sorteos de prueba", async () => {
      const first = page(Array.from({ length: 500 }, (_, id) => ({ id, is_test: id === 0 })));
      const second = page([{ id: 500, is_test: false }]);
      supabase.from.mockReturnValueOnce(first).mockReturnValueOnce(second);

      const draws = await DB.exportDraws();

      expect(draws).toHaveLength(501);
      expect(draws[0]).toMatchObject({ id: 0, isTest: true });
      expect(draws[500].id).toBe(500);
      expect(first.range).toHaveBeenCalledWith(0, 499);
      expect(second.range).toHaveBeenCalledWith(500, 999);
    });

    it("rechaza un fallo de lectura en lugar de entregar un archivo parcial", async () => {
      supabase.from.mockReturnValueOnce(page(Array.from({ length: 500 }, (_, id) => ({ id }))));
      supabase.from.mockReturnValueOnce(page(null, new Error("Sin conexión")));

      await expect(DB.exportDraws()).rejects.toThrow("Sin conexión");
    });
  });

  describe("DB._add", () => {
    it("retorna id del registro insertado", async () => {
      const id = await DB._add("knowledge", { key: "test", value: "data" });
      expect(id).toBeDefined();
    });
  });

  describe("db export", () => {
    it("db es el cliente supabase", () => {
      expect(db).toBeDefined();
      expect(db.from).toBeTypeOf("function");
    });
  });
});

describe("storage.js — nuke", () => {
  it("nuke es una función", () => {
    expect(typeof DB.nuke).toBe("function");
  });
});

describe("storage.js — clearAllDraws", () => {
  it("clearAllDraws es una función", () => {
    expect(typeof DB.clearAllDraws).toBe("function");
  });
});
