import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureVoter, supabase } from '../lib/supabase'
import { mergeTotals } from '../lib/totals'
import type { Totals } from '../lib/totals'
import type { Entry } from '../types/photo'

const PAGE_SIZE = 24
type PageRow = {
  id: string; name: string; description: string; published_at: string
  thumbnail_path: string; image_path: string
  thumbnail_width: number; thumbnail_height: number; image_width: number; image_height: number
}
const fields = 'id,name,description,published_at,thumbnail_path,image_path,thumbnail_width,thumbnail_height,image_width,image_height'
const pageCache = new Map<number, Promise<PageRow[]>>()
function getPage(page: number) {
  if (!pageCache.has(page)) {
    const result = Promise.resolve(supabase.from('photos').select(fields)
      .lte('published_at', new Date().toISOString()).order('published_at', { ascending: false })
      .order('id', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1))
      .then(({ data, error }) => { if (error) throw error; return data as PageRow[] })
      .catch(error => { pageCache.delete(page); throw error })
    pageCache.set(page, result)
  }
  return pageCache.get(page)!
}

export function useContest(enabled: boolean) {
  const [photos, setPhotos] = useState<Entry[]>([])
  const [page, setPage] = useState(0)
  const [reload, setReload] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [votes, setVotes] = useState<Record<string, number>>({})
  const [totals, setTotals] = useState<Record<string, Totals>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [voteMessages, setVoteMessages] = useState<Record<string, string>>({})
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [live, setLive] = useState('Activa los resultados en vivo o emite tu primer voto.')
  const [visible, setVisible] = useState(!document.hidden)
  const ids = useRef(new Set<string>())
  const inFlight = useRef(new Set<string>())
  const voteRevision = useRef<Record<string, number>>({})
  const authOwner = useRef<string | null>(null)

  useEffect(() => {
    const handler = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSessionId(data.session?.user.id ?? null)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const owner = session?.user.id ?? null
      if (authOwner.current !== owner) setVotes({})
      authOwner.current = owner
      setSessionId(owner)
    })
    return () => { cancelled = true; data.subscription.unsubscribe() }
  }, [enabled])

  const snapshot = useCallback(async () => {
    const list = [...ids.current]
    if (!list.length) return
    const { data, error } = await supabase.from('vote_totals')
      .select('photo_id,vote_count,score_sum,version').in('photo_id', list)
    if (error) throw error
    setTotals(previous => mergeTotals(previous, data ?? [], ids.current))
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const run = async () => {
      setLoading(true); setError('')
      try {
        const rows = await getPage(page)
        if (cancelled) return
        const entries = rows.map(row => ({
          id: row.id, title: row.name, description: row.description,
          category: 'Concurso', publishedAt: row.published_at, alt: row.name,
          src: supabase.storage.from('concurso-fotos').getPublicUrl(row.thumbnail_path).data.publicUrl,
          width: row.thumbnail_width, height: row.thumbnail_height,
          fullSrc: supabase.storage.from('concurso-fotos').getPublicUrl(row.image_path).data.publicUrl,
          fullWidth: row.image_width, fullHeight: row.image_height,
        }))
        entries.forEach(photo => ids.current.add(photo.id))
        setPhotos(previous => {
          const map = new Map(previous.map(p => [p.id, p]))
          entries.forEach(photo => map.set(photo.id, photo))
          return [...map.values()]
        })
        setHasMore(rows.length === PAGE_SIZE)
        await snapshot()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo cargar la galería.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void run()
    return () => { cancelled = true }
  }, [enabled, page, reload, snapshot])

  useEffect(() => {
    if (!enabled || !sessionId || !photos.length) return
    let cancelled = false
    const revisions = { ...voteRevision.current }
    void supabase.from('votes').select('photo_id,score').eq('voter_id', sessionId)
      .in('photo_id', photos.map(p => p.id)).then(({ data, error }) => {
        if (cancelled || error) return
        setVotes(previous => {
          const next = { ...previous }
          data?.forEach(vote => { if (!inFlight.current.has(vote.photo_id) && revisions[vote.photo_id] === voteRevision.current[vote.photo_id]) next[vote.photo_id] = vote.score })
          return next
        })
      })
    return () => { cancelled = true }
  }, [enabled, sessionId, photos])

  useEffect(() => {
    if (!enabled || !sessionId || !visible) return
    let stopped = false
    const channel = supabase.channel('contest:totals', { config: { private: true } })
      .on('broadcast', { event: 'schedule' }, () => window.dispatchEvent(new Event('contest-schedule')))
      .on('broadcast', { event: 'totals' }, ({ payload }) => {
        const updates = payload?.totals
        if (!stopped && Array.isArray(updates)) setTotals(old => mergeTotals(old, updates, ids.current))
      })
    void supabase.realtime.setAuth().then(() => {
      if (stopped) return
      setLive('Conectando resultados en vivo…')
      channel.subscribe(status => {
        if (stopped) return
        if (status === 'SUBSCRIBED') {
          window.dispatchEvent(new Event('contest-schedule'))
          setLive('En vivo · Los cambios se agrupan cada 10 segundos.')
          void snapshot().catch(() => setLive('No se pudieron sincronizar los totales.'))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setLive('Reconectando resultados en vivo…')
        }
      })
    }).catch(() => { if (!stopped) setLive('No se pudo activar la conexión en vivo.') })
    return () => { stopped = true; void supabase.removeChannel(channel) }
  }, [enabled, sessionId, visible, snapshot])

  async function activateLive() {
    setLive('Activando resultados en vivo…')
    try { setSessionId(await ensureVoter()) }
    catch (reason) { setLive(reason instanceof Error ? reason.message : 'No se pudo activar la sesión.') }
  }

  async function vote(id: string, score: number) {
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    voteRevision.current[id] = (voteRevision.current[id] ?? 0) + 1
    setSaving(old => ({ ...old, [id]: true }))
    setVoteMessages(old => ({ ...old, [id]: 'Guardando voto…' }))
    try {
      const voter = await ensureVoter()
      setSessionId(voter)
      const { error } = await supabase.from('votes').insert({ photo_id: id, score })
      if (error?.code === '23505') {
        const result = await supabase.from('votes').update({ score }).eq('photo_id', id)
          .eq('voter_id', voter).select('score').single()
        if (result.error) throw result.error
        if (!result.data || result.data.score !== score) throw new Error('El voto no se pudo confirmar.')
      } else if (error) throw error
      setVotes(old => ({ ...old, [id]: score }))
      setVoteMessages(old => ({ ...old, [id]: `Voto guardado: ${score} de 5 · Puedes cambiarlo.` }))
      // Update only this total. The batch later synchronizes other visitors.
      const total = await supabase.from('vote_totals').select('photo_id,vote_count,score_sum,version').eq('photo_id', id).single()
      if (total.data) setTotals(old => mergeTotals(old, [total.data], ids.current))
    } catch (reason) {
      setVoteMessages(old => ({ ...old, [id]: `No se pudo confirmar el voto. ${reason instanceof Error ? reason.message : 'Inténtalo otra vez.'}` }))
    } finally {
      inFlight.current.delete(id)
      setSaving(old => ({ ...old, [id]: false }))
    }
  }

  return { photos, votes, totals, saving, voteMessages, loading, error, live,
    hasSession: !!sessionId, activateLive, vote, hasMore,
    loadMore: () => { if (!loading && hasMore) setPage(old => old + 1) },
    retry: () => { pageCache.clear(); setReload(old => old + 1) },
  }
}
