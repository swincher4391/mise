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

function createAudioBeep(audioCtx: AudioContext) {
  const now = audioCtx.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start(now + i * 0.6)
    osc.stop(now + i * 0.6 + 0.5)
  }
}

export function useCookingTimers(steps: Step[]): UseCookingTimersResult {
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
              // Timer just finished — beep
              if (audioCtxRef.current) {
                createAudioBeep(audioCtxRef.current)
              }
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
