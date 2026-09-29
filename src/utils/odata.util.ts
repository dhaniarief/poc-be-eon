export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
