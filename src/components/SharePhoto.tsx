import { useEffect, useRef, useState } from 'react'
import type { Entry } from '../types/photo'
import { contestPageUrl, createShareImage, shareCaption } from '../lib/shareImage'
import './SharePhoto.css'

export default function SharePhoto({ photo }: { photo: Entry }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function prepare() {
    setMessage('')
    dialog.current?.showModal()
    if (file || loading) return
    setLoading(true)
    try { setFile(await createShareImage(photo, contestPageUrl())) }
    catch { setMessage('No se pudo preparar la imagen. Comprueba tu conexión y reintenta.') }
    finally { setLoading(false) }
  }
  async function copyImage() {
    if (!file) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })])
      setMessage('Imagen copiada. Pégala en tu publicación de Facebook.')
    } catch { setMessage('Este navegador no permite copiar la imagen. Descárgala y adjúntala a tu publicación.') }
  }
  async function nativeShare() {
    if (!file) return
    try { await navigator.share({ files: [file], title: photo.title, text: shareCaption(photo.title), url: contestPageUrl() }) }
    catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setMessage('No se pudo compartir. Puedes copiar o descargar la imagen.')
    }
  }
  const canShareFile = file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  return <div className="photo-share">
    <button type="button" className="share-trigger" aria-label={`Compartir ${photo.title}`} title="Compartir fotografía" onClick={() => { void prepare() }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
    </button>
    <dialog ref={dialog} className="share-dialog" aria-label={`Compartir ${photo.title}`} onCancel={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
      <div className="share-dialog-heading"><h2>Compartir fotografía</h2><button type="button" aria-label="Cerrar opciones para compartir" onClick={() => dialog.current?.close()}>×</button></div>
      {loading && <p role="status">Preparando tu imagen…</p>}
      {preview && <img className="share-image-preview" src={preview} alt={`${shareCaption(photo.title)}. ${contestPageUrl()}`} />}
      {file && <div className="share-options">
        <button type="button" aria-label="Copiar imagen" title="Copiar imagen" onClick={() => { void copyImage() }}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></svg></button>
        <a href={preview} download={file.name} aria-label="Descargar imagen" title="Descargar imagen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg></a>
        {canShareFile && <button type="button" aria-label="Compartir imagen" title="Compartir imagen" onClick={() => { void nativeShare() }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 12v9h14v-9" /></svg></button>}
      </div>}
      {!loading && !file && <button type="button" onClick={() => { void prepare() }}>Reintentar</button>}
      <p className="share-feedback" role="status">{message}</p>
    </dialog>
  </div>
}
