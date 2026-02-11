import type { TimerState } from '@presentation/hooks/useCookingTimers.ts'

interface CookingTimerBarProps {
  timers: TimerState[]
  onPause: (timerId: string) => void
  onResume: (timerId: string) => void
  onDismiss: (timerId: string) => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function CookingTimerBar({ timers, onPause, onResume, onDismiss }: CookingTimerBarProps) {
  if (timers.length === 0) return null

  return (
    <div className="cooking-timer-bar" role="status" aria-label="Active timers">
      {timers.map((timer) => (
        <div
          key={timer.id}
          className={`cooking-timer-chip ${timer.status === 'finished' ? 'cooking-timer-finished' : ''}`}
        >
          <span className="timer-chip-label">{timer.label}</span>
          <span className="timer-chip-time">{formatTime(timer.remainingSeconds)}</span>
          {timer.status === 'running' && (
            <button
              className="timer-chip-btn"
              onClick={() => onPause(timer.id)}
              aria-label={`Pause ${timer.label} timer`}
            >
              Pause
            </button>
          )}
          {timer.status === 'paused' && (
            <button
              className="timer-chip-btn"
              onClick={() => onResume(timer.id)}
              aria-label={`Resume ${timer.label} timer`}
            >
              Resume
            </button>
          )}
          {timer.status === 'finished' && (
            <button
              className="timer-chip-btn"
              onClick={() => onDismiss(timer.id)}
              aria-label={`Dismiss ${timer.label} timer`}
            >
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
