import { describe, it, expect } from 'vitest'
import { parseStepTimers, extractPrimaryTimer } from '@application/parser/parseStepTimers.ts'

describe('parseStepTimers', () => {
  it('parses simple minutes', () => {
    const timers = parseStepTimers('Bake for 25 minutes.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(1500)
    expect(timers[0].label).toBe('25 minutes')
  })

  it('parses range — uses upper bound', () => {
    const timers = parseStepTimers('Cook for 3 to 4 minutes until golden.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(240)
  })

  it('parses compound hours and minutes', () => {
    const timers = parseStepTimers('Simmer for 1 hour and 30 minutes.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(5400)
  })

  it('parses seconds', () => {
    const timers = parseStepTimers('Microwave for 30 seconds.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(30)
  })

  it('ignores temperatures — no unit keyword', () => {
    const timers = parseStepTimers('Preheat oven to 425 degrees.')
    expect(timers).toHaveLength(0)
  })

  it('ignores bare numbers without time units', () => {
    const timers = parseStepTimers('Preheat oven to 350.')
    expect(timers).toHaveLength(0)
  })

  it('handles "about" prefix', () => {
    const timers = parseStepTimers('Cook for about 10 minutes.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(600)
  })

  it('handles hyphenated range', () => {
    const timers = parseStepTimers('Sear for 2-3 minutes per side.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(180)
  })

  it('handles abbreviated units', () => {
    const timers = parseStepTimers('Bake for 45 min.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(2700)
  })

  it('finds multiple timers in one step', () => {
    const timers = parseStepTimers('Cook 5 minutes, then bake 20 minutes.')
    expect(timers).toHaveLength(2)
    expect(timers[0].seconds).toBe(300)
    expect(timers[1].seconds).toBe(1200)
  })

  it('handles hours abbreviated', () => {
    const timers = parseStepTimers('Let rise for 2 hrs.')
    expect(timers).toHaveLength(1)
    expect(timers[0].seconds).toBe(7200)
  })
})

describe('extractPrimaryTimer', () => {
  it('returns the largest timer', () => {
    expect(extractPrimaryTimer('Cook 5 minutes, then bake 20 minutes.')).toBe(1200)
  })

  it('returns null when no timers found', () => {
    expect(extractPrimaryTimer('Preheat oven to 350.')).toBeNull()
  })

  it('returns single timer value', () => {
    expect(extractPrimaryTimer('Bake for 25 minutes.')).toBe(1500)
  })
})
