import type { Step } from '@domain/models/Step.ts'
import type { TimerState } from '@presentation/hooks/useCookingTimers.ts'

interface CookingStepViewProps {
  step: Step
  stepNumber: number
  totalSteps: number
  timers: TimerState[]
  onStartTimer: (timerId: string) => void
  onPauseTimer: (timerId: string) => void
  onResumeTimer: (timerId: string) => void
  onNext: () => void
  onPrev: () => void
  hasPrev: boolean
  hasNext: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimerLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h} hr`)
  if (m > 0) parts.push(`${m} min`)
  if (s > 0 && h === 0) parts.push(`${s} sec`)
  return parts.join(' ')
}

export function CookingStepView({
  step,
  stepNumber,
  totalSteps,
  timers,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onNext,
  onPrev,
  hasPrev,
  hasNext,
}: CookingStepViewProps) {
  return (
    <div className="cooking-step">
      <div className="cooking-step-number">
        Step {stepNumber} of {totalSteps}
      </div>
      <div className="cooking-step-text" aria-live="polite">
        {step.text}
      </div>

      {timers.length > 0 && (
        <div className="cooking-step-timers">
          {timers.map((timer) => (
            <div key={timer.id} className="cooking-step-timer">
              {timer.status === 'idle' && (
                <button
                  className="cooking-timer-btn"
                  onClick={() => onStartTimer(timer.id)}
                >
                  Start Timer ({formatTimerLabel(timer.totalSeconds)})
                </button>
              )}
              {timer.status === 'running' && (
                <button
                  className="cooking-timer-btn running"
                  onClick={() => onPauseTimer(timer.id)}
                >
                  {formatTime(timer.remainingSeconds)} — Tap to Pause
                </button>
              )}
              {timer.status === 'paused' && (
                <button
                  className="cooking-timer-btn paused"
                  onClick={() => onResumeTimer(timer.id)}
                >
                  {formatTime(timer.remainingSeconds)} — Paused (Tap to Resume)
                </button>
              )}
              {timer.status === 'finished' && (
                <div className="cooking-timer-btn finished">
                  Timer Done!
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="cooking-nav">
        <button
          className="cooking-nav-btn"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous step"
        >
          Previous
        </button>
        <button
          className="cooking-nav-btn"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next step"
        >
          Next
        </button>
      </div>
    </div>
  )
}
