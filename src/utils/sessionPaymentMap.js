/** Ported from client/src/utils/sessionPaymentMap.js — keep in sync with web. */
import { normalizeSessionRows } from './physioBookingHelpers'

function roundMoney2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

export function sessionRowKey(row) {
  return row?.sessionId ? String(row.sessionId) : '__primary__'
}

/**
 * Map verified/collected payments onto session rows (explicit sessionId first,
 * then FIFO allocation for unassigned manager collections).
 */
export function buildSessionPaymentMap(booking, payments, summary) {
  const rows = normalizeSessionRows(booking)
  const totalAmount = Number(summary?.totalAmount || booking?.totalAmount || 0)
  const perSession = roundMoney2(
    Number(summary?.amountPerSession || 0) ||
      (rows.length > 0 && totalAmount > 0 ? totalAmount / rows.length : 0),
  )

  const map = {}
  for (const r of rows) {
    map[sessionRowKey(r)] = { recorded: 0, items: [], sessionNumber: r.n }
  }

  const active = (payments || [])
    .filter((p) => ['verified', 'collected', 'paid', 'pending'].includes(p?.status))
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))

  for (const p of active.filter((pay) => pay.sessionId)) {
    const row = rows.find((r) => String(r.sessionId) === String(p.sessionId))
    const key = row ? sessionRowKey(row) : String(p.sessionId)
    if (!map[key]) map[key] = { recorded: 0, items: [], sessionNumber: row?.n }
    const amt = Number(p.amount || 0)
    map[key].recorded = roundMoney2(map[key].recorded + amt)
    map[key].items.push({ payment: p, allocated: amt, explicit: true })
  }

  for (const p of active.filter((pay) => !pay.sessionId)) {
    let remaining = Number(p.amount || 0)
    for (const r of rows) {
      if (remaining <= 0.009) break
      const key = sessionRowKey(r)
      if (!map[key]) map[key] = { recorded: 0, items: [], sessionNumber: r.n }
      const need =
        perSession > 0 ? Math.max(0, roundMoney2(perSession - map[key].recorded)) : remaining
      if (need <= 0.009 && perSession > 0) continue
      const apply = roundMoney2(perSession > 0 ? Math.min(need, remaining) : remaining)
      if (apply <= 0) continue
      map[key].recorded = roundMoney2(map[key].recorded + apply)
      map[key].items.push({ payment: p, allocated: apply, explicit: false })
      remaining = roundMoney2(remaining - apply)
    }
  }

  return map
}

/** Default session to attach a new collection to (first not fully covered). */
export function defaultCollectionSessionId(booking, sessionPaymentMap, perSession) {
  const rows = normalizeSessionRows(booking)
  if (!rows.length) return null
  const cap = roundMoney2(Number(perSession || 0))
  for (const r of rows) {
    const key = sessionRowKey(r)
    const recorded = sessionPaymentMap?.[key]?.recorded || 0
    if (cap <= 0 || recorded < cap - 0.009) {
      return r.sessionId || null
    }
  }
  return rows[0]?.sessionId || null
}
