import { useState, useRef, useCallback, useEffect } from 'react'
import type { Step } from '@domain/models/Step.ts'
import { parseStepTimers } from '@application/parser/parseStepTimers.ts'

export interface TimerState {
  id: string
  stepId: string
  label: string
  totalSeconds: number
  remainingSeconds: number
  startedAt: number | null
  status: 'idle' | 'running' | 'paused' | 'finished'
}

export interface UseCookingTimersResult {
  timers: TimerState[]
  timersForStep: (stepId: string) => TimerState[]
  activeTimers: TimerState[]
  startTimer: (timerId: string) => void
  pauseTimer: (timerId: string) => void
  resumeTimer: (timerId: string) => void
  dismissTimer: (timerId: string) => void
}

function createTimerAlarm(audioCtx: AudioContext) {
  const now = audioCtx.currentTime
  // Two-tone ding (C6 → G5), repeated 3 times for a clear kitchen-timer sound
  for (let i = 0; i < 3; i++) {
    const offset = i * 0.8

    // High tone (C6)
    const oscHigh = audioCtx.createOscillator()
    const gainHigh = audioCtx.createGain()
    oscHigh.connect(gainHigh)
    gainHigh.connect(audioCtx.destination)
    oscHigh.frequency.value = 1047
    gainHigh.gain.setValueAtTime(0.5, now + offset)
    gainHigh.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.3)
    oscHigh.start(now + offset)
    oscHigh.stop(now + offset + 0.3)

    // Low tone (G5)
    const oscLow = audioCtx.createOscillator()
    const gainLow = audioCtx.createGain()
    oscLow.connect(gainLow)
    gainLow.connect(audioCtx.destination)
    oscLow.frequency.value = 784
    gainLow.gain.setValueAtTime(0.5, now + offset + 0.3)
    gainLow.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.7)
    oscLow.start(now + offset + 0.3)
    oscLow.stop(now + offset + 0.7)
  }
}

export function useCookingTimers(
  steps: Step[],
  onTimerFinished?: (label: string) => void,
): UseCookingTimersResult {
  const [timers, setTimers] = useState<TimerState[]>(() => {
    const result: TimerState[] = []
    for (const step of steps) {
      const parsed = parseStepTimers(step.text)
      parsed.forEach((timer, idx) => {
        result.push({
          id: `timer_${step.id}_${idx}`,
          stepId: step.id,
          label: timer.label,
          totalSeconds: timer.seconds,
          remainingSeconds: timer.seconds,
          startedAt: null,
          status: 'idle',
        })
      })
    }
    return result
  })

  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Tick: update all running timers
  useEffect(() => {
    const hasRunning = timers.some((t) => t.status === 'running')
    if (!hasRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setTimers((prev) =>
          prev.map((t) => {
            if (t.status !== 'running' || t.startedAt === null) return t
            const elapsed = Math.floor((Date.now() - t.startedAt) / 1000)
            const remaining = Math.max(0, t.totalSeconds - elapsed)

            if (remaining === 0 && t.remainingSeconds > 0) {
              // Timer just finished — ding alarm
              if (audioCtxRef.current) {
                createTimerAlarm(audioCtxRef.current)
              }
              onTimerFinished?.(t.label)
              return { ...t, remainingSeconds: 0, status: 'finished' as const }
            }

            return { ...t, remainingSeconds: remaining }
          }),
        )
      }, 1000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [timers])

  const startTimer = useCallback((timerId: string) => {
    // Initialize AudioContext on first user-initiated start
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }

    setTimers((prev) =>
      prev.map((t) =>
        t.id === timerId
          ? { ...t, status: 'running' as const, startedAt: Date.now() }
          : t,
      ),
    )
  }, [])

  const pauseTimer = useCallback((timerId: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== timerId || t.status !== 'running') return t
        const elapsed = t.startedAt ? Math.floor((Date.now() - t.startedAt) / 1000) : 0
        const remaining = Math.max(0, t.totalSeconds - elapsed)
        return {
          ...t,
          status: 'paused' as const,
          remainingSeconds: remaining,
          startedAt: null,
        }
      }),
    )
  }, [])

  const resumeTimer = useCallback((timerId: string) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }

    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== timerId || t.status !== 'paused') return t
        // Adjust startedAt so remaining time is preserved
        const newStartedAt = Date.now() - (t.totalSeconds - t.remainingSeconds) * 1000
        return {
          ...t,
          status: 'running' as const,
          startedAt: newStartedAt,
        }
      }),
    )
  }, [])

  const dismissTimer = useCallback((timerId: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === timerId
          ? {
              ...t,
              status: 'idle' as const,
              remainingSeconds: t.totalSeconds,
              startedAt: null,
            }
          : t,
      ),
    )
  }, [])

  const timersForStep = useCallback(
    (stepId: string) => timers.filter((t) => t.stepId === stepId),
    [timers],
  )

  const activeTimers = timers.filter(
    (t) => t.status === 'running' || t.status === 'paused' || t.status === 'finished',
  )

  return {
    timers,
    timersForStep,
    activeTimers,
    startTimer,
    pauseTimer,
    resumeTimer,
    dismissTimer,
  }
}
