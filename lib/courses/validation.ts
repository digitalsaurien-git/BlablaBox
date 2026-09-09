export function readCourseText(value: FormDataEntryValue | null, fallback = "", maxLength = 180): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : "";
}

export function parseOptionalId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 100 ? normalized || null : null;
}

export function parseExpectedVersion(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed < 2147483647 ? parsed : null;
}

export function parseYear(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2200 ? parsed : null;
}
