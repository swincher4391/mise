import type { Step } from '@domain/models/Step.ts'

interface StepListProps {
  steps: Step[]
}

export function StepList({ steps }: StepListProps) {
  return (
    <section className="step-section">
      <h2>Instructions</h2>
      <ol className="step-list">
        {steps.map((step) => {
          // Section headers (bracketed text from HowToSection)
          if (step.text.startsWith('[') && step.text.endsWith(']')) {
            return (
              <li key={step.id} className="step-section-header">
                <strong>{step.text.slice(1, -1)}</strong>
              </li>
            )
          }
          return (
            <li key={step.id} className="step-item">
              {step.text}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
