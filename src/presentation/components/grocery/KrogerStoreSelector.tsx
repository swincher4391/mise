import { useState } from 'react'
import { searchLocations, type KrogerLocation } from '@infrastructure/kroger/krogerApi.ts'

interface KrogerStoreSelectorProps {
  onSelectStore: (store: { locationId: string; name: string; address: string }) => void
  onBack: () => void
}

export function KrogerStoreSelector({ onSelectStore, onBack }: KrogerStoreSelectorProps) {
  const [zipCode, setZipCode] = useState('')
  const [locations, setLocations] = useState<KrogerLocation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{5}$/.test(zipCode)) {
      setError('Enter a valid 5-digit zip code')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const results = await searchLocations(zipCode)
      setLocations(results)
      setSearched(true)
      if (results.length === 0) setError('No Kroger stores found near that zip code')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search stores')
    } finally {
      setLoading(false)
    }
  }

  const formatAddress = (loc: KrogerLocation) =>
    `${loc.address.line1}, ${loc.address.city}, ${loc.address.state} ${loc.address.zipCode}`

  return (
    <div className="kroger-store-selector">
      <div className="kroger-section-header">
        <button className="nav-btn" onClick={onBack}>&larr; Back to List</button>
        <h2 className="kroger-section-title">Select Your Kroger Store</h2>
      </div>

      <form className="kroger-zip-form" onSubmit={handleSearch}>
        <input
          type="text"
          className="kroger-zip-input"
          placeholder="Enter zip code"
          value={zipCode}
          onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          maxLength={5}
          inputMode="numeric"
        />
        <button
          type="submit"
          className="nav-btn grocery-nav-btn"
          disabled={loading || zipCode.length !== 5}
        >
          {loading ? 'Searching...' : 'Find Stores'}
        </button>
      </form>

      {error && <p className="kroger-error">{error}</p>}

      {searched && locations.length > 0 && (
        <div className="kroger-store-list">
          {locations.map((loc) => (
            <button
              key={loc.locationId}
              className="kroger-store-item"
              onClick={() => onSelectStore({
                locationId: loc.locationId,
                name: loc.name,
                address: formatAddress(loc),
              })}
            >
              <span className="kroger-store-name">{loc.name}</span>
              <span className="kroger-store-address">{formatAddress(loc)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
