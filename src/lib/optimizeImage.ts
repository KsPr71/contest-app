const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_PIXELS = 30_000_000
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
// Decimal KB: the entire encoded file must fit within 20,000 bytes.
export const THUMBNAIL_MAX_BYTES = 20_000

export type ImageVariant = { blob: Blob; width: number; height: number }
export type OptimizedImage = { thumbnail: ImageVariant; full: ImageVariant }

async function encode(source: ImageBitmap, maxSide: number, initialQuality: number, targetBytes: number): Promise<ImageVariant> {
  const ratio = Math.min(1, maxSide / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * ratio))
  canvas.height = Math.max(1, Math.round(source.height * ratio))
  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('El navegador no puede preparar las imágenes.')
    for (let attempt = 0; attempt < 16; attempt++) {
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      const quality = Math.max(0.45, initialQuality - Math.min(attempt, 3) * 0.1)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('No se pudo comprimir la imagen.')), 'image/webp', quality)
      })
      if (blob.type !== 'image/webp') throw new Error('Este navegador no admite exportar WebP.')
      if (blob.size <= targetBytes) return { blob, width: canvas.width, height: canvas.height }
      if (attempt === 15) {
        if (blob.size > MAX_OUTPUT_BYTES) throw new Error('La imagen optimizada supera los 2 MiB.')
        throw new Error('No se pudo alcanzar el peso objetivo. Prueba otra fotografía.')
      }
      if (attempt >= 3) {
        canvas.width = Math.max(1, Math.round(canvas.width * 0.8))
        canvas.height = Math.max(1, Math.round(canvas.height * 0.8))
      }
    }
    throw new Error('No se pudo optimizar la imagen.')
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}

/** Runs before any upload. Originals never need to be sent to Storage. */
export async function optimizeImage(file: File): Promise<OptimizedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Selecciona una imagen JPEG, PNG o WebP.')
  }
  if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error('El archivo debe pesar entre 1 byte y 15 MiB.')
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    if (!image.width || !image.height || image.width * image.height > MAX_PIXELS) {
      throw new Error('La imagen no debe superar los 30 megapíxeles.')
    }
    // Sequential encoding keeps peak memory lower on mobile devices.
    const thumbnail = await encode(image, 480, 0.75, THUMBNAIL_MAX_BYTES)
    const full = await encode(image, 1600, 0.82, 500 * 1024)
    return { thumbnail, full }
  } finally {
    image.close()
  }
}
