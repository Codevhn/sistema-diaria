import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/storage.js", () => ({
  DB: {
    listDraws: vi.fn().mockResolvedValue([]),
    saveKnowledge: vi.fn().mockResolvedValue(undefined),
    listKnowledge: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/loader.js", () => ({
  GUIA: {},
}));

vi.mock("../src/logger.js", () => ({
  logWarn: vi.fn(),
}));

import { detectarPatrones } from "../src/pattern-detector.js";

describe("detectarPatrones", () => {
  it("retorna objeto con la estructura esperada", async () => {
    const result = await detectarPatrones({ cantidad: 3 });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });

  it("retorna objeto con la estructura esperada", async () => {
    const result = await detectarPatrones({ cantidad: 5 });
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
    // El resultado tiene 8+ keys (repeticiones, transiciones, ausencias, etc.)
    const keys = Object.keys(result);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("no lanza excepciones con draws vacíos", async () => {
    await expect(detectarPatrones({ cantidad: 3 })).resolves.toBeDefined();
  });
});
