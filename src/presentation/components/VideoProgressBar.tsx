import { useState, useEffect } from 'react'

const PHASES = [
  { at: 0, label: 'Opening video…', pct: 5 },
  { at: 3, label: 'Loading video player…', pct: 12 },
  { at: 8, label: 'Recording video…', pct: 20 },
  { at: 20, label: 'Still recording…', pct: 35 },
  { at: 30, label: 'Transcribing audio…', pct: 50 },
  { at: 35, label: 'Reading video frames…', pct: 60 },
  { at: 40, label: 'Extracting recipe text…', pct: 72 },
  { at: 48, label: 'Structuring recipe…', pct: 85 },
  { at: 55, label: 'Almost done…', pct: 92 },
]

export function VideoProgressBar() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Find the current phase based on elapsed seconds
  let current = PHASES[0]
  for (const phase of PHASES) {
    if (elapsed >= phase.at) current = phase
  }

  return (
    <>
      <div className="extraction-status-bar">
        <div
          className="extraction-status-bar-fill"
          style={{
            width: `${current.pct}%`,
            transition: 'width 1.5s ease-out',
          }}
        />
      </div>
      <p className="extraction-status-message">
        {current.label}
        <span className="extraction-status-step"> {elapsed}s</span>
      </p>
    </>
  )
}
