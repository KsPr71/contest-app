import { useState, type CSSProperties } from 'react'
import './SlotCounter.css'

type SlotCounterProps = {
  /** Valor a mostrar (entero >= 0). */
  value: number
  /** Número mínimo de rodillos; se rellena con ceros a la izquierda. */
  minDigits?: number
  /** Duración base del giro en ms. */
  duration?: number
  /** Retardo extra por rodillo (de izquierda a derecha), en ms. */
  stagger?: number
  /** Vueltas completas extra que da cada rodillo al cambiar. */
  spins?: number
  /** Tamaño de fuente de los dígitos (cualquier unidad CSS). */
  size?: string
  className?: string
}

export function SlotCounter({
  value,
  minDigits = 1,
  duration = 900,
  stagger = 120,
  spins = 1,
  size = '3rem',
  className,
}: SlotCounterProps) {
  const safe = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  const digits = String(safe).padStart(minDigits, '0').split('').map(Number)
  const firstSignificantDigit = digits.findIndex(digit => digit !== 0)

  return (
    <div
      className={['slot-counter', className].filter(Boolean).join(' ')}
      style={{ '--slot-size': size } as CSSProperties}
      role="img"
      aria-label={String(safe)}
    >
      {digits.map((digit, i) => (
        <Reel
          // clave desde la derecha: las unidades siempre son el mismo rodillo
          key={digits.length - i}
          digit={digit}
          muted={firstSignificantDigit === -1 || i < firstSignificantDigit}
          spins={spins}
          duration={duration + i * stagger}
        />
      ))}
    </div>
  )
}

type ReelProps = { digit: number; spins: number; duration: number; muted: boolean }

function Reel({ digit, spins, duration, muted }: ReelProps) {
  // pos = índice dentro de la tira de dígitos; crece al girar y se
  // normaliza (pos % 10) sin transición al terminar la animación.
  const [state, setState] = useState({ digit, pos: digit, animate: false })

  if (state.digit !== digit) {
    const delta = (digit - (state.pos % 10) + 10) % 10
    setState({ digit, pos: state.pos + spins * 10 + delta, animate: true })
  }

  // Suficientes dígitos para encadenar dos giros aunque lleguen seguidos.
  const stripLength = 10 * (2 * spins + 3)

  return (
    <div className={`slot-reel${muted ? ' is-muted' : ''}`} aria-hidden="true">
      <div
        className="slot-strip"
        style={{
          transform: `translateY(calc(${-state.pos} * var(--slot-cell)))`,
          transition: state.animate ? `transform ${duration}ms var(--slot-ease)` : 'none',
        }}
        onTransitionEnd={() =>
          setState((s) => ({ ...s, pos: s.pos % 10, animate: false }))
        }
      >
        {Array.from({ length: stripLength }, (_, i) => (
          <span key={i} className="slot-digit">
            {i % 10}
          </span>
        ))}
      </div>
    </div>
  )
}

export default SlotCounter
