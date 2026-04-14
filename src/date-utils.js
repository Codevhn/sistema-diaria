export function parseDrawDate(fecha) {
  if (!fecha && fecha !== 0) return null;

  if (fecha instanceof Date) {
    return Number.isNaN(fecha.getTime())
      ? null
      : new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }

  if (typeof fecha === "number" && Number.isFinite(fecha)) {
    const base = new Date(fecha);
    return Number.isNaN(base.getTime())
      ? null
      : new Date(base.getFullYear(), base.getMonth(), base.getDate());
  }

  if (typeof fecha !== "string") return null;
  const trimmed = fecha.trim();
  if (!trimmed) return null;

  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, yStr, mStr, dStr] = ymdMatch;
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const day = parseInt(dStr, 10);
    const byParts = new Date(year, month, day);
    if (
      byParts.getFullYear() === year &&
      byParts.getMonth() === month &&
      byParts.getDate() === day
    ) {
      return byParts;
    }
    return null;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, dStr, mStr, yStr] = dmyMatch;
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10) - 1;
    const day = parseInt(dStr, 10);
    const byParts = new Date(year, month, day);
    if (
      byParts.getFullYear() === year &&
      byParts.getMonth() === month &&
      byParts.getDate() === day
    ) {
      return byParts;
    }
    return null;
  }

  const fallback = new Date(trimmed);
  if (Number.isNaN(fallback.getTime())) return null;
  return new Date(
    fallback.getFullYear(),
    fallback.getMonth(),
    fallback.getDate()
  );
}

function padTwo(n) {
  return String(n).padStart(2, "0");
}

export function formatDateISO(value) {
  const date = parseDrawDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = padTwo(date.getMonth() + 1);
  const day = padTwo(date.getDate());
  return `${year}-${month}-${day}`;
}

export function getTodayISODate() {
  return formatDateISO(new Date());
}
