import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { adminClient as client, errorMessage, localDate } from '../lib/admin'
import { optimizeImage } from '../lib/optimizeImage'
import type { OptimizedImage } from '../lib/optimizeImage'
import './Admin.css'

type Photo = { id: string; name: string; description: string; published_at: string; thumbnail_path: string; image_path: string }
type Attempt = { id: string; images: OptimizedImage | null; uploaded: Set<string>; row: Record<string, unknown> }
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const uploadJournal = 'enfoque-pending-upload'
function recoveredUpload() {
  try {
    const id = localStorage.getItem(uploadJournal)
    return id && /^[a-f0-9-]{36}$/.test(id) ? { id, images: null, uploaded: new Set<string>(), row: {} } : null
  } catch { return null }
}

export default function Admin() {
  const [user, setUser] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const authOwner = useRef<string | null>(null)
  useEffect(() => {
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message)
      setUser(data.session?.user.id ?? null); setChecking(false)
    })
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return
      const next = session?.user.id ?? null
      if (authOwner.current === next) return
      authOwner.current = next
      setAllowed(false); setChecking(!!session); setUser(session?.user.id ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!user) return
    let disposed = false
    void client.from('admins').select('user_id').eq('user_id', user).maybeSingle().then(({ data, error }) => {
      if (disposed) return
      setAllowed(!!data && !error); setChecking(false)
      setMessage(error ? error.message : data ? '' : 'Esta cuenta no tiene permisos de administración.')
    })
    return () => { disposed = true }
  }, [user])
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      setPassword('')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <div className="admin-shell">
    <header className="admin-header"><a className="brand" href="/">◉ ENFOQUE.</a><a href="/">Ver galería</a>
      {user && <button disabled={busy} onClick={() => { void client.auth.signOut().then(({ error }) => { if (error) setMessage(error.message) }) }}>Cerrar sesión</button>}</header>
    <main><p className="eyebrow">ADMINISTRACIÓN</p><h1>Tu concurso, al día.</h1>
      <p role="status">{message}</p>
      {checking ? <p>Verificando acceso…</p> : allowed ? <Dashboard /> : <form className="admin-panel login" onSubmit={login}>
        <h2>Acceso del administrador</h2><p>Inicia sesión con una cuenta autorizada para gestionar el concurso.</p>
        <label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
      </form>}
    </main>
  </div>
}

function Dashboard() {
  const [now, setNow] = useState(Date.now)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [more, setMore] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Photo | null>(null)
  const [editDate, setEditDate] = useState('')
  const [cleanup, setCleanup] = useState<string[]>([])
  const load = useCallback(async () => {
    const results = await Promise.all([
      client.from('photos').select('id,name,description,published_at,thumbnail_path,image_path').order('published_at', { ascending: false }).order('id').range(0, 23),
      client.from('contest_settings').select('voting_starts_at,voting_ends_at').eq('id', true).maybeSingle(),
    ])
    for (const result of results) if (result.error) throw result.error
    setNow(Date.now()); setPhotos(results[0].data!); setMore(results[0].data!.length === 24)
    const period = results[1].data
    if (!period) throw new Error('No se encontró la configuración del concurso. Es necesario restaurar su registro en Supabase antes de guardar el período.')
    setStart(period.voting_starts_at ? localDate(period.voting_starts_at) : '')
    setEnd(period.voting_ends_at ? localDate(period.voting_ends_at) : ''); setReady(true)
  }, [])
  useEffect(() => { void Promise.resolve().then(load).catch(error => setStatus(errorMessage(error))) }, [load])
  async function savePeriod(event: FormEvent) {
    event.preventDefault(); setStatus(''); setSaving(true)
    try {
      if (!start || !end || Date.parse(end) <= Date.parse(start)) throw new Error('La finalización debe ser posterior al inicio.')
      const { error, data } = await client.from('contest_settings').update({ voting_starts_at: new Date(start).toISOString(), voting_ends_at: new Date(end).toISOString() }).eq('id', true).select('id')
      if (error) throw error
      if (data?.length !== 1) throw new Error('No se pudo guardar el período. Comprueba que exista la configuración del concurso y que tu cuenta conserve los permisos de administrador.')
      setStatus('Período de votación guardado.')
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setSaving(false) }
  }
  async function savePhoto(event: FormEvent) {
    event.preventDefault(); if (!editing) return
    setSaving(true)
    try {
      const { error } = await client.from('photos').update({ name: editing.name.trim(), description: editing.description.trim(), published_at: new Date(editDate).toISOString() }).eq('id', editing.id).select('id').single()
      if (error) throw error
      setEditing(null); await load(); setStatus('Detalles de la fotografía actualizados.')
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setSaving(false) }
  }
  async function removePhoto(photo: Photo) {
    if (!window.confirm(`¿Eliminar «${photo.name}» y sus votos? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    try {
      const { error } = await client.from('photos').delete().eq('id', photo.id).select('id').single()
      if (error) throw error
      const paths = [photo.thumbnail_path, photo.image_path]
      const removed = await client.storage.from('concurso-fotos').remove(paths)
      if (removed.error) { setCleanup(old => [...old, ...paths]); setStatus('Ficha eliminada; quedan archivos por limpiar. Usa Reintentar limpieza.') }
      else setStatus('Fotografía y archivos eliminados.')
      await load()
    } catch (error) { setStatus(errorMessage(error)) }
    finally { setSaving(false) }
  }
  return <>
    <section className="admin-panel"><h2>Período de votación</h2><p>Zona horaria: <strong>{timezone}</strong>. El cierre impide nuevos votos y cambios de puntuación.</p>
      <form onSubmit={savePeriod}><div className="admin-grid"><label>Inicio de votaciones<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Fin de votaciones<input type="datetime-local" required value={end} min={start} onChange={e => setEnd(e.target.value)} /></label></div>
        <button className="primary" disabled={saving || !ready}>Guardar período</button></form>
    </section>
    <p role="status">{status}</p>
    {!ready && <button onClick={() => { void load().catch(error => setStatus(errorMessage(error))) }}>Reintentar carga</button>}
    <Upload onPublished={async () => { await load() }} />
    <section className="admin-panel"><h2>Fotografías del concurso</h2><p>Las programadas se muestran aquí antes de aparecer en la galería.</p>
      {!photos.length && <p>No hay fotografías cargadas.</p>}
      {photos.map(photo => <article className="admin-photo" key={photo.id}>
        <img crossOrigin="anonymous" src={client.storage.from('concurso-fotos').getPublicUrl(photo.thumbnail_path).data.publicUrl} alt={photo.name} width="96" height="80" loading="lazy" />
        <div><h3>{photo.name}</h3><p>{photo.description}</p><small>{Date.parse(photo.published_at) > now ? 'Programada' : 'Publicada'} · {new Date(photo.published_at).toLocaleString('es')}</small></div>
        <div className="admin-actions"><button disabled={saving} onClick={() => { setEditing({ ...photo }); setEditDate(localDate(photo.published_at)) }}>Editar</button><button disabled={saving} onClick={() => { void removePhoto(photo) }}>Eliminar</button></div>
      </article>)}
      {more && <button disabled={saving} onClick={async () => {
        setSaving(true)
        try {
          const { data, error } = await client.from('photos').select('id,name,description,published_at,thumbnail_path,image_path').order('published_at', { ascending: false }).order('id').range(photos.length, photos.length + 23)
          if (error) throw error
          setPhotos(old => [...old, ...data]); setMore(data.length === 24)
        } catch (error) { setStatus(errorMessage(error)) } finally { setSaving(false) }
      }}>Cargar más fotografías</button>}
      {!!cleanup.length && <button onClick={async () => { const { error } = await client.storage.from('concurso-fotos').remove(cleanup); if (error) setStatus(error.message); else { setCleanup([]); setStatus('Archivos limpiados.') } }}>Reintentar limpieza</button>}
      {editing && <form className="admin-edit" onSubmit={savePhoto}><h3>Editar fotografía</h3>
        <label>Nombre<input required maxLength={100} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
        <label>Texto breve<textarea required maxLength={350} value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} /></label>
        <label>Fecha de publicación · {timezone}<input type="datetime-local" required value={editDate} onChange={e => setEditDate(e.target.value)} /></label>
        <button className="primary" disabled={saving}>Guardar detalles</button><button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancelar edición</button>
      </form>}
    </section>
  </>
}

function Upload({ onPublished }: { onPublished: () => Promise<void> }) {
  const [recovered] = useState(recoveredUpload)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => localDate(new Date().toISOString()))
  const [images, setImages] = useState<OptimizedImage | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(recovered ? 'Hay un envío anterior pendiente de comprobar. Usa Cancelar envío y limpiar; si la ficha ya existe, se conservará.' : '')
  const [pending, setPending] = useState(!!recovered)
  const attempt = useRef<Attempt | null>(recovered)
  const fileInput = useRef<HTMLInputElement>(null)
  const preparation = useRef(0)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  async function prepare(file?: File) {
    const revision = ++preparation.current
    setImages(null); setPreview(''); if (!file) return
    setBusy(true); setMessage('Optimizando miniatura y ampliación…')
    try {
      const result = await optimizeImage(file)
      if (revision !== preparation.current) return
      setImages(result); setPreview(URL.createObjectURL(result.thumbnail.blob)); setMessage('Imagen preparada. Solo se subirán las dos versiones optimizadas.')
    } catch (error) { if (revision === preparation.current) setMessage(errorMessage(error)) }
    finally { if (revision === preparation.current) setBusy(false) }
  }
  function reset() {
    try { localStorage.removeItem(uploadJournal) } catch { /* Storage may be unavailable. */ }
    attempt.current = null; setPending(false); setImages(null); setPreview(''); setName(''); setDescription('')
    if (fileInput.current) fileInput.current.value = ''
  }
  async function publish(event: FormEvent) {
    event.preventDefault(); if (!images) return
    setBusy(true)
    try {
      if (!attempt.current) {
        if (!name.trim() || !description.trim()) throw new Error('Completa el nombre y el texto breve.')
        const id = crypto.randomUUID()
        attempt.current = { id, images, uploaded: new Set(), row: { id, name: name.trim(), description: description.trim(), published_at: new Date(date).toISOString(),
          thumbnail_path: `${id}/thumb.webp`, image_path: `${id}/full.webp`, thumbnail_width: images.thumbnail.width, thumbnail_height: images.thumbnail.height, image_width: images.full.width, image_height: images.full.height } }
        setPending(true)
        // Retain only an identifier, never the source file or credentials.
        try { localStorage.setItem(uploadJournal, id) } catch { /* The current attempt remains available in memory. */ }
      }
      const current = attempt.current
      // A lost insert response must be reconciled before uploading or deleting anything.
      const existing = await client.from('photos').select('id').eq('id', current.id).maybeSingle()
      if (existing.error) throw existing.error
      if (!existing.data) {
        if (!current.images) throw new Error('Vuelve a seleccionar la imagen después de limpiar el envío anterior.')
        for (const [suffix, variant] of [['thumb', current.images.thumbnail], ['full', current.images.full]] as const) {
          const path = `${current.id}/${suffix}.webp`
          if (current.uploaded.has(path)) continue
          setMessage(suffix === 'thumb' ? 'Subiendo miniatura (1 de 2)…' : 'Subiendo ampliación (2 de 2)…')
          const { error } = await client.storage.from('concurso-fotos').upload(path, variant.blob, { upsert: false, contentType: 'image/webp', cacheControl: '31536000' })
          // UUID is private to this attempt; duplicate means the previous response was lost.
          if (error && !['409', 'Duplicate'].includes(String(error.statusCode)) && !/already exists/i.test(error.message)) throw error
          current.uploaded.add(path)
        }
        setMessage('Guardando ficha…')
        const result = await client.from('photos').insert(current.row).select('id').single()
        if (result.error) {
          const check = await client.from('photos').select('id').eq('id', current.id).maybeSingle()
          if (check.error || !check.data) throw result.error
        }
      }
      reset(); setMessage('Fotografía guardada correctamente.')
      await onPublished().catch(error => setMessage(`Fotografía guardada. No se pudo actualizar la lista: ${errorMessage(error)}`))
    } catch (error) { setMessage(`${errorMessage(error)} Puedes reintentar el mismo envío o cancelarlo.`) }
    finally { setBusy(false) }
  }
  async function cancel() {
    const current = attempt.current; if (!current) return
    setBusy(true)
    try {
      const { data, error } = await client.from('photos').select('id').eq('id', current.id).maybeSingle()
      if (error) throw error
      if (data) { reset(); setMessage('La fotografía ya estaba guardada; se conserva.'); await onPublished(); return }
      const removed = await client.storage.from('concurso-fotos').remove([`${current.id}/thumb.webp`, `${current.id}/full.webp`])
      if (removed.error) throw removed.error
      reset(); setMessage('Envío cancelado y archivos temporales eliminados.')
    } catch (error) { setMessage(`${errorMessage(error)} Conservamos el intento para reintentar su limpieza.`) }
    finally { setBusy(false) }
  }
  return <section className="admin-panel"><h2>Subir fotografía</h2><p>Miniatura de hasta 20 KB y ampliación de hasta 500 KiB. El original permanece en tu equipo.</p>
    <form onSubmit={publish}><fieldset disabled={busy || pending}>
      <label>Fotografía<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void prepare(e.target.files?.[0]) }} /></label>
      <label>Nombre de la fotografía<input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Texto breve<textarea required maxLength={350} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label>Fecha de publicación · {timezone}<input type="datetime-local" required value={date} onChange={e => setDate(e.target.value)} /></label>
    </fieldset>
    {images && <div className="upload-preview"><img src={preview || undefined} alt="Vista previa optimizada" /><p>Miniatura: {images.thumbnail.blob.size.toLocaleString('es')} bytes · {images.thumbnail.width} × {images.thumbnail.height} px<br />Ampliación: {(images.full.blob.size / 1024).toFixed(1)} KiB · {images.full.width} × {images.full.height} px</p></div>}
    <p role="status">{message}</p><button className="primary" disabled={busy || !images}>{busy ? 'Procesando…' : pending ? 'Reintentar envío' : 'Guardar fotografía'}</button>
    {pending && <button type="button" disabled={busy} onClick={() => { void cancel() }}>Cancelar envío y limpiar</button>}
    </form>
  </section>
}
