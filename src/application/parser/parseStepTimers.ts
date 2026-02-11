export interface ParsedTimer {
  seconds: number
  label: string
  startIndex: number
  endIndex: number
}

const UNIT_MAP: Record<string, number> = {
  second: 1,
  seconds: 1,
  sec: 1,
  secs: 1,
  minute: 60,
  minutes: 60,
  min: 60,
  mins: 60,
  hour: 3600,
  hours: 3600,
  hr: 3600,
  hrs: 3600,
}

const PREFIX = /(?:about|approximately|around)\s+/gi
const UNIT_PATTERN = 'minutes?|mins?|hours?|hrs?|seconds?|secs?'

// Order matters: compound first, then range, then simple
const PATTERNS: RegExp[] = [
  // Compound: "1 hour and 30 minutes"
  new RegExp(
    `(\\d+)\\s+hours?\\s+(?:and\\s+)?(\\d+)\\s+(?:${UNIT_PATTERN})`,
    'gi',
  ),
  // Range: "10-15 minutes" or "10 to 15 min"
  new RegExp(
    `(\\d+)\\s*(?:to|-)\\s*(\\d+)\\s+(${UNIT_PATTERN})`,
    'gi',
  ),
  // Simple: "25 minutes"
  new RegExp(
    `(\\d+)\\s+(${UNIT_PATTERN})`,
    'gi',
  ),
]

function unitToSeconds(unit: string): number {
  return UNIT_MAP[unit.toLowerCase()] ?? 0
}

/**
 * Extract all time durations from step text.
 */
export function parseStepTimers(text: string): ParsedTimer[] {
  // Strip prefixes for matching but preserve original indices
  const stripped = text.replace(PREFIX, (match) => ' '.repeat(match.length))
  const results: ParsedTimer[] = []
  const claimed = new Set<number>()

  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(stripped)) !== null) {
      const startIndex = match.index
      const endIndex = startIndex + match[0].length

      // Skip if any character in this range is already claimed
      let overlap = false
      for (let i = startIndex; i < endIndex; i++) {
        if (claimed.has(i)) {
          overlap = true
          break
        }
      }
      if (overlap) continue

      let seconds: number

      if (PATTERNS.indexOf(pattern) === 0) {
        // Compound: hours + minutes
        const hours = parseInt(match[1], 10)
        const mins = parseInt(match[2], 10)
        seconds = hours * 3600 + mins * 60
      } else if (PATTERNS.indexOf(pattern) === 1) {
        // Range: use upper bound
        const upper = parseInt(match[2], 10)
        const unit = match[3]
        seconds = upper * unitToSeconds(unit)
      } else {
        // Simple
        const value = parseInt(match[1], 10)
        const unit = match[2]
        seconds = value * unitToSeconds(unit)
      }

      if (seconds > 0) {
        // Claim these positions
        for (let i = startIndex; i < endIndex; i++) {
          claimed.add(i)
        }
        // Use original text for label
        results.push({
          seconds,
          label: text.substring(startIndex, endIndex).trim(),
          startIndex,
          endIndex,
        })
      }
    }
  }

  // Sort by position in text
  results.sort((a, b) => a.startIndex - b.startIndex)
  return results
}

/**
 * Extract the primary (largest) timer from step text, or null if none.
 */
export function extractPrimaryTimer(text: string): number | null {
  const timers = parseStepTimers(text)
  if (timers.length === 0) return null
  return Math.max(...timers.map((t) => t.seconds))
}
