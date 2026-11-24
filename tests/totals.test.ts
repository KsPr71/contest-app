import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeTotals, parseTotals } from '../src/lib/totals.ts'

test('duplicate, out-of-order and invisible totals do not replace newer state', () => {
  const row = { photo_id: 'photo', vote_count: 2, score_sum: 8, version: 4 }
  const state = { photo: row }
  const ids = new Set(['photo'])
  assert.equal(mergeTotals(state, [row, { ...row, version: 3 }, { ...row, photo_id: 'other' }], ids), state)
  const next = mergeTotals(state, [{ ...row, version: 5, score_sum: 9 }], ids)
  assert.equal(next.photo.score_sum, 9)
  assert.equal(state.photo.score_sum, 8)
})

test('invalid payloads are rejected without corrupting displayed totals', () => {
  for (const input of [null, {}, { photo_id: 'photo', vote_count: -1, score_sum: 0, version: 1 },
    { photo_id: 'photo', vote_count: 1, score_sum: 6, version: 1 },
    { photo_id: 'photo', vote_count: 1, score_sum: 2, version: '3' }]) {
    assert.equal(parseTotals(input), null)
  }
})
