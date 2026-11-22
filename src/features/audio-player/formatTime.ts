/** Formats seconds as m:ss, or h:mm:ss from one hour. Non-finite or negative input gives 0:00. */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Spoken form for screen readers, e.g. "1 timme 2 minuter 5 sekunder". */
export function formatTimeSpoken(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} ${h === 1 ? 'timme' : 'timmar'}`)
  if (m > 0) parts.push(`${m} ${m === 1 ? 'minut' : 'minuter'}`)
  if (s > 0 || parts.length === 0) parts.push(`${s} ${s === 1 ? 'sekund' : 'sekunder'}`)
  return parts.join(' ')
}
