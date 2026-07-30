import { formatMs } from '../lib/game'

export default function TimerRing({ remaining, windowMs }:
  { remaining: number; windowMs: number }) {
  const fraction = Math.max(0, Math.min(1, remaining / windowMs))
  return (
    <div className="timer-ring" role="timer">
      <svg viewBox="0 0 80 80">
        <circle className="ring-bg" cx="40" cy="40" r="34" />
        <circle
          className="ring-fg"
          cx="40" cy="40" r="34"
          strokeDasharray={2 * Math.PI * 34}
          strokeDashoffset={2 * Math.PI * 34 * (1 - fraction)}
        />
      </svg>
      <span className="ring-label">{formatMs(remaining)}</span>
    </div>
  )
}
