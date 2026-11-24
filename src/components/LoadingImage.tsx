import { useEffect, useRef, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import './LoadingImage.css'

type Props = ImgHTMLAttributes<HTMLImageElement> & { src: string }

function ImageContent({ alt = '', ...props }: Props) {
  const ref = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const image = ref.current
    if (image?.complete) setStatus(image.naturalWidth ? 'ready' : 'error')
  }, [])
  return <span className={`loading-image is-${status}`} aria-busy={status === 'loading'}>
    <img {...props} ref={ref} alt={alt} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />
    {status === 'loading' && <span className="image-skeleton" aria-hidden="true" />}
    {status === 'error' && <span className="image-fallback" role="status">No se pudo cargar la fotografía.</span>}
  </span>
}

export default function LoadingImage(props: Props) {
  return <ImageContent key={props.src} {...props} />
}
