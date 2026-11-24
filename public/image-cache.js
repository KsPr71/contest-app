/* Cache public immutable photo variants only. No HTML, API, votes or auth. */
const PREFIX = 'enfoque-images-'
const VERSION = 'v1'
const STORAGE_ORIGIN = new URL(self.location.href).searchParams.get('storage')
const LIMITS = {
  thumb: { cache: `${PREFIX}${VERSION}-thumb`, entries: 200, bytes: 20000 },
  full: { cache: `${PREFIX}${VERSION}-full`, entries: 24, bytes: 500 * 1024 },
}
let writes = Promise.resolve()

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const current = Object.values(LIMITS).map(value => value.cache)
    const names = await caches.keys()
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && !current.includes(name)).map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

function variant(request) {
  if (request.method !== 'GET' || request.destination !== 'image') return null
  const url = new URL(request.url)
  // Query strings (including signed URLs and cache-busters) are never stored.
  if (url.search) return null
  if (url.origin === self.location.origin) {
    return url.pathname.match(/\/photos\/[a-z0-9-]+-(thumb|full)\.webp$/)?.[1] ?? null
  }
  if (url.origin !== STORAGE_ORIGIN) return null
  return url.pathname.match(/^\/storage\/v1\/object\/public\/concurso-fotos\/[a-f0-9-]{36}\/(thumb|full)\.(?:webp|avif)$/)?.[1] ?? null
}

async function imageResponse(request, kind) {
  const limit = LIMITS[kind]
  let cache
  try {
    cache = await caches.open(limit.cache)
    const hit = await cache.match(request)
    if (hit) return hit // Cache first: no background revalidation or network request.
  } catch {
    return fetch(request) // Storage unavailable/private mode: normal browser loading.
  }
  const response = await fetch(request)
  if (!response.ok || !['basic', 'cors'].includes(response.type)) return response
  const mime = response.headers.get('Content-Type')?.split(';')[0]
  if (!['image/webp', 'image/avif'].includes(mime)) return response
  const length = Number(response.headers.get('Content-Length'))
  if (length > limit.bytes) return response
  const copy = response.clone()
  const stored = response.clone()
  writes = writes.catch(() => {}).then(async () => {
    const blob = await copy.blob()
    if (blob.size > limit.bytes) return
    try {
      await cache.put(request, stored)
      const keys = await cache.keys()
      for (const key of keys.slice(0, Math.max(0, keys.length - limit.entries))) await cache.delete(key)
    } catch {
      // Quota pressure must never break the gallery; discard our older variants.
      const keys = await cache.keys().catch(() => [])
      for (const key of keys.slice(0, Math.max(1, Math.ceil(keys.length / 4)))) await cache.delete(key).catch(() => {})
    }
  })
  return response
}

self.addEventListener('fetch', event => {
  const kind = variant(event.request)
  if (!kind) return
  const result = imageResponse(event.request, kind)
  event.respondWith(result)
  event.waitUntil(result.then(() => writes).catch(() => {}))
})
