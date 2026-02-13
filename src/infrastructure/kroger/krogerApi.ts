export interface KrogerLocation {
  locationId: string
  name: string
  address: {
    line1: string
    city: string
    state: string
    zipCode: string
  }
}

export interface KrogerProduct {
  productId: string
  upc: string
  name: string
  brand: string
  imageUrl: string | null
  price: number | null
  promoPrice: number | null
  size: string | null
  inStock: boolean
}

export async function searchLocations(zipCode: string): Promise<KrogerLocation[]> {
  const res = await fetch(`/api/grocery/kroger-locations?zipCode=${encodeURIComponent(zipCode)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.locations
}

export async function searchProducts(term: string, locationId: string): Promise<KrogerProduct[]> {
  const res = await fetch(`/api/grocery/kroger-search?term=${encodeURIComponent(term)}&locationId=${encodeURIComponent(locationId)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.products
}

export async function addToCart(accessToken: string, items: { upc: string; quantity: number }[]): Promise<void> {
  const res = await fetch('/api/grocery/kroger-cart', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, items }),
  })
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
}

export function getAuthorizeUrl(): string {
  return '/api/grocery/kroger-authorize'
}
