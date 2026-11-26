import type { MouseEventHandler } from 'react'
import type { Entry } from '../types/photo'
import type { Totals } from '../lib/totals'
import SlotCounter from './SlotCounter'
import LoadingImage from './LoadingImage'
import SharePhoto from './SharePhoto'
import './PhotoCard.css'

type Props = {
  photo: Entry
  width: number
  height: number
  score?: number
  priority?: boolean
  totals?: Totals
  saving?: boolean
  votingClosed?: boolean
  voteMessage?: string
  local?: boolean
  onOpen?: MouseEventHandler<HTMLButtonElement>
  onVote: (id: string, score: number) => void
}

export default function PhotoCard({ photo, width, height, score, priority, totals, saving, votingClosed, voteMessage, local, onOpen, onVote }: Props) {
  const voteCount = local ? (score ? 1 : 0) : totals?.vote_count ?? 0
  return (
    <article className="photo-card" style={{ width }} aria-labelledby={`title-${photo.id}`}>
      <div className="photo-card-media">
      <button
        type="button"
        className="photo-card-open"
        onClick={onOpen}
        aria-label={`Ampliar ${photo.title}`}
        aria-haspopup="dialog"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <LoadingImage crossOrigin="anonymous" src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading={priority ? 'eager' : 'lazy'} decoding="async" />
        <span className="photo-card-category">{photo.category}</span>
        <span className="photo-card-expand" aria-hidden="true">↗</span>
      </button>
          <div className="photo-points" role="status" aria-label={`${local ? score ?? 0 : totals?.score_sum ?? 0} puntos`}>
            <SlotCounter value={local ? score ?? 0 : totals?.score_sum ?? 0} minDigits={6} size="1.25rem" duration={650} stagger={70} />
          </div>
      </div>
      <div className="photo-card-body">
        <div className="photo-card-meta">
          <div className="photo-card-heading">
            <div className="photo-card-heading-row"><h3 id={`title-${photo.id}`}>{photo.title}</h3><SharePhoto photo={photo} /></div>
            <p className="photo-card-description">{photo.description}</p>
          </div>

        </div>
        <fieldset className="photo-vote" disabled={saving || votingClosed} aria-describedby={`vote-status-${photo.id}`}>
          <legend><span className="photo-vote-heading"><span>Tu valoración</span><span className="photo-vote-count" role="status">{voteCount} {voteCount === 1 ? 'voto' : 'votos'}</span></span></legend>
          <div className="photo-vote-options">
            {[1, 2, 3, 4, 5].map(value => (
              <label key={value} className={score === value ? 'is-selected' : ''}>
                <input type="radio" name={`vote-${photo.id}`} value={value} checked={score === value} onChange={() => onVote(photo.id, value)} />
                <span>{value}<span className="vote-star" aria-hidden="true"> ★</span></span>
                <span className="sr-only">{value === 1 ? ' punto' : ' puntos'} para {photo.title}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p id={`vote-status-${photo.id}`} className="photo-vote-status" role="status">
          {voteMessage || (local ? (score ? `Valoración local: ${score} de 5 · Puedes cambiarla.` : 'Elige de 1 a 5 puntos · Prueba local.') : (score ? `Tu voto: ${score} de 5 · Puedes cambiarlo.` : 'Elige de 1 a 5 puntos.'))}
        </p>
      </div>
    </article>
  )
}
