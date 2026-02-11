/**
 * Known fractions for display. Threshold: if within 0.01 of a known
 * fraction value, display as fraction; otherwise show rounded decimal.
 */
const FRACTION_MAP: [number, string][] = [
  [0.125, '1/8'],
  [0.167, '1/6'],
  [0.25, '1/4'],
  [0.333, '1/3'],
  [0.375, '3/8'],
  [0.5, '1/2'],
  [0.625, '5/8'],
  [0.667, '2/3'],
  [0.75, '3/4'],
  [0.833, '5/6'],
  [0.875, '7/8'],
]

const THRESHOLD = 0.02

/**
 * Format a number for display as a fraction or mixed number.
 *
 * Examples:
 * - 0.5 -> "1/2"
 * - 1.5 -> "1 1/2"
 * - 0.333 -> "1/3"
 * - 2.0 -> "2"
 * - 1.7 -> "1.7"
 */
export function formatQuantity(value: number): string {
  if (value <= 0) return '0'

  const whole = Math.floor(value)
  const fractional = value - whole

  // Pure whole number
  if (fractional < THRESHOLD) {
    return String(whole)
  }

  // Check against known fractions
  for (const [frac, display] of FRACTION_MAP) {
    if (Math.abs(fractional - frac) < THRESHOLD) {
      return whole > 0 ? `${whole} ${display}` : display
    }
  }

  // Close to next whole number
  if (1 - fractional < THRESHOLD) {
    return String(whole + 1)
  }

  // Fall back to decimal (1 decimal place)
  return Number(value.toFixed(1)).toString()
}
