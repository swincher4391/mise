import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'
import type { ScaledIngredient } from '@application/scaler/scaleIngredients.ts'
import { useWakeLock } from '@presentation/hooks/useWakeLock.ts'
import { useCookingTimers } from '@presentation/hooks/useCookingTimers.ts'
import { CookingStepView } from './CookingStepView.tsx'
import { CookingIngredientSidebar } from './CookingIngredientSidebar.tsx'
import { CookingTimerBar } from './CookingTimerBar.tsx'

interface CookingModeProps {
  recipe: Recipe | SavedRecipe
  scaledIngredients: ScaledIngredient[]
  onExit: () => void
}

export function CookingMode({ recipe, scaledIngredients, onExit }: CookingModeProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())
  const [showSidebar, setShowSidebar] = useState(false)

  // Filter out section headers from navigable steps
  const navigableSteps = useMemo(
    () => recipe.steps.filter((s) => !s.text.match(/^\[.*\]$/)),
    [recipe.steps],
  )

  const wakeLock = useWakeLock()
  const {
    timersForStep,
    activeTimers,
    startTimer,
    pauseTimer,
    resumeTimer,
    dismissTimer,
  } = useCookingTimers(navigableSteps)

  // Request wake lock on mount
  useEffect(() => {
    wakeLock.request()
    return () => {
      wakeLock.release()
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentStep = navigableSteps[currentStepIndex]
  const hasPrev = currentStepIndex > 0
  const hasNext = currentStepIndex < navigableSteps.length - 1

  const goNext = useCallback(() => {
    if (currentStepIndex < navigableSteps.length - 1) {
      setCurrentStepIndex((i) => i + 1)
    }
  }, [currentStepIndex, navigableSteps.length])

  const goPrev = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1)
    }
  }, [currentStepIndex])

  const toggleSidebar = useCallback(() => {
    setShowSidebar((s) => !s)
  }, [])

  const toggleIngredient = useCallback((id: string) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when focus is on input or button (except for Escape)
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          ;(e.target as HTMLElement).blur()
        }
        return
      }

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'Escape':
          e.preventDefault()
          onExit()
          break
        case 'i':
        case 'I':
          e.preventDefault()
          toggleSidebar()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, onExit, toggleSidebar])

  if (!currentStep) return null

  const progress = ((currentStepIndex + 1) / navigableSteps.length) * 100

  return (
    <div className="cooking-mode">
      <header className="cooking-header">
        <button className="cooking-exit-btn" onClick={onExit} aria-label="Exit cooking mode">
          &times; Exit
        </button>
        <div className="cooking-progress-wrapper">
          <div className="cooking-progress" style={{ width: `${progress}%` }} />
        </div>
        <button
          className="cooking-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label="Toggle ingredients"
        >
          Ingredients
        </button>
      </header>

      {!wakeLock.isSupported && (
        <div className="wakelock-fallback">
          Your browser does not support keeping the screen on. Please adjust your device display settings to prevent screen timeout while cooking.
        </div>
      )}

      <main className="cooking-main">
        <CookingStepView
          step={currentStep}
          stepNumber={currentStepIndex + 1}
          totalSteps={navigableSteps.length}
          timers={timersForStep(currentStep.id)}
          onStartTimer={startTimer}
          onPauseTimer={pauseTimer}
          onResumeTimer={resumeTimer}
          onNext={goNext}
          onPrev={goPrev}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      </main>

      {showSidebar && (
        <CookingIngredientSidebar
          ingredients={scaledIngredients}
          checkedIds={checkedIngredients}
          onToggle={toggleIngredient}
          onClose={() => setShowSidebar(false)}
        />
      )}

      <CookingTimerBar
        timers={activeTimers}
        onPause={pauseTimer}
        onResume={resumeTimer}
        onDismiss={dismissTimer}
      />
    </div>
  )
}
