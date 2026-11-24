import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('downloaded photo variants persist and can be displayed offline without caching live data', async ({ page, context }) => {
  await page.route('**/rest/v1/photos?*', route => route.fulfill({ json: [] }))
  await page.goto('/?demo=1')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const open = page.getByRole('button', { name: 'Ampliar Líneas que cuentan' })
  await open.click()
  await page.getByRole('dialog').locator('img').evaluate(image => (image as HTMLImageElement).decode())
  await page.keyboard.press('Escape')
  const cached = () => page.evaluate(async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('enfoque-images-'))
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(key => key.url)))).flat()
  })
  await expect.poll(cached).toEqual(expect.arrayContaining([
    'http://127.0.0.1:5173/photos/city-thumb.webp',
    'http://127.0.0.1:5173/photos/city-full.webp',
  ]))
  const origin = await page.evaluate(() => new URL(navigator.serviceWorker.controller!.scriptURL).searchParams.get('storage'))
  const remote = `${origin}/storage/v1/object/public/concurso-fotos/ce000000-0000-4000-8000-000000000001/thumb.webp`
  let downloads = 0
  await context.route(remote, async route => {
    downloads++
    await route.fulfill({ contentType: 'image/webp', headers: { 'Access-Control-Allow-Origin': '*' }, body: readFileSync('public/photos/city-thumb.webp') })
  })
  const loadRemote = () => page.evaluate(async url => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = url
    await image.decode()
  }, remote)
  await loadRemote()
  await expect.poll(cached).toContain(remote)
  await page.reload()
  await expect(page.getByRole('article')).toHaveCount(4)
  // Disable normal HTTP caching so success must come from persistent SW storage.
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.setCacheDisabled', { cacheDisabled: true })
  await context.setOffline(true)
  const offlineRemote = page.waitForResponse(response => response.url() === remote && response.fromServiceWorker())
  await loadRemote()
  await offlineRemote
  expect(downloads).toBe(1)
  const offlineFull = page.waitForResponse(response => response.url().endsWith('/photos/city-full.webp') && response.fromServiceWorker())
  await open.click()
  await offlineFull
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').locator('img').evaluate(async image => {
    await (image as HTMLImageElement).decode()
    if (!(image as HTMLImageElement).naturalWidth) throw new Error('Cached full image did not decode')
  })
  const urls = await cached()
  expect(urls.every(url => url === remote || /\/photos\/.+-(thumb|full)\.webp$/.test(url))).toBe(true)
  expect(urls.some(url => /votes|auth|vote_totals/.test(url))).toBe(false)
  await context.setOffline(false)
})
