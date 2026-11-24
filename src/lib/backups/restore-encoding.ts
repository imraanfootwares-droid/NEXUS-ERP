/** Converts a value from a JSON backup into what Postgres expects for that column type. */
export function encodeRestoreValue(value: unknown, dataType: string | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (dataType === "json" || dataType === "jsonb") return JSON.stringify(value);
  return value;
}
