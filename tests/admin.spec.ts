import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const id = 'cd100000-0000-4000-8000-000000000020'
const user = { id, aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() }
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.test`

test('admin is separate, saves dates and retries optimized uploads without changing their UUID', async ({ page }) => {
  let row: Record<string, unknown> | null = null
  let settings = { voting_starts_at: null as string | null, voting_ends_at: null as string | null }
  const uploads: { path: string; bytes: number }[] = []
  let fullFailed = false
  await page.route('**/auth/v1/token?*', route => route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh', user } }))
  await page.route('**/rest/v1/admins?*', route => route.fulfill({ json: { user_id: id } }))
  await page.route('**/rest/v1/contest_settings?*', async route => {
    if (route.request().method() === 'PATCH') { settings = route.request().postDataJSON(); await route.fulfill({ json: [{ id: true }] }) }
    else await route.fulfill({ json: settings })
  })
  await page.route('**/rest/v1/photos?*', async route => {
    if (route.request().method() === 'PATCH') { row = { ...row, ...route.request().postDataJSON() }; await route.fulfill({ json: { id: row!.id } }); return }
    if (route.request().method() === 'DELETE') { const previous = row; row = null; await route.fulfill({ json: { id: previous!.id } }); return }
    if (route.request().method() === 'POST') { row = route.request().postDataJSON(); await route.fulfill({ json: { id: row!.id } }); return }
    const single = route.request().headers().accept?.includes('vnd.pgrst.object')
    if (single) await route.fulfill({ status: row ? 200 : 406, json: row ? { id: row.id } : { code: 'PGRST116', details: 'The result contains 0 rows', message: 'No rows' } })
    else if (new URL(route.request().url()).searchParams.has('id')) await route.fulfill({ json: row ? [{ id: row.id }] : [] })
    else await route.fulfill({ json: row ? [row] : [] })
  })
  await page.route('**/storage/v1/object/concurso-fotos/**', async route => {
    const path = new URL(route.request().url()).pathname
    const body = route.request().postDataBuffer()!
    const webp = body.indexOf('RIFF')
    expect(webp).toBeGreaterThanOrEqual(0)
    uploads.push({ path, bytes: body.readUInt32LE(webp + 4) + 8 })
    if (path.endsWith('/full.webp') && !fullFailed) { fullFailed = true; await route.fulfill({ status: 500, json: { statusCode: '500', message: 'Temporary upload failure' } }); return }
    await route.fulfill({ json: { Key: path } })
  })
  await page.route('**/storage/v1/object/concurso-fotos', route => route.fulfill({ json: [] }))
  await page.context().route('**/storage/v1/object/public/concurso-fotos/**', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'image/webp', body: readFileSync('public/photos/city-thumb.webp') }))
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Acceso del administrador' })).toBeVisible()
  await page.getByLabel('Correo electrónico').fill('admin@example.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Subir fotografía' })).toBeVisible()
  await page.getByLabel('Inicio de votaciones').fill('2026-12-01T09:00')
  await page.getByLabel('Fin de votaciones').fill('2026-12-31T18:00')
  await page.getByRole('button', { name: 'Guardar período' }).click()
  await expect(page.getByText('Período de votación guardado.')).toBeVisible()
  expect(Date.parse(settings.voting_ends_at!)).toBeGreaterThan(Date.parse(settings.voting_starts_at!))
  await page.getByLabel('Fotografía', { exact: true }).setInputFiles('public/photos/city.jpg')
  await expect(page.getByText('Imagen preparada.', { exact: false })).toBeVisible()
  await page.getByLabel('Nombre de la fotografía').fill('Prueba de Navidad')
  await page.getByLabel('Texto breve', { exact: true }).fill('Una fotografía optimizada para el concurso.')
  await page.getByRole('button', { name: 'Guardar fotografía', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Reintentar envío' })).toBeEnabled()
  await page.getByRole('button', { name: 'Reintentar envío' }).click()
  await expect(page.getByText('Fotografía guardada correctamente.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prueba de Navidad' })).toBeVisible()
  await page.getByRole('img', { name: 'Prueba de Navidad' }).evaluate(element => (element as HTMLImageElement).decode())
  expect(uploads.filter(upload => upload.path.endsWith('/thumb.webp'))).toHaveLength(1)
  expect(uploads.filter(upload => upload.path.endsWith('/full.webp'))).toHaveLength(2)
  expect(new Set(uploads.map(upload => upload.path.split('/').slice(0, -1).join('/'))).size).toBe(1)
  expect(uploads[0].bytes).toBeLessThanOrEqual(20_000)
  expect(uploads[1].bytes).toBeLessThanOrEqual(500 * 1024)
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Editar fotografía' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Nombre actualizado')
  await page.getByRole('button', { name: 'Guardar detalles' }).click()
  await expect(page.getByRole('heading', { name: 'Nombre actualizado' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const stored = await page.evaluate(() => Object.keys(localStorage))
  expect(stored).toContain('enfoque-admin-session')
  expect(stored.some(key => key.startsWith('sb-') && key.endsWith('-auth-token'))).toBe(false)
  await page.screenshot({ path: 'supabase/.temp/admin-mobile.png', fullPage: true })
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByText('Fotografía y archivos eliminados.')).toBeVisible()
  await expect(page.getByText('No hay fotografías cargadas.')).toBeVisible()
})

test('public voting opens and closes automatically without downloading images again', async ({ page }) => {
  let images = 0
  await page.route('**/rest/v1/photos?*', route => route.fulfill({ json: [{ id, name: 'Foto programada', description: 'Descripción', published_at: '2026-01-01T00:00:00Z', thumbnail_path: `${id}/thumb.webp`, image_path: `${id}/full.webp`, thumbnail_width: 400, thumbnail_height: 300, image_width: 1000, image_height: 750 }] }))
  await page.route('**/rest/v1/vote_totals?*', route => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/get_voting_period', route => {
    const now = Date.now()
    return route.fulfill({ json: { server_now: new Date(now).toISOString(), voting_starts_at: new Date(now + 2500).toISOString(), voting_ends_at: new Date(now + 6000).toISOString() } })
  })
  await page.route('**/storage/v1/object/public/concurso-fotos/**', route => { images++; return route.fulfill({ contentType: 'image/webp', body: readFileSync('public/photos/city-thumb.webp') }) })
  await page.goto('/')
  const radio = page.getByRole('radio').first()
  await expect(radio).toBeDisabled()
  await expect(radio).toBeEnabled()
  const downloaded = images
  await expect(radio).toBeDisabled()
  await expect(page.getByText('Votación finalizada', { exact: false }).first()).toBeVisible()
  expect(images).toBe(downloaded)
})

test('a non-admin account cannot see the administration forms', async ({ page }) => {
  await page.route('**/auth/v1/token?*', route => route.fulfill({ json: { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh', user } }))
  await page.route('**/rest/v1/admins?*', route => route.fulfill({ json: null }))
  await page.goto('/admin')
  await page.getByLabel('Correo electrónico').fill('someone@example.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Esta cuenta no tiene permisos de administración.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Subir fotografía' })).toHaveCount(0)
})
