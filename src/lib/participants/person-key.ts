export function normalizePersonKey(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("en").replace(/[^a-z0-9@.]+/g, "-").replace(/^-+|-+$/g, "");
}
export function splitDisplayName(displayName: string) {
  const parts = displayName.trim().split(/\s+/); const firstName = parts.shift() ?? ""; const lastName = parts.length > 0 ? parts.join(" ") : null;
  return { firstName, lastName };
}
