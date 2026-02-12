/**
 * Parse informal human-readable duration strings to minutes.
 *
 * Handles formats like:
 * - "1 hr 30 min", "1 hour 30 minutes"
 * - "45 minutes", "45 min"
 * - "2 hours"
 * - "1.5 hours"
 * - "90 min"
 *
 * Returns null if parsing fails.
 */
export function parseInformalDuration(text: string): number | null {
  if (!text || !text.trim()) return null

  const input = text.trim().toLowerCase()

  let totalMinutes = 0
  let matched = false

  // Match hours component: "1 hour", "2 hrs", "1.5 hours"
  const hoursMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/)
  if (hoursMatch) {
    totalMinutes += parseFloat(hoursMatch[1]) * 60
    matched = true
  }

  // Match minutes component: "30 minutes", "45 min", "15 mins"
  const minsMatch = input.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/)
  if (minsMatch) {
    totalMinutes += parseFloat(minsMatch[1])
    matched = true
  }

  // If nothing matched, try bare number (assume minutes)
  if (!matched) {
    const bareNum = input.match(/^(\d+)$/)
    if (bareNum) {
      totalMinutes = parseInt(bareNum[1], 10)
      matched = true
    }
  }

  return matched && totalMinutes > 0 ? Math.round(totalMinutes) : null
}
