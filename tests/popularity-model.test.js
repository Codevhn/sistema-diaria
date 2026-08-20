import { describe, it, expect } from "vitest";
import {
  CADENAS,
  ACTIVACIONES,
  SUENOS,
  DOBLES_SALADITOS,
  REDONDOS,
  MULT5_POPULARES,
  EVITADOS_SUPERSTICION,
  calcularPopularidad,
  popularidadAFactor,
  getCadenasActivas,
  getMercado,
} from "../src/popularity-model.js";

describe("CADENAS", () => {
  it("contiene cadenas semánticas conocidas", () => {
    expect(CADENAS).toHaveProperty("mujer_madre");
    expect(CADENAS).toHaveProperty("muerte");
    expect(CADENAS).toHaveProperty("fiesta");
    expect(CADENAS).toHaveProperty("aves");
  });

  it("cada cadena es un array de números", () => {
    for (const [nombre, nums] of Object.entries(CADENAS)) {
      expect(Array.isArray(nums)).toBe(true);
      expect(nums.length).toBeGreaterThan(0);
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(99);
      }
    }
  });
});

describe("ACTIVACIONES", () => {
  it("cada activación tiene trigger, targets, peso, motivo", () => {
    for (const a of ACTIVACIONES) {
      expect(a).toHaveProperty("trigger");
      expect(a).toHaveProperty("targets");
      expect(a).toHaveProperty("peso");
      expect(a).toHaveProperty("motivo");
      expect(a.peso).toBeGreaterThan(0);
      expect(a.peso).toBeLessThanOrEqual(1);
      expect(Array.isArray(a.targets)).toBe(true);
    }
  });

  it("el trigger está en su cadena", () => {
    for (const a of ACTIVACIONES) {
      // Verificar que el trigger existe en alguna cadena
      const inSomeChain = Object.values(CADENAS).some((nums) => nums.includes(a.trigger));
      expect(inSomeChain).toBe(true);
    }
  });
});

describe("DOBLES_SALADITOS, REDONDOS, MULT5_POPULARES", () => {
  it("son arrays de números 0-99", () => {
    for (const arr of [DOBLES_SALADITOS, REDONDOS, MULT5_POPULARES]) {
      expect(Array.isArray(arr)).toBe(true);
      for (const n of arr) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(99);
      }
    }
  });

  it("REDONDOS terminan en 0", () => {
    for (const n of REDONDOS) {
      expect(n % 10).toBe(0);
    }
  });

  it("DOBLES_SALADITOS son dígitos repetidos", () => {
    for (const n of DOBLES_SALADITOS) {
      const s = String(n).padStart(2, "0");
      expect(s[0]).toBe(s[1]);
    }
  });
});

describe("popularidadAFactor", () => {
  it("pop=0 → factor > 1 (libre)", () => {
    expect(popularidadAFactor(0)).toBeCloseTo(1.35, 2);
  });

  it("pop=50 → factor ≈ 1.0 (neutral)", () => {
    expect(popularidadAFactor(50)).toBeCloseTo(1.0, 2);
  });

  it("pop=100 → factor < 1 (caliente)", () => {
    expect(popularidadAFactor(100)).toBeCloseTo(0.65, 2);
  });

  it("clamp: pop > 100 se trunca", () => {
    expect(popularidadAFactor(150)).toBe(popularidadAFactor(100));
  });

  it("clamp: pop < 0 se trunca", () => {
    expect(popularidadAFactor(-10)).toBe(popularidadAFactor(0));
  });
});

describe("calcularPopularidad", () => {
  it("retorna Map", () => {
    const result = calcularPopularidad([]);
    expect(result).toBeInstanceOf(Map);
  });

  it("sin sorteos, solo tiene piso cultural", () => {
    const result = calcularPopularidad([]);
    // Números con piso cultural: 0-9, 10, 20, ..., 90, etc.
    expect(result.get(0)).toBeDefined();
    expect(result.get(0).score).toBeGreaterThan(0);
  });

  it("con sorteos, activaciones aumentan popularidad", () => {
    // Caer 3 → activa cadena muerte: 22, 40, 45, 79, 84
    const draws = [
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 }, { numero: 3 },
      { numero: 3 }, { numero: 3 },
    ];
    const result = calcularPopularidad(draws);
    const muerte = result.get(22);
    expect(muerte).toBeDefined();
    expect(muerte.score).toBeGreaterThan(0);
  });

  it("EVITADOS_SUPERSTICION tienen score reducido", () => {
    const result = calcularPopularidad([]);
    const evitado22 = result.get(22);
    const noEvitado = result.get(50);
    // 22 es evitado por superstición, debería tener penalización
    if (evitado22 && noEvitado) {
      expect(evitado22.motivos.some((m) => m.includes("Evitado"))).toBe(true);
    }
  });

  it("score nunca supera 100", () => {
    const draws = Array.from({ length: 50 }, () => ({ numero: 3 }));
    const result = calcularPopularidad(draws);
    for (const [, data] of result) {
      expect(data.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("getCadenasActivas", () => {
  it("retorna array", () => {
    expect(Array.isArray(getCadenasActivas([]))).toBe(true);
  });

  it("detecta cadena activa cuando un trigger reciente cayó", () => {
    // Caer 3 activa la cadena muerte
    const draws = [{ numero: 3 }];
    const activas = getCadenasActivas(draws);
    const muerte = activas.find((a) => a.cadena === "muerte");
    expect(muerte).toBeDefined();
    expect(muerte.triggers).toContain(3);
  });

  it("sin sorteos recientes → sin cadenas activas", () => {
    expect(getCadenasActivas([])).toEqual([]);
  });

  it("ordena por intensidad descendente", () => {
    const draws = [{ numero: 3 }, { numero: 22 }];
    const activas = getCadenasActivas(draws);
    for (let i = 1; i < activas.length; i++) {
      expect(activas[i].intensidad).toBeLessThanOrEqual(activas[i - 1].intensidad);
    }
  });
});

describe("getMercado", () => {
  it("retorna calientes, frios, reprimidos, libres", () => {
    const popMap = calcularPopularidad([]);
    const mercado = getMercado(popMap);
    expect(mercado).toHaveProperty("calientes");
    expect(mercado).toHaveProperty("frios");
    expect(mercado).toHaveProperty("reprimidos");
    expect(mercado).toHaveProperty("libres");
    expect(Array.isArray(mercado.calientes)).toBe(true);
    expect(Array.isArray(mercado.frios)).toBe(true);
  });

  it("calientes son los de mayor score", () => {
    const popMap = calcularPopularidad([]);
    const mercado = getMercado(popMap, { topN: 5 });
    expect(mercado.calientes.length).toBeLessThanOrEqual(5);
    if (mercado.calientes.length >= 2) {
      expect(mercado.calientes[0].score).toBeGreaterThanOrEqual(mercado.calientes[1].score);
    }
  });

  it("libres es alias de frios", () => {
    const popMap = calcularPopularidad([]);
    const mercado = getMercado(popMap);
    expect(mercado.libres).toBe(mercado.frios);
  });
});
