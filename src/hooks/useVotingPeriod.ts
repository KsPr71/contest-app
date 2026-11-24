import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Period = { voting_starts_at: string | null; voting_ends_at: string | null; server_now: string }
export function useVotingPeriod(enabled: boolean) {
  const [period, setPeriod] = useState<Period | null>(null)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) return
    let disposed = false
    let revision = 0
    const refresh = async () => {
      const request = ++revision
      const started = Date.now()
      const { data, error } = await supabase.rpc('get_voting_period')
      if (disposed || request !== revision) return
      if (error || !data) { setPeriod(null); setError('No se pudo verificar el período de votación.'); return }
      setOffset(Date.parse(data.server_now) - (started + Date.now()) / 2)
      setNow(Date.now()); setPeriod(data); setError('')
    }
    const focus = () => { if (!document.hidden) void refresh() }
    void refresh()
    window.addEventListener('contest-schedule', refresh)
    document.addEventListener('visibilitychange', focus)
    return () => { disposed = true; window.removeEventListener('contest-schedule', refresh); document.removeEventListener('visibilitychange', focus) }
  }, [enabled])
  useEffect(() => {
    if (!enabled || !period) return
    const boundaries = [period.voting_starts_at, period.voting_ends_at].filter(Boolean).map(date => Date.parse(date!))
    const next = boundaries.filter(time => time > now + offset).sort((a, b) => a - b)[0]
    if (!next) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(next - (now + offset) + 50, 2_147_000_000))
    return () => clearTimeout(timer)
  }, [enabled, period, now, offset])
  const start = period?.voting_starts_at ? Date.parse(period.voting_starts_at) : NaN
  const end = period?.voting_ends_at ? Date.parse(period.voting_ends_at) : NaN
  const open = now + offset >= start && now + offset < end
  const format = (time: number) => new Date(time).toLocaleString('es')
  const message = error || (!period ? 'Verificando período de votación…' : !Number.isFinite(start)
    ? 'Votación pendiente de programación.' : now + offset < start
      ? `Las votaciones comienzan el ${format(start)} y finalizan el ${format(end)}.`
      : open ? `Votación abierta hasta el ${format(end)}.` : `Votación finalizada el ${format(end)}.`)
  return { open: enabled && open && !error, message }
}
