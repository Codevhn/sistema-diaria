// conversion-map.js — v5.0
// Shim de compatibilidad. La lógica viva en conversion-engine.js
// (generador dinámico con variantes encadenadas y pesos).
//
// Reglas oficiales:
//   CONVERSIÓN   : 0↔1  2↔5  3↔8  4↔7  6↔9
//   EQUIVALENCIA : 0↔5  1↔6  2↔7  3↔8  4↔9

export {
  CONVERSION_MAP,
  EQUIVALENCIAS_MAP,
  CONVERSION_MAP_NOTE,
  convertDigit,
  getMirror,
  getSimpleConversions,
  getCompositeConversions,
  convertBothDigits,
  getEquivalencias,
  getAllRelated,
  classifyRelation,
  // nuevos exports del engine
  generarVariantes,
  generarVariantesMulti,
  variantesSet,
} from "./conversion-engine.js";
