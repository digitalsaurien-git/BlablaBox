/**
 * Shared helpers for reading and validating form data in server actions.
 */

/** Extract a trimmed string value from FormData, returning "" if missing or non-string. */
export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Return `value` if it is in the `allowed` list, otherwise return `fallback`. */
export function readAllowed<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
