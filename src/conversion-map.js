const RAW_MAP = {
  "0": "1",
  "1": "0",
  "2": "5",
  "5": "2",
  "3": "8",
  "8": "3",
  "4": "7",
  "7": "4",
  "6": "9",
  "9": "6",
};

export const CONVERSION_MAP = Object.freeze({ ...RAW_MAP });

const PAD = (value) => String(value).padStart(2, "0");
const mirrorValue = (value) => {
  const mirrored = PAD(value).split("").reverse().join("");
  const num = parseInt(mirrored, 10);
  return Number.isNaN(num) ? null : num;
};

export function convertDigit(digit) {
  const key = String(digit);
  return CONVERSION_MAP[key] ?? null;
}

export function convertBothDigits(numero) {
  const digits = PAD(numero).split("");
  const mapped = digits.map(convertDigit);
  if (mapped.some((value) => value === null)) return null;
  return parseInt(mapped.join(""), 10);
}

export function getSimpleConversions(numero) {
  const digits = PAD(numero).split("");
  const results = new Set();
  digits.forEach((digit, idx) => {
    const mapped = convertDigit(digit);
    if (!mapped || mapped === digit) return;
    const clone = [...digits];
    clone[idx] = mapped;
    results.add(parseInt(clone.join(""), 10));
  });
  return Array.from(results);
}

export function getCompositeConversions(numero, { includeMirror = true } = {}) {
  const digits = PAD(numero).split("");
  const mapped = digits.map(convertDigit);
  if (mapped.some((value) => value === null)) return [];
  const results = new Set();
  const addNumber = (value) => {
    const num = typeof value === "number" ? value : parseInt(value, 10);
    if (!Number.isNaN(num)) results.add(num);
  };
  const primary = parseInt(mapped.join(""), 10);
  if (!Number.isNaN(primary)) addNumber(primary);
  if (includeMirror) {
    const mirror = parseInt([...mapped].reverse().join(""), 10);
    if (!Number.isNaN(mirror)) addNumber(mirror);
    getSimpleConversions(numero).forEach((simpleValue) => {
      const mirroredSimple = mirrorValue(simpleValue);
      if (mirroredSimple !== null) addNumber(mirroredSimple);
    });
  }
  return Array.from(results);
}

export const CONVERSION_MAP_NOTE = "Mapa E: 0↔1, 2↔5, 3↔8, 4↔7, 6↔9";
