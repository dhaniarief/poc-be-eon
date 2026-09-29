export function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

export function uniqueParts(values: Array<unknown>): string[] {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}
