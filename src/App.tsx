import { useEffect, useRef, useState } from 'react'
import PhotoAlbum from 'react-photo-album'
import 'react-photo-album/styles.css'
import './App.css'
import navidad from './assets/navidad.svg'
import LoadingImage from './components/LoadingImage'
import PhotoCard from './components/PhotoCard'
import sampleImages from './data/sample-images.json'
import { useContest } from './hooks/useContest'
import { useVotingPeriod } from './hooks/useVotingPeriod'
import { optimizeImage } from './lib/optimizeImage'
import type { Entry } from './types/photo'

const categories = ['Todas', 'Naturaleza', 'Viajes', 'Mis imágenes']
const titles: Record<string, string> = { mountain: 'Un instante en calma', city: 'Líneas que cuentan', light: 'La luz del momento', travel: 'Lejos de la rutina' }
const initial: Entry[] = sampleImages.map((image, index) => ({
  id: image.id, title: titles[image.id], alt: titles[image.id],
  src: `/photos/${image.id}-thumb.webp`, width: image.thumb.width, height: image.thumb.height,
  fullSrc: `/photos/${image.id}-full.webp`, fullWidth: image.full.width, fullHeight: image.full.height,
  thumbnailBytes: image.thumb.bytes, fullBytes: image.full.bytes,
  category: index % 2 ? 'Viajes' : 'Naturaleza', publishedAt: '2026-11-22T12:00:00Z',
  description: 'Una mirada a los espacios, la luz y los pequeños instantes que nos rodean.',
}))

export default function App() {
  const [demo, setDemo] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1')
  const contest = useContest(!demo)
  const period = useVotingPeriod(!demo)
  const [localPhotos, setLocalPhotos] = useState(initial)
  const [localVotes, setLocalVotes] = useState<Record<string, number>>({})
  const [category, setCategory] = useState('Todas')
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<'masonry' | 'rows' | 'columns'>('masonry')
  const [selected, setSelected] = useState<Entry | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const urls = useRef<string[]>([])
  const shell = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)
  const hero = useRef<HTMLElement>(null)
  const photos = demo ? localPhotos : contest.photos
  const votes = demo ? localVotes : contest.votes
  const visible = photos.filter(photo => (category === 'Todas' || photo.category === category)
    && photo.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  useEffect(() => () => urls.current.forEach(url => URL.revokeObjectURL(url)), [])
  useEffect(() => {
    const container = shell.current
    const intro = hero.current
    const navigation = header.current
    if (!container || !intro || !navigation) return
    let frame = 0
    const update = () => {
      frame = 0
      container.style.setProperty('--site-header-height', `${navigation.getBoundingClientRect().height}px`)
      const distance = Math.min(window.scrollY, intro.offsetHeight)
      intro.style.setProperty('--hero-offset', `${distance * .22}px`)
      intro.style.setProperty('--hero-opacity', String(Math.max(0, 1 - distance / Math.max(1, intro.offsetHeight * .85))))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    const observer = new ResizeObserver(schedule)
    observer.observe(navigation)
    observer.observe(intro)
    window.addEventListener('scroll', schedule, { passive: true })
    update()
    return () => { observer.disconnect(); window.removeEventListener('scroll', schedule); cancelAnimationFrame(frame) }
  }, [])
  useEffect(() => {
    if (!selected) return
    const modal = dialog.current
    modal?.showModal()
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { modal?.close(); document.body.style.overflow = old }
  }, [selected])

  function switchMode() {
    setDemo(!demo); setCategory('Todas'); setQuery(''); setMessage('')
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setLoading(true)
    const added: Entry[] = []
    const failures: string[] = []
    for (const file of Array.from(files)) {
      try {
        const { thumbnail, full } = await optimizeImage(file)
        const src = URL.createObjectURL(thumbnail.blob)
        const fullSrc = URL.createObjectURL(full.blob)
        urls.current.push(src, fullSrc)
        const title = file.name.replace(/\.[^.]+$/, '')
        added.push({ id: crypto.randomUUID(), src, width: thumbnail.width, height: thumbnail.height,
          fullSrc, fullWidth: full.width, fullHeight: full.height,
          thumbnailBytes: thumbnail.blob.size, fullBytes: full.blob.size,
          title, alt: title, category: 'Mis imágenes', publishedAt: new Date().toISOString(),
          description: 'Fotografía optimizada desde tu equipo para probar la galería.' })
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'No se pudo leer la imagen.'}`)
      }
    }
    setLocalPhotos(old => [...added, ...old])
    if (added.length) { setCategory('Mis imágenes'); setQuery('') }
    setMessage(`${added.length} imágenes optimizadas. ${failures.join(' ')}`)
    setLoading(false)
    if (input.current) input.current.value = ''
  }

  return <div className="shell" ref={shell}>
    <header ref={header}>
      <a className="brand" href="#"><span aria-hidden="true">◉</span> ENFOQUE.</a>
      <span className="header-caption">CONCURSO DE FOTOGRAFÍA</span>
      <div className="controls hero-search">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input type="search" aria-label="Buscar fotografías" placeholder="Buscar fotografías…" value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <a href="/admin" className="admin-link" aria-label="Administración" title="Administración">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9.5 3-.6 2.2-1.5.9-2.2-.6-2.5 4.3 1.6 1.6v1.8l-1.6 1.6 2.5 4.3 2.2-.6 1.5.9.6 2.2h5l.6-2.2 1.5-.9 2.2.6 2.5-4.3-1.6-1.6v-1.8l1.6-1.6-2.5-4.3-2.2.6-1.5-.9-.6-2.2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </a>
      <span className="badge">{demo ? '● Prueba local' : '● Concurso'}</span>
    </header>
    <main>
      <section className="intro" ref={hero}>
        <div className="intro-content">
          <p className="eyebrow">UN ESPACIO PARA TU MIRADA</p>
          <h1>Cada imagen, un recuerdo de<br /> <em> Navidad.</em></h1>
          <p className="intro-art-quote">Hay tantas formas de mirar<br />como historias por contar.</p>
          <small className="intro-tagline">ENCUENTRA LA TUYA</small>
        </div>
        <div className="intro-art">
          <img src={navidad} alt="" aria-hidden="true" />

        </div>
      </section>
      <section className="gallery" aria-label="Fotografías del concurso">
        {demo && <div className="demo-tools">
          <button className="primary" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'Preparando imágenes…' : 'Añadir fotografías'}</button>
          <input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void upload(event.target.files) }} />
          <button className="mode-toggle" onClick={switchMode}>Volver al concurso</button>
        </div>}
        <div className="section-heading">
          <div><p className="eyebrow">BIENVENIDOS AL CONCURSO</p><h2 id="gallery-title">Recuerdos de Navidad <span>{String(photos.length).padStart(2, '0')}</span></h2></div>
        </div>
        <div className="gallery-top">
        <div className="gallery-overview">
        <div className="toolbar">
          <div className="filters" aria-label="Categorías">
            {(demo ? categories : ['Todas', 'Concurso']).map(item => <button key={item} aria-pressed={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
          </div>
        </div>
        </div>
        <details className="gallery-options">
          <summary>Opciones de la galería</summary>
          <div className="gallery-options-content">
          <small>{demo ? 'Imágenes de muestra + tus fotografías' : 'Fotografías publicadas'}</small>
          <div className="controls">
            <select aria-label="Distribución de la galería" value={layout} onChange={event => setLayout(event.target.value as typeof layout)}><option value="masonry">Mosaico</option><option value="rows">Filas</option><option value="columns">Columnas</option></select>
          </div>
        <p role="status" className="status">{(!demo ? contest.error || (contest.loading ? 'Cargando fotografías…' : '') : message) || `${visible.length} fotografías · Selecciona una imagen para explorarla`}</p>
        {!demo && <div className="live-toolbar">
          <span role="status">{period.message}</span>
          <span role="status">{contest.live}</span>
          {!contest.hasSession && <button className="primary" onClick={() => { void contest.activateLive() }}>Activar resultados en vivo</button>}
          {contest.error && <button onClick={contest.retry}>Reintentar</button>}
        </div>}
          </div>
        </details>
        </div>
        {visible.length ? <PhotoAlbum layout={layout} photos={visible} spacing={20}
          columns={width => width < 550 ? 1 : width < 900 ? 2 : 3} targetRowHeight={280}
          rowConstraints={width => width < 550 ? { maxPhotos: 1 } : { singleRowMaxHeight: 360 }} onClick={({ photo }) => setSelected(photo)}
          render={{ photo: ({ onClick }, { photo, width, height, index }) => <PhotoCard
            photo={photo} width={width} height={height} onOpen={onClick} priority={index < 3}
            score={votes[photo.id]} local={demo} totals={contest.totals[photo.id]}
            votingClosed={!demo && !period.open}
            saving={!demo && contest.saving[photo.id]} voteMessage={demo ? undefined : !period.open ? period.message : contest.voteMessages[photo.id]}
            onVote={(id, score) => { if (demo) setLocalVotes(old => ({ ...old, [id]: score })); else if (period.open) void contest.vote(id, score) }} /> }} />
          : <div className="empty">
            <h3>{contest.loading && !demo ? 'Cargando la colección…' : !demo && !photos.length ? 'Aún no hay fotografías publicadas' : 'No encontramos fotografías'}</h3>
            <p>{demo ? 'Prueba otra búsqueda o añade imágenes desde tu equipo.' : 'Las fotografías aparecerán aquí cuando se publiquen.'}</p>
            {(query || category !== 'Todas') && <button className="primary" onClick={() => { setCategory('Todas'); setQuery('') }}>Ver toda la colección</button>}
          </div>}
        {!demo && contest.hasMore && <button className="primary load-more" disabled={contest.loading} onClick={contest.loadMore}>{contest.loading ? 'Cargando…' : 'Cargar más fotografías'}</button>}
      </section>
    </main>
    <footer><strong>ENFOQUE.</strong><span>Una colección de instantes que merecen ser vistos.</span><small>{demo ? 'PRUEBA LOCAL' : 'CONCURSO DE FOTOGRAFÍA'}</small></footer>
    <dialog ref={dialog} className="lightbox" aria-labelledby="photo-title"
      onCancel={event => { event.preventDefault(); setSelected(null) }} onClose={() => setSelected(null)}
      onClick={event => { if (event.target === event.currentTarget) setSelected(null) }}>
      {selected && <>
        <button className="close" aria-label="Cerrar fotografía" onClick={() => setSelected(null)}>×</button>
        <LoadingImage crossOrigin="anonymous" src={selected.fullSrc} alt={selected.alt} />
        <div className="photo-info"><div><h2 id="photo-title">{selected.title}</h2><p>{selected.category}</p></div><span>{selected.fullWidth} × {selected.fullHeight} px</span></div>
      </>}
    </dialog>
  </div>
}
