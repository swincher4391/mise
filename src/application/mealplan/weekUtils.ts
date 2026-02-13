import type { DayOfWeek } from '@domain/models/MealPlan.ts'

export const DAYS_OF_WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

/**
 * Get the Monday (start of week) for a given date.
 * Returns YYYY-MM-DD string.
 */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatDate(d)
}

/**
 * Offset a weekStart string by N weeks (+/-).
 */
export function offsetWeek(weekStart: string, weeks: number): string {
  const d = parseDate(weekStart)
  d.setDate(d.getDate() + weeks * 7)
  return formatDate(d)
}

/**
 * Format a week range like "Feb 10 - Feb 16"
 */
export function formatWeekRange(weekStart: string): string {
  const start = parseDate(weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${startStr} - ${endStr}`
}

/**
 * Format as "Week of Feb 10 - Feb 16" for grocery list names.
 */
export function formatWeekName(weekStart: string): string {
  return `Week of ${formatWeekRange(weekStart)}`
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}
