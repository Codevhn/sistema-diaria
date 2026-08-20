import { describe, it, expect } from "vitest";
import {
  bayesRate,
  betaCredibleInterval,
  bootstrapRateCI,
} from "../src/stats-utils.js";

describe("bayesRate", () => {
  it("prior uniforme: 0 hits → tasa baja", () => {
    const rate = bayesRate(0, 10);
    expect(rate).toBeCloseTo(1 / 12, 2); // (0+1)/(10+1+1)
  });

  it("prior uniforme: 5 hits de 10 → suavizado", () => {
    const rate = bayesRate(5, 10);
    expect(rate).toBeCloseTo(6 / 12, 2); // (5+1)/(10+2)
  });

  it("muestra grande: se acerca a la tasa cruda", () => {
    const rate = bayesRate(50, 100);
    expect(rate).toBeCloseTo(51 / 102, 3);
  });

  it("maneja inputs negativos y cero", () => {
    expect(bayesRate(-5, -10)).toBeGreaterThanOrEqual(0);
    expect(bayesRate(0, 0)).toBeCloseTo(0.5, 1);
  });
});

describe("betaCredibleInterval", () => {
  it("retorna objeto con mean, low, high, level", () => {
    const ci = betaCredibleInterval(5, 10);
    expect(ci).toHaveProperty("mean");
    expect(ci).toHaveProperty("low");
    expect(ci).toHaveProperty("high");
    expect(ci).toHaveProperty("level", 0.95);
    expect(ci.low).toBeLessThan(ci.mean);
    expect(ci.high).toBeGreaterThan(ci.mean);
  });

  it("intervalo se ensancha con poca muestra", () => {
    const ci3 = betaCredibleInterval(1, 3);
    const ci30 = betaCredibleInterval(10, 30);
    expect(ci3.high - ci3.low).toBeGreaterThan(ci30.high - ci30.low);
  });

  it("limites entre 0 y 1", () => {
    const ci = betaCredibleInterval(0, 5);
    expect(ci.low).toBeGreaterThanOrEqual(0);
    expect(ci.high).toBeLessThanOrEqual(1);
  });
});

describe("bootstrapRateCI", () => {
  it("retorna { low, high, level, n }", () => {
    const ci = bootstrapRateCI(5, 10, { iterations: 500 });
    expect(ci).toHaveProperty("low");
    expect(ci).toHaveProperty("high");
    expect(ci).toHaveProperty("level", 0.95);
    expect(ci).toHaveProperty("n", 10);
    expect(ci.low).toBeLessThanOrEqual(ci.high);
  });

  it("n=0 retorna 0", () => {
    const ci = bootstrapRateCI(0, 0);
    expect(ci.low).toBe(0);
    expect(ci.high).toBe(0);
  });

  it("p=0 → low y high cercanos a 0", () => {
    const ci = bootstrapRateCI(0, 50, { iterations: 500 });
    expect(ci.high).toBeLessThan(0.15);
  });

  it("p=1 → low y high cercanos a 1", () => {
    const ci = bootstrapRateCI(50, 50, { iterations: 500 });
    expect(ci.low).toBeGreaterThan(0.85);
  });
});
