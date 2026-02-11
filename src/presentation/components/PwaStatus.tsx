import { usePwaRegistration } from '@presentation/hooks/usePwaRegistration.ts'

export function PwaStatus() {
  const { needRefresh, offlineReady, updateServiceWorker } = usePwaRegistration()

  if (needRefresh) {
    return (
      <div className="pwa-status pwa-update">
        <span>New version available!</span>
        <button onClick={updateServiceWorker}>Update</button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="pwa-status pwa-offline-ready">
        App ready for offline use
      </div>
    )
  }

  return null
}
