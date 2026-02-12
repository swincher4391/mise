import { numericQuantity } from 'numeric-quantity'
import type { Range } from '@domain/models/Ingredient.ts'

/** Unicode fraction map for normalization. */
const UNICODE_FRACTIONS: Record<string, string> = {
  '\u00BC': '1/4',  // ¼
  '\u00BD': '1/2',  // ½
  '\u00BE': '3/4',  // ¾
  '\u2153': '1/3',  // ⅓
  '\u2154': '2/3',  // ⅔
  '\u2155': '1/5',  // ⅕
  '\u2156': '2/5',  // ⅖
  '\u2157': '3/5',  // ⅗
  '\u2158': '4/5',  // ⅘
  '\u2159': '1/6',  // ⅙
  '\u215A': '5/6',  // ⅚
  '\u215B': '1/8',  // ⅛
  '\u215C': '3/8',  // ⅜
  '\u215D': '5/8',  // ⅝
  '\u215E': '7/8',  // ⅞
}

/** Replace unicode fraction characters with ASCII equivalents. */
export function normalizeUnicodeFractions(text: string): string {
  let result = text
  for (const [unicode, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    // Insert space before the fraction when preceded by a digit (e.g. "1½" → "1 1/2")
    result = result.replace(new RegExp(`(\\d)${unicode}`, 'g'), `$1 ${ascii}`)
    result = result.replace(new RegExp(unicode, 'g'), ascii)
  }
  return result
}

/**
 * Regex matching a quantity at the start of a string.
 * Handles: whole numbers, fractions, mixed numbers, decimals.
 * Group captures the full quantity portion.
 */
const QTY_PATTERN = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+)/

/**
 * Range pattern: two quantities separated by dash/to/or.
 */
const RANGE_PATTERN = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+)\s*(?:[-–—]|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+)/

export interface QuantityResult {
  qty: number | Range | null
  remainder: string
}

/** Parse a numeric quantity from the front of a string. */
export function parseQuantity(text: string): QuantityResult {
  const trimmed = text.trim()

  // Try range first (e.g., "3-4", "1/2-3/4", "1 1/2 - 2")
  const rangeMatch = trimmed.match(RANGE_PATTERN)
  if (rangeMatch) {
    const min = numericQuantity(rangeMatch[1])
    const max = numericQuantity(rangeMatch[2])
    if (!isNaN(min) && !isNaN(max)) {
      const remainder = trimmed.slice(rangeMatch[0].length).trim()
      return { qty: { min, max }, remainder }
    }
  }

  // Try single quantity
  const qtyMatch = trimmed.match(QTY_PATTERN)
  if (qtyMatch) {
    const value = numericQuantity(qtyMatch[1])
    if (!isNaN(value)) {
      const remainder = trimmed.slice(qtyMatch[0].length).trim()
      return { qty: value, remainder }
    }
  }

  return { qty: null, remainder: trimmed }
}
