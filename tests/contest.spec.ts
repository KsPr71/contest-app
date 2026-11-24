import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { BrowserContext, Page } from '@playwright/test'

const fixtureId = 'cd100000-0000-4000-8000-000000000010'
test.skip(process.env.RUN_SUPABASE_E2E !== '1', 'Requires the temporary SQL fixture and a configured linked project.')

test('saved votes broadcast between sessions without reloading images', async ({ browser }) => {
  const contexts: BrowserContext[] = []
  const users: string[] = []
  const imageRequests: string[] = []
  const snapshots = [0, 0]
  try {
    const pages: Page[] = []
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext()
      contexts.push(context)
      const page = await context.newPage()
      page.on('request', request => { if (request.url().includes('/rest/v1/vote_totals')) snapshots[i]++ })
      // UI image requests are fulfilled locally; voting and Realtime use real Supabase.
      await page.route(`**/storage/v1/object/public/concurso-fotos/${fixtureId}/*`, async route => {
        const full = route.request().url().endsWith('/full.webp')
        imageRequests.push(route.request().url())
        await route.fulfill({ contentType: 'image/webp', body: readFileSync(`public/photos/mountain-${full ? 'full' : 'thumb'}.webp`) })
      })
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Realtime integration fixture' })).toBeVisible()
      await page.getByRole('button', { name: 'Activar resultados en vivo' }).click()
      await expect(page.getByText('En vivo · Los cambios se agrupan cada 10 segundos.')).toBeVisible()
      const userId = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
        return key ? JSON.parse(localStorage.getItem(key)!).user.id as string : ''
      })
      if (userId) users.push(userId)
      pages.push(page)
    }
    const card = (page: Page) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Realtime integration fixture' }) })
    expect(imageRequests.every(url => url.endsWith('thumb.webp'))).toBe(true)
    await Promise.all(pages.map(page => page.waitForLoadState('networkidle')))
    const observerSnapshots = snapshots[1]
    const before = imageRequests.length
    const baselineText = await card(pages[0]).locator('.photo-totals').innerText()
    const baseCount = Number(baselineText.match(/(\d+) votos/)?.[1] ?? 0)
    const baseSum = Number(baselineText.match(/(\d+) puntos/)?.[1] ?? 0)
    await card(pages[0]).getByRole('radio').nth(1).click()
    await expect(card(pages[0]).getByText('Voto guardado: 2 de 5', { exact: false })).toBeVisible()
    await expect(card(pages[1]).locator('.photo-totals')).toContainText(`${baseCount+1} votos \u00b7 ${baseSum+2} puntos`)
    await card(pages[0]).getByRole('radio').nth(4).click()
    await expect(card(pages[1]).locator('.photo-totals')).toContainText(`${baseCount+1} votos \u00b7 ${baseSum+5} puntos`)
    expect(snapshots[1]).toBe(observerSnapshots)
    await card(pages[1]).getByRole('radio').nth(2).click()
    await expect(card(pages[0]).locator('.photo-totals')).toContainText(`${baseCount+2} votos \u00b7 ${baseSum+8} puntos`)
    expect(imageRequests.length).toBe(before)
    await pages[0].reload()
    await expect(card(pages[0]).getByRole('radio').nth(4)).toBeChecked()
    await card(pages[0]).getByRole('button', { name: 'Ampliar Realtime integration fixture' }).click()
    await expect(pages[0].getByRole('dialog')).toBeVisible()
    await expect.poll(() => imageRequests.some(url => url.endsWith('full.webp'))).toBe(true)
    await pages[0].keyboard.press('Escape')
    await expect(pages[0].getByRole('dialog')).not.toBeVisible()
    // Real local optimizer: each input yields a thumbnail under the decimal 20 KB budget.
    await pages[0].getByRole('button', { name: 'Probar galería local' }).click()
    await pages[0].locator('input[type=file]').setInputFiles('public/photos/mountain.jpg')
    await expect(pages[0].getByRole('heading', { name: 'mountain', exact: true })).toBeVisible()
    const imageSize = await pages[0].locator('article').filter({ has: pages[0].getByRole('heading', { name: 'mountain', exact: true }) }).locator('img').evaluate(async image => {
      const blob = await fetch((image as HTMLImageElement).src).then(response => response.blob())
      return { bytes: blob.size, mime: blob.type }
    })
    expect(imageSize.mime).toBe('image/webp')
    expect(imageSize.bytes).toBeLessThanOrEqual(20000)
    await pages[0].setViewportSize({ width: 390, height: 844 })
    expect(await pages[0].evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  } finally {
    const previous = existsSync('supabase/.temp/test-users.json') ? JSON.parse(readFileSync('supabase/.temp/test-users.json','utf8')) : []
    writeFileSync('supabase/.temp/test-users.json', JSON.stringify([...new Set([...previous,...users])]))
    await Promise.all(contexts.map(context => context.close()))
  }
})
