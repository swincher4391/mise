import { useState, useEffect, useCallback } from 'react'
import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import { searchProducts, addToCart, type KrogerProduct } from '@infrastructure/kroger/krogerApi.ts'
import { formatGroceryItem } from '@application/grocery/formatGroceryItem.ts'
import { KrogerLoginButton } from './KrogerLoginButton.tsx'

interface ProductMatch {
  groceryItem: GroceryItem
  product: KrogerProduct | null
  loading: boolean
  error: string | null
  selected: boolean
}

interface KrogerPriceViewProps {
  items: GroceryItem[]
  locationId: string
  storeName: string
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
  getAccessToken: () => string | null
  onBack: () => void
}

export function KrogerPriceView({
  items,
  locationId,
  storeName,
  isConnected,
  onConnect,
  onDisconnect,
  getAccessToken,
  onBack,
}: KrogerPriceViewProps) {
  const [matches, setMatches] = useState<ProductMatch[]>([])
  const [cartStatus, setCartStatus] = useState<'idle' | 'adding' | 'success' | 'error'>('idle')
  const [cartError, setCartError] = useState<string | null>(null)

  // Search for products for each grocery item
  useEffect(() => {
    const uncheckedItems = items.filter((i) => !i.checked)
    const initial: ProductMatch[] = uncheckedItems.map((item) => ({
      groceryItem: item,
      product: null,
      loading: true,
      error: null,
      selected: false,
    }))
    setMatches(initial)

    uncheckedItems.forEach((item, idx) => {
      searchProducts(item.displayName, locationId)
        .then((products) => {
          // Pick best match (first in-stock result, or first result)
          const best = products.find((p) => p.inStock) ?? products[0] ?? null
          setMatches((prev) =>
            prev.map((m, i) => (i === idx ? { ...m, product: best, loading: false, selected: best !== null } : m))
          )
        })
        .catch((err) => {
          setMatches((prev) =>
            prev.map((m, i) => (i === idx ? { ...m, loading: false, error: err.message } : m))
          )
        })
    })
  }, [items, locationId])

  const toggleItem = useCallback((idx: number) => {
    setMatches((prev) => prev.map((m, i) => (i === idx ? { ...m, selected: !m.selected } : m)))
  }, [])

  const selectedItems = matches.filter((m) => m.selected && m.product)
  const total = selectedItems.reduce((sum, m) => {
    const price = m.product!.promoPrice ?? m.product!.price ?? 0
    return sum + price
  }, 0)

  const handleAddToCart = async () => {
    const token = getAccessToken()
    if (!token) {
      setCartError('Please connect your Kroger account first')
      return
    }
    setCartStatus('adding')
    setCartError(null)
    try {
      await addToCart(
        token,
        selectedItems.map((m) => ({ upc: m.product!.upc, quantity: 1 }))
      )
      setCartStatus('success')
    } catch (err) {
      setCartStatus('error')
      setCartError(err instanceof Error ? err.message : 'Failed to add to cart')
    }
  }

  const loadingCount = matches.filter((m) => m.loading).length

  return (
    <div className="kroger-price-view">
      <div className="kroger-section-header">
        <button className="nav-btn" onClick={onBack}>&larr; Back to List</button>
        <h2 className="kroger-section-title">Kroger Prices</h2>
      </div>

      <p className="kroger-store-info">
        Shopping at <strong>{storeName}</strong>
      </p>

      {loadingCount > 0 && (
        <p className="kroger-loading">Searching {loadingCount} item{loadingCount > 1 ? 's' : ''}...</p>
      )}

      <div className="kroger-product-list">
        {matches.map((match, idx) => (
          <div
            key={match.groceryItem.id}
            className={`kroger-product-row${match.selected ? ' selected' : ''}`}
          >
            <div className="kroger-product-checkbox">
              {match.product && (
                <input
                  type="checkbox"
                  checked={match.selected}
                  onChange={() => toggleItem(idx)}
                />
              )}
            </div>

            <div className="kroger-product-info">
              <div className="kroger-grocery-name">{formatGroceryItem(match.groceryItem)}</div>

              {match.loading && <div className="kroger-product-loading">Searching...</div>}

              {match.error && <div className="kroger-product-error">{match.error}</div>}

              {!match.loading && !match.error && !match.product && (
                <div className="kroger-product-notfound">No product found</div>
              )}

              {match.product && (
                <div className="kroger-product-detail">
                  {match.product.imageUrl && (
                    <img
                      className="kroger-product-img"
                      src={match.product.imageUrl}
                      alt={match.product.name}
                    />
                  )}
                  <div className="kroger-product-meta">
                    <span className="kroger-product-name">{match.product.name}</span>
                    {match.product.brand && (
                      <span className="kroger-product-brand">{match.product.brand}</span>
                    )}
                    {match.product.size && (
                      <span className="kroger-product-size">{match.product.size}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="kroger-product-price">
              {match.product?.promoPrice ? (
                <>
                  <span className="kroger-price-promo">${match.product.promoPrice.toFixed(2)}</span>
                  <span className="kroger-price-regular strikethrough">${match.product.price?.toFixed(2)}</span>
                </>
              ) : match.product?.price ? (
                <span className="kroger-price-regular">${match.product.price.toFixed(2)}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Running total and cart actions */}
      <div className="kroger-cart-footer">
        <div className="kroger-total">
          <span>Estimated Total ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})</span>
          <strong>${total.toFixed(2)}</strong>
        </div>

        <KrogerLoginButton
          isConnected={isConnected}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />

        {isConnected && selectedItems.length > 0 && (
          <button
            className="nav-btn grocery-nav-btn kroger-add-cart-btn"
            onClick={handleAddToCart}
            disabled={cartStatus === 'adding'}
          >
            {cartStatus === 'adding'
              ? 'Adding...'
              : cartStatus === 'success'
              ? 'Added to Cart!'
              : 'Add Selected to Kroger Cart'}
          </button>
        )}

        {cartError && <p className="kroger-error">{cartError}</p>}
        {cartStatus === 'success' && (
          <p className="kroger-success">Items added to your Kroger cart!</p>
        )}
      </div>
    </div>
  )
}
