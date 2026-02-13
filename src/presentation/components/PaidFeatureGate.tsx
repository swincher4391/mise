import { useState, type ReactNode } from 'react'
import { UpgradePrompt } from './UpgradePrompt.tsx'

interface PaidFeatureGateProps {
  isPaid: boolean
  feature: string
  onUpgrade: () => void
  onRestore: (email: string, pin?: string) => Promise<{ paid: boolean, needsPin?: boolean }>
  children: ReactNode
}

/**
 * Wraps a paid feature action. If the user is on the free tier,
 * intercepts clicks and shows the upgrade prompt instead.
 */
export function PaidFeatureGate({ isPaid, feature, onUpgrade, onRestore, children }: PaidFeatureGateProps) {
  const [showPrompt, setShowPrompt] = useState(false)

  if (isPaid) {
    return <>{children}</>
  }

  return (
    <>
      <div className="paid-gate-wrapper" onClick={() => setShowPrompt(true)}>
        {children}
        <span className="paid-gate-lock" aria-label="Paid feature">&#x1F512;</span>
      </div>
      {showPrompt && (
        <UpgradePrompt
          feature={feature}
          onUpgrade={onUpgrade}
          onRestore={onRestore}
          onClose={() => setShowPrompt(false)}
        />
      )}
    </>
  )
}
