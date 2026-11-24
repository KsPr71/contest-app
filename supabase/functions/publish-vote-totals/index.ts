// Service-to-service worker. Never expose WORKER_TOKEN to Vite or a browser.
Deno.serve(async (request: Request) => {
  const token = Deno.env.get('WORKER_TOKEN')
  if (!token || request.headers.get('x-worker-token') !== token) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return new Response('Worker configuration missing', { status: 503 })
  try {
    const response = await fetch(`${url}/rest/v1/rpc/publish_vote_totals`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      console.error('Totals transaction failed', response.status)
      return new Response('Pending changes retained for retry', { status: 502 })
    }
    return Response.json({ published: await response.json() })
  } catch {
    return new Response('Worker unavailable; pending changes retained', { status: 503 })
  }
})
