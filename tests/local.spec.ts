import { test, expect } from '@playwright/test'

test('local gallery loads only thumbnails, opens full images on demand and compresses uploads', async ({ page }) => {
  await page.route('**/rest/v1/photos?*', route => route.fulfill({ json: [] }))
  const downloads: string[] = []
  page.on('request', request => { if (request.resourceType() === 'image') downloads.push(request.url()) })
  await page.goto('/?demo=1')
  await page.locator('.gallery-options summary').click()
  await expect(page.getByRole('article')).toHaveCount(4)
  expect(downloads.some(url => url.endsWith('-full.webp'))).toBe(false)
  const open = page.getByRole('button', { name: 'Ampliar Líneas que cuentan' })
  await open.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => downloads.some(url => url.endsWith('city-full.webp'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(open).toBeFocused()
  await page.locator('input[type=file]').setInputFiles([
    'public/photos/city.jpg', 'public/photos/light.jpg', 'public/photos/mountain.jpg', 'public/photos/travel.jpg',
  ])
  await expect(page.getByText('4 imágenes optimizadas.', { exact: false })).toBeVisible()
  const images = page.getByRole('article').locator('img')
  await expect(images).toHaveCount(4)
  for (const image of await images.all()) {
    const result = await image.evaluate(async element => {
      const img = element as HTMLImageElement
      await img.decode()
      const blob = await fetch(img.src).then(response => response.blob())
      return { bytes: blob.size, type: blob.type, maxSide: Math.max(img.naturalWidth, img.naturalHeight) }
    })
    expect(result.type).toBe('image/webp')
    expect(result.bytes).toBeLessThanOrEqual(20000)
    expect(result.maxSide).toBeLessThanOrEqual(480)
  }
  for (const layout of ['rows', 'columns', 'masonry']) {
    await page.getByRole('combobox', { name: 'Distribución de la galería' }).selectOption(layout)
    await expect(page.getByRole('article')).toHaveCount(4)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'supabase/.temp/local-mobile.png', fullPage: true })
})
