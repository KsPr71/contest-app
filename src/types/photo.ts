import type { Photo } from 'react-photo-album'

export type Entry = Photo & {
  id: string
  title: string
  category: string
  description: string
  publishedAt: string
  fullSrc: string
  fullWidth: number
  fullHeight: number
  thumbnailBytes?: number
  fullBytes?: number
}
