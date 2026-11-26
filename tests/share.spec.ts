import { test, expect } from '@playwright/test'

test('sharing uses the cached thumbnail offline without downloading the full image', async ({ page }) => {
  const fullDownloads: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('-full.webp')) fullDownloads.push(request.url())
  })
  await page.goto('/?demo=1')
  const card = page.getByRole('article').first()
  await expect(card.locator('.loading-image')).toHaveClass(/is-ready/)
  await page.context().setOffline(true)
  await card.getByRole('button', { name: /^Compartir / }).click()
  const dialog = page.locator('.share-dialog:modal')
  const preview = dialog.locator('.share-image-preview')
  await expect(preview).toBeVisible()
  const dimensions = await preview.evaluate(async (element: HTMLImageElement) => {
    await element.decode()
    return [element.naturalWidth, element.naturalHeight]
  })
  expect(dimensions).toEqual([1080, 1350])
  await expect(preview).toHaveAttribute('alt', /Vota por .* en el concurso Recuerdos de Navidad/)
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('link', { name: 'Descargar imagen' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^recuerdos-navidad-.*\.png$/)
  expect(fullDownloads).toHaveLength(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.context().setOffline(false)
})
