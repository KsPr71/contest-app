export type Totals = { photo_id: string; vote_count: number; score_sum: number; version: number }

export function parseTotals(value: unknown): Totals | null {
  if (typeof value !== 'object' || value === null) return null
  const t = value as Totals
  if (typeof t.photo_id !== 'string' || !Number.isSafeInteger(t.vote_count) || t.vote_count < 0
    || !Number.isSafeInteger(t.score_sum) || t.score_sum < t.vote_count || t.score_sum > t.vote_count * 5
    || !Number.isSafeInteger(t.version) || t.version < 1) return null
  return t
}

export function mergeTotals(previous: Record<string, Totals>, incoming: unknown[], ids: Set<string>) {
  let next = previous
  for (const value of incoming) {
    const total = parseTotals(value)
    if (total && ids.has(total.photo_id) && (!next[total.photo_id] || next[total.photo_id].version < total.version)) {
      if (next === previous) next = { ...previous }
      next[total.photo_id] = total
    }
  }
  return next
}
