import { afterEach, describe, expect, it, vi } from 'vitest'
import { endOfIsoWeek, rangeError, shiftWeeks, startOfIsoWeek, toWholeWeeks, weekCount } from './dates'

describe('ISO week maths', () => {
  it('puts the first days of 2026 in a week that starts in 2025', () => {
    expect(startOfIsoWeek('2026-01-01')).toBe('2025-12-29') // Thursday
    expect(startOfIsoWeek('2026-01-04')).toBe('2025-12-29') // Sunday ends the week, not starts it
    expect(startOfIsoWeek('2025-12-29')).toBe('2025-12-29')
    expect(endOfIsoWeek('2025-12-31')).toBe('2026-01-04')
  })

  it('handles week 53 of 2026 running into 2027', () => {
    expect(startOfIsoWeek('2027-01-03')).toBe('2026-12-28')
    expect(startOfIsoWeek('2027-01-04')).toBe('2027-01-04')
  })

  it('moves a range by whole weeks across the year boundary', () => {
    expect(shiftWeeks({ from: '2025-12-29', to: '2026-01-18' }, -1)).toEqual({ from: '2025-12-22', to: '2026-01-11' })
    expect(shiftWeeks({ from: '2025-12-22', to: '2025-12-28' }, 1)).toEqual({ from: '2025-12-29', to: '2026-01-04' })
  })

  it('widens a range to whole weeks and counts them', () => {
    expect(toWholeWeeks({ from: '2026-01-01', to: '2026-01-16' })).toEqual({ from: '2025-12-29', to: '2026-01-18' })
    expect(weekCount({ from: '2026-01-01', to: '2026-01-16' })).toBe(3)
  })

  describe('in time zones far from UTC', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it.each(['America/Los_Angeles', 'Pacific/Kiritimati'])('gives the same answers in %s', (tz) => {
      vi.stubEnv('TZ', tz)
      expect(startOfIsoWeek('2026-01-01')).toBe('2025-12-29')
      expect(shiftWeeks({ from: '2025-12-29', to: '2026-01-04' }, 1)).toEqual({ from: '2026-01-05', to: '2026-01-11' })
    })
  })
})

describe('rangeError', () => {
  it('accepts a range of up to 26 weeks', () => {
    expect(rangeError({ from: '2026-01-05', to: '2026-07-05' })).toBeNull()
  })

  it('rejects what the API would reject', () => {
    expect(rangeError({ from: '2026-01-05', to: '2026-07-06' })).toMatch(/at most 26 weeks/)
    expect(rangeError({ from: '2026-01-09', to: '2026-01-08' })).toMatch(/on or after/)
    expect(rangeError({ from: '2026-02-29', to: '2026-03-01' })).toMatch(/valid start date/)
    expect(rangeError({ from: '2026-01-05', to: '' })).toMatch(/valid end date/)
  })
})
