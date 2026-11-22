import { describe, expect, it } from 'vitest'
import { formatTime, formatTimeSpoken } from '../formatTime'

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [599.9, '9:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [15153, '4:12:33'],
  ])('formats %d seconds as %s', (input, expected) => {
    expect(formatTime(input)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity, -3])('gives 0:00 for unusable input %d', (input) => {
    expect(formatTime(input)).toBe('0:00')
  })
})

describe('formatTimeSpoken', () => {
  it.each([
    [0, '0 sekunder'],
    [1, '1 sekund'],
    [60, '1 minut'],
    [125, '2 minuter 5 sekunder'],
    [3600, '1 timme'],
    [7261, '2 timmar 1 minut 1 sekund'],
  ])('says %d seconds as "%s"', (input, expected) => {
    expect(formatTimeSpoken(input)).toBe(expected)
  })

  it('gives 0 sekunder for NaN', () => {
    expect(formatTimeSpoken(NaN)).toBe('0 sekunder')
  })
})
