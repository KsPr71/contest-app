/** Install before rendering photos so the first visit can populate device storage. */
export async function registerImageCache() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  try {
    const storageOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin
    const script = `${import.meta.env.BASE_URL}image-cache.js?storage=${encodeURIComponent(storageOrigin)}`
    await navigator.serviceWorker.register(script, { updateViaCache: 'none' })
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', done); resolve() }
        const timeout = window.setTimeout(done, 2000)
        navigator.serviceWorker.addEventListener('controllerchange', done, { once: true })
        if (navigator.serviceWorker.controller) done()
      })
    }
  } catch {
    // Caching is optional; browser HTTP caching remains available.
  }
}
