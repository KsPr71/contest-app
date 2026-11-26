import type { Entry } from '../types/photo'

export function contestPageUrl() {
  const url = new URL(import.meta.env.VITE_PUBLIC_SITE_URL || import.meta.env.BASE_URL, window.location.origin)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL inválida')
  return url.href
}
export function shareCaption(name: string) {
  return `Vota por ${name} en el concurso Recuerdos de Navidad en La Fotería`
}
function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && context.measureText(`${line} ${word}`).width > maxWidth) { lines.push(line); line = '' }
    for (const character of (line ? ` ${word}` : word)) {
      if (context.measureText(line + character).width > maxWidth) { lines.push(line); line = '' }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines
}
export async function createShareImage(photo: Entry, pageUrl: string): Promise<File> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  // Reuse the gallery thumbnail and its device cache instead of the full image.
  image.src = photo.src
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo preparar la imagen.')
  context.fillStyle = '#f7f8f4'
  context.fillRect(0, 0, 1080, 1350)
  context.fillStyle = '#304b39'
  context.font = '700 30px system-ui, sans-serif'
  context.fillText('LA FOTERÍA · RECUERDOS DE NAVIDAD', 48, 62)
  const scale = Math.min(984 / image.naturalWidth, 800 / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.fillStyle = '#e8ecdf'
  context.fillRect(48, 100, 984, 800)
  context.drawImage(image, 48 + (984 - width) / 2, 100 + (800 - height) / 2, width, height)
  let fontSize = 44
  context.font = `600 ${fontSize}px system-ui, sans-serif`
  let lines = wrapText(context, shareCaption(photo.title), 984)
  while (lines.length * fontSize * 1.3 > 280 && fontSize > 24) {
    fontSize -= 2
    context.font = `600 ${fontSize}px system-ui, sans-serif`
    lines = wrapText(context, shareCaption(photo.title), 984)
  }
  context.fillStyle = '#283b30'
  lines.forEach((line, index) => context.fillText(line, 48, 964 + index * fontSize * 1.3))
  context.fillStyle = '#52694a'
  context.fillRect(48, 1250, 984, 2)
  context.font = '26px system-ui, sans-serif'
  context.fillText(pageUrl, 48, 1304, 984)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo generar la imagen.')), 'image/png'))
  return new File([blob], `recuerdos-navidad-${photo.id}.png`, { type: 'image/png' })
}
