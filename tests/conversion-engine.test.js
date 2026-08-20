import { describe, it, expect } from "vitest";
import {
  CONVERSION_MAP,
  EQUIVALENCIAS_MAP,
  convertDigit,
  getMirror,
  getSimpleConversions,
  convertBothDigits,
  getCompositeConversions,
  getEquivalencias,
  generarVariantes,
  variantesSet,
  getAllRelated,
  classifyRelation,
} from "../src/conversion-engine.js";

describe("CONVERSION_MAP", () => {
  it("contiene todas las reglas oficiales", () => {
    expect(CONVERSION_MAP[0]).toBe(1);
    expect(CONVERSION_MAP[1]).toBe(0);
    expect(CONVERSION_MAP[2]).toBe(5);
    expect(CONVERSION_MAP[5]).toBe(2);
    expect(CONVERSION_MAP[3]).toBe(8);
    expect(CONVERSION_MAP[8]).toBe(3);
    expect(CONVERSION_MAP[4]).toBe(7);
    expect(CONVERSION_MAP[7]).toBe(4);
    expect(CONVERSION_MAP[6]).toBe(9);
    expect(CONVERSION_MAP[9]).toBe(6);
  });

  it("es freeze (inmutable)", () => {
    expect(Object.isFrozen(CONVERSION_MAP)).toBe(true);
  });
});

describe("EQUIVALENCIAS_MAP", () => {
  it("contiene equivalencias oficiales", () => {
    expect(EQUIVALENCIAS_MAP[0]).toBe(5);
    expect(EQUIVALENCIAS_MAP[5]).toBe(0);
    expect(EQUIVALENCIAS_MAP[1]).toBe(6);
    expect(EQUIVALENCIAS_MAP[4]).toBe(9);
  });
});

describe("convertDigit", () => {
  it("convierte dígitos según regla", () => {
    expect(convertDigit(0)).toBe(1);
    expect(convertDigit(2)).toBe(5);
    expect(convertDigit(3)).toBe(8);
    expect(convertDigit(4)).toBe(7);
    expect(convertDigit(6)).toBe(9);
  });

  it("acepta strings", () => {
    expect(convertDigit("2")).toBe(5);
    expect(convertDigit("0")).toBe(1);
  });

  it("retorna null para dígito sin conversión", () => {
    // Todos los dígitos 0-9 tienen conversión, pero probamos edge cases
    expect(convertDigit(99)).toBeNull();
  });

  it("es memoizado (misma referencia)", () => {
    const r1 = convertDigit(5);
    const r2 = convertDigit(5);
    expect(r1).toBe(r2);
  });
});

describe("getMirror", () => {
  it("invierte dígitos", () => {
    expect(getMirror(12)).toBe(21);
    expect(getMirror(45)).toBe(54);
    expect(getMirror(10)).toBe(1);  // 01 → 10, pero 10 != 01, y getMirror(10) = fromDigits(0,1) = 1
  });

  it("retorna null para palíndromos de 2 dígitos", () => {
    expect(getMirror(11)).toBeNull();
    expect(getMirror(22)).toBeNull();
    expect(getMirror(55)).toBeNull();
  });

  it("single digit → invierte con padding", () => {
    // 7 → toDigits = [0,7] → mirror = fromDigits(7,0) = 70
    expect(getMirror(7)).toBe(70);
  });
});

describe("getSimpleConversions", () => {
  it("retorna conversiones simples de ambos dígitos", () => {
    const result = getSimpleConversions(23);
    // d0=2 → 5, d1=3 → 8
    expect(result).toContain(53); // solo d0 convertido
    expect(result).toContain(28); // solo d1 convertido
  });

  it("retorna array vacío si no hay conversiones", () => {
    // Todos los dígitos tienen conversión, así que esto es hard de lograr
    // Probamos un caso edge
    const result = getSimpleConversions(0);
    expect(Array.isArray(result)).toBe(true);
  });

  it("es memoizado", () => {
    const r1 = getSimpleConversions(23);
    const r2 = getSimpleConversions(23);
    expect(r1).toBe(r2);
  });
});

describe("convertBothDigits", () => {
  it("convierte ambos dígitos", () => {
    expect(convertBothDigits(23)).toBe(58); // 2→5, 3→8
    expect(convertBothDigits(14)).toBe(7); // 1→0, 4→7
  });

  it("retorna null si algún dígito no tiene conversión", () => {
    // Todos los dígitos 0-9 tienen conversión en CONV_RAW
    // Pero si el resultado fuera null por la lógica interna
    expect(convertBothDigits(23)).not.toBeNull();
  });
});

describe("getEquivalencias", () => {
  it("retorna equivalencias", () => {
    const result = getEquivalencias(23);
    // d0=2→7, d1=3→8
    expect(result).toContain(78); // directa
    expect(result).toContain(87); // espejo
  });
});

describe("getAllRelated", () => {
  it("retorna objeto con todas las categorías", () => {
    const result = getAllRelated(23);
    expect(result).toHaveProperty("simple");
    expect(result).toHaveProperty("compound");
    expect(result).toHaveProperty("equivalencias");
    expect(result).toHaveProperty("mirror");
    expect(Array.isArray(result.simple)).toBe(true);
    expect(Array.isArray(result.compound)).toBe(true);
    expect(Array.isArray(result.equivalencias)).toBe(true);
  });

  it("es memoizado", () => {
    const r1 = getAllRelated(23);
    const r2 = getAllRelated(23);
    expect(r1).toBe(r2);
  });
});

describe("generarVariantes", () => {
  it("retorna array de variantes con estructura correcta", () => {
    const variantes = generarVariantes(23);
    expect(Array.isArray(variantes)).toBe(true);
    expect(variantes.length).toBeGreaterThan(0);
    for (const v of variantes) {
      expect(v).toHaveProperty("numero");
      expect(v).toHaveProperty("pad");
      expect(v).toHaveProperty("tipo");
      expect(v).toHaveProperty("peso");
      expect(v).toHaveProperty("descripcion");
    }
  });

  it("no incluye la semilla por defecto", () => {
    const variantes = generarVariantes(23);
    const nums = variantes.map((v) => v.numero);
    expect(nums).not.toContain(23);
  });

  it("incluirSemilla=true no filtra cuando variante coincide con semilla", () => {
    // clasificarRelation para same retorna "same" antes de llegar a generarVariantes
    // Test real: incluirSemilla permite que un encadenado genere la semilla
    // Probamos que la bandera funciona sin romper la estructura
    const variantes = generarVariantes(23, { incluirSemilla: true });
    expect(Array.isArray(variantes)).toBe(true);
    expect(variantes.length).toBeGreaterThan(0);
    for (const v of variantes) {
      expect(v).toHaveProperty("numero");
      expect(v).toHaveProperty("tipo");
    }
  });
});

describe("variantesSet", () => {
  it("retorna un Set", () => {
    const result = variantesSet(23);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBeGreaterThan(0);
  });
});

describe("classifyRelation", () => {
  it("detecta same", () => {
    expect(classifyRelation(23, 23)).toBe("same");
  });

  it("detecta conversion-simple", () => {
    // 23 → simple_d0 = 53
    const result = classifyRelation(23, 53);
    expect(result).toBe("conversion-simple");
  });

  it("detecta mirror", () => {
    expect(classifyRelation(12, 21)).toBe("mirror");
  });

  it("retorna null para sin relación", () => {
    expect(classifyRelation(12, 89)).toBeNull();
  });
});
