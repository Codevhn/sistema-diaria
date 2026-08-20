import { describe, it, expect } from "vitest";
import { parseDrawDate, formatDateISO, getTodayISODate } from "../src/date-utils.js";

describe("parseDrawDate", () => {
  it("retorna null para inputs inválidos", () => {
    expect(parseDrawDate(null)).toBeNull();
    expect(parseDrawDate(undefined)).toBeNull();
    expect(parseDrawDate("")).toBeNull();
    expect(parseDrawDate("  ")).toBeNull();
    expect(parseDrawDate("abc")).toBeNull();
    expect(parseDrawDate(NaN)).toBeNull();
  });

  it("parshea YYYY-MM-DD", () => {
    const d = parseDrawDate("2025-03-15");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it("parshea DD/MM/YYYY", () => {
    const d = parseDrawDate("15/03/2025");
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it("parshea fechas con / en vez de -", () => {
    const d = parseDrawDate("2025/06/01");
    expect(d).toBeInstanceOf(Date);
    expect(d.getMonth()).toBe(5);
  });

  it("acepta Date objects", () => {
    const input = new Date(2025, 0, 5);
    const d = parseDrawDate(input);
    expect(d).toBeInstanceOf(Date);
    expect(d.getDate()).toBe(5);
  });

  it("acepta timestamps numéricos", () => {
    const d = parseDrawDate(1700000000000);
    expect(d).toBeInstanceOf(Date);
  });

  it("retorna null para Date inválido", () => {
    expect(parseDrawDate(new Date("invalid"))).toBeNull();
  });

  it("retorna null para fechas inexistentes (31 feb)", () => {
    expect(parseDrawDate("2025-02-31")).toBeNull();
    expect(parseDrawDate("2025-04-31")).toBeNull();
  });

  it("normaliza a medianoche (sin hora)", () => {
    const d = parseDrawDate("2025-07-20T14:30:00");
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("formatDateISO", () => {
  it("formatea Date a YYYY-MM-DD", () => {
    const d = new Date(2025, 2, 15);
    expect(formatDateISO(d)).toBe("2025-03-15");
  });

  it("formatea string YYYY-MM-DD", () => {
    expect(formatDateISO("2025-12-01")).toBe("2025-12-01");
  });

  it("retorna string vacío para input inválido", () => {
    expect(formatDateISO(null)).toBe("");
    expect(formatDateISO("invalid")).toBe("");
  });

  it("padea meses y días de un dígito", () => {
    const d = new Date(2025, 0, 5);
    expect(formatDateISO(d)).toBe("2025-01-05");
  });
});

describe("getTodayISODate", () => {
  it("retorna string en formato YYYY-MM-DD", () => {
    const result = getTodayISODate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("retorna la fecha de hoy", () => {
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(getTodayISODate()).toBe(expected);
  });
});
