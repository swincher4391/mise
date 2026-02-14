import { useState } from 'react'

interface UpgradePromptProps {
  feature: string
  onUpgrade: () => void
  onRestore: (email: string, pin?: string) => Promise<{ paid: boolean, needsPin?: boolean }>
  onClose: () => void
}

export function UpgradePrompt({ feature, onUpgrade, onRestore, onClose }: UpgradePromptProps) {
  const [showRestore, setShowRestore] = useState(false)
  const [restoreEmail, setRestoreEmail] = useState('')
  const [restorePin, setRestorePin] = useState('')
  const [needsPin, setNeedsPin] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = restoreEmail.trim()
    if (!trimmed) return

    setRestoring(true)
    setRestoreError(null)
    const result = await onRestore(trimmed, needsPin ? restorePin.trim() : undefined)
    setRestoring(false)

    if (result.paid) {
      onClose()
    } else if (result.needsPin) {
      setNeedsPin(true)
    } else {
      setRestoreError(needsPin ? 'Invalid code.' : 'No purchase found for this email.')
    }
  }

  return (
    <div className="upgrade-overlay" onClick={onClose}>
      <div className="upgrade-prompt" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-close" onClick={onClose} aria-label="Close">&times;</button>

        <h2 className="upgrade-title">Unlock StorySkip</h2>
        <p className="upgrade-feature">{feature}</p>

        <div className="upgrade-details">
          <p className="upgrade-price">$4.99 &mdash; one time, forever</p>
          <ul className="upgrade-perks">
            <li>Unlimited recipes</li>
            <li>Photo import (single + batch)</li>
            <li>Import &amp; export</li>
            <li>No subscription. Ever.</li>
          </ul>
        </div>

        <button className="upgrade-buy-btn" onClick={onUpgrade}>
          Upgrade Now
        </button>

        {!showRestore ? (
          <button className="upgrade-restore-link" onClick={() => setShowRestore(true)}>
            Already purchased? Restore
          </button>
        ) : (
          <form className="upgrade-restore-form" onSubmit={handleRestore}>
            <input
              type="email"
              value={restoreEmail}
              onChange={(e) => { setRestoreEmail(e.target.value); setNeedsPin(false); setRestoreError(null) }}
              placeholder="Email used at checkout"
              required
              disabled={restoring || needsPin}
            />
            {needsPin && (
              <input
                type="text"
                value={restorePin}
                onChange={(e) => setRestorePin(e.target.value)}
                placeholder="Enter your access code"
                autoFocus
                disabled={restoring}
              />
            )}
            <button type="submit" disabled={restoring || !restoreEmail.trim() || (needsPin && !restorePin.trim())}>
              {restoring ? 'Checking...' : needsPin ? 'Verify' : 'Restore'}
            </button>
            {restoreError && <p className="upgrade-restore-error">{restoreError}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
