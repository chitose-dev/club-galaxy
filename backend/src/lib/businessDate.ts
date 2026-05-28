export const BUSINESS_DAY_CUTOFF_HOUR_DEFAULT = 5

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

function toJstParts(d: Date): { y: number; m: number; day: number; h: number; min: number; s: number; ms: number } {
  const jst = new Date(d.getTime() + JST_OFFSET_MS)
  return {
    y: jst.getUTCFullYear(),
    m: jst.getUTCMonth() + 1,
    day: jst.getUTCDate(),
    h: jst.getUTCHours(),
    min: jst.getUTCMinutes(),
    s: jst.getUTCSeconds(),
    ms: jst.getUTCMilliseconds(),
  }
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0')
}

export function getBusinessDate(
  timestamp: string | Date,
  cutoffHour: number = BUSINESS_DAY_CUTOFF_HOUR_DEFAULT,
): string {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const parts = toJstParts(d)
  if (parts.h < cutoffHour) {
    const prev = new Date(d.getTime() + JST_OFFSET_MS - 24 * 60 * 60 * 1000)
    return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`
  }
  return `${parts.y}-${pad(parts.m)}-${pad(parts.day)}`
}

export function nowJstIso(): string {
  const p = toJstParts(new Date())
  return `${p.y}-${pad(p.m)}-${pad(p.day)}T${pad(p.h)}:${pad(p.min)}:${pad(p.s)}.${pad(p.ms, 3)}+09:00`
}

export function todayBusinessDate(cutoffHour: number = BUSINESS_DAY_CUTOFF_HOUR_DEFAULT): string {
  return getBusinessDate(new Date(), cutoffHour)
}
