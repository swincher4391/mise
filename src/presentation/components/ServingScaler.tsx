interface ServingScalerProps {
  currentServings: number
  onChange: (servings: number) => void
}

export function ServingScaler({ currentServings, onChange }: ServingScalerProps) {
  return (
    <div className="serving-scaler">
      <span className="serving-label">Servings</span>
      <button
        className="serving-btn"
        onClick={() => onChange(Math.max(1, currentServings - 1))}
        disabled={currentServings <= 1}
        aria-label="Decrease servings"
      >
        −
      </button>
      <span className="serving-count">{currentServings}</span>
      <button
        className="serving-btn"
        onClick={() => onChange(currentServings + 1)}
        aria-label="Increase servings"
      >
        +
      </button>
    </div>
  )
}
