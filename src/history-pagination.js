// Pages stay within the filtered result set, including when a filter removes the current page.
export function paginateHistory(rows, page = 0, pageSize = 15) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 15;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const index = Math.min(pages - 1, Math.max(0, Number.isInteger(page) ? page : 0));
  const start = index * size;
  return { rows: rows.slice(start, start + size), page: index, pages, total: rows.length, start: rows.length ? start + 1 : 0, end: Math.min(rows.length, start + size) };
}
