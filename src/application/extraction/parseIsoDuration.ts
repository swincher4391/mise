/**
 * Parse an ISO 8601 duration string to minutes.
 * Handles: "PT1H30M", "PT45M", "PT2H", "PT1H", "P0DT1H30M", etc.
 * Returns null if parsing fails or input is empty.
 */
export function parseIsoDuration(duration: string | null | undefined): number | null {
  if (!duration) return null

  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return null

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2] || '0', 10)
  const minutes = parseInt(match[3] || '0', 10)
  const seconds = parseInt(match[4] || '0', 10)

  const totalMinutes = days * 24 * 60 + hours * 60 + minutes + Math.round(seconds / 60)
  return totalMinutes > 0 ? totalMinutes : null
}
