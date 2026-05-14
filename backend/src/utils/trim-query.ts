export function truncateQuery(query: string, max = 400): string {
  if (query.length <= max) return query;
  return query.slice(0, max).replace(/\s+\S*$/, "").trim();
}