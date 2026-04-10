export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = atob(padded);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function displayValue(value?: string | null, fallback = "Unspecified") {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function objectToCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(String(row[header] ?? ""))).join(",")),
  ].join("\n");
}
