// Malaysia time helpers.
//
// Exam/assignment times are wall-clock Malaysia time. They must render the same
// whether code runs on the server (SSR, usually UTC) or in a browser set to any
// timezone — so all formatting is pinned to Asia/Kuala_Lumpur instead of relying
// on the runtime's local zone (the `"en-MY"` locale only controls formatting,
// NOT the timezone). Malaysia has no daylight saving (fixed UTC+8), so the
// offset is a constant +08:00.

export const MY_TZ = "Asia/Kuala_Lumpur";
const MY_OFFSET = "+08:00";

/** Format an instant (ISO string or Date) in Malaysia time. */
export function fmtMY(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-MY", { timeZone: MY_TZ, ...opts });
}

/**
 * Convert a `<input type="datetime-local">` value (which the user enters as
 * Malaysia wall-clock, e.g. "2026-05-30T14:00") into a UTC ISO string for
 * storage. Independent of the browser's own timezone.
 */
export function myLocalInputToISO(local: string): string {
  if (!local) return "";
  // Append seconds (if missing) and the fixed Malaysia offset, then normalise.
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSeconds}${MY_OFFSET}`).toISOString();
}

/**
 * Convert a stored UTC ISO string into a `datetime-local` value showing the
 * Malaysia wall-clock time ("yyyy-MM-ddThh:mm"), for pre-filling the edit form.
 */
export function isoToMyLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
