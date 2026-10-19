/** Every hour in a week; the API rejects more (see maxWeeklyHours in the Go API). */
export const MAX_WEEKLY_HOURS = 168

const hoursFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export function formatHours(value: number): string {
  return hoursFormat.format(value)
}

export type ParsedHours = { ok: true; hours: number } | { ok: false; error: string }

/** Checks typed weekly hours with the same rules the API applies. */
export function parseWeeklyHours(input: string): ParsedHours {
  const text = input.trim()
  if (text === '') return { ok: false, error: 'Enter the weekly hours.' }
  const hours = Number(text)
  if (!Number.isFinite(hours)) return { ok: false, error: 'Enter a number.' }
  if (hours < 0 || hours > MAX_WEEKLY_HOURS) return { ok: false, error: `Use 0 to ${MAX_WEEKLY_HOURS} hours.` }
  return { ok: true, hours }
}
