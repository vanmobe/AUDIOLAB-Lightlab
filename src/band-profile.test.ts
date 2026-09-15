import { describe, expect, it } from 'vitest'
import { bandDesignLimits, bandProfileSummary, defaultBandProfile, validateBandProfile } from './band-profile'

describe('band profile contract', () => {
  it('starts empty and automatic without inventing the band identity or colors', () => {
    expect(defaultBandProfile).toEqual({ name: '', genres: '', character: '', colorMood: 'auto', energy: 'auto', complexity: 'auto', motion: 'auto', preferredColors: [] })
    expect(() => validateBandProfile(defaultBandProfile)).not.toThrow()
    expect(bandProfileSummary()).toContain('nog niet ingesteld')
    expect(bandProfileSummary(defaultBandProfile)).toContain('AI kiest')
  })
  it('accepts exact text/color boundaries and all explicit enum values', () => {
    const boundary = { ...defaultBandProfile, name: 'n'.repeat(120), genres: 'g'.repeat(240), character: 'c'.repeat(1200), preferredColors: ['#AaBbCc', '#000000', '#FFFFFF', '#2f7cff'] }
    expect(() => validateBandProfile(boundary)).not.toThrow()
    for (const [key, values] of Object.entries({ colorMood: ['warm', 'cool', 'bold', 'restrained'], energy: ['calm', 'balanced', 'high'], complexity: ['simple', 'layered', 'rich'], motion: ['slow', 'medium', 'fast'] })) {
      for (const value of values) expect(() => validateBandProfile({ ...boundary, [key]: value })).not.toThrow()
    }
  })
  it.each([null, [], {}, { ...defaultBandProfile, script: 'run()' }, { ...defaultBandProfile, name: 1 }, { ...defaultBandProfile, name: 'n'.repeat(121) }, { ...defaultBandProfile, genres: 'g'.repeat(241) }, { ...defaultBandProfile, character: 'c'.repeat(1201) }, { ...defaultBandProfile, energy: 'extreme' }, { ...defaultBandProfile, complexity: 3 }, { ...defaultBandProfile, colorMood: 'blue' }, { ...defaultBandProfile, motion: 'stop' }, { ...defaultBandProfile, preferredColors: null }, { ...defaultBandProfile, preferredColors: ['blue'] }, { ...defaultBandProfile, preferredColors: ['#fff'] }, { ...defaultBandProfile, preferredColors: ['#12345678'] }, { ...defaultBandProfile, preferredColors: [123456] }, { ...defaultBandProfile, preferredColors: Array(5).fill('#ffffff') }])('rejects malformed or unsupported profile %j', value => {
    expect(() => validateBandProfile(value)).toThrow()
  })
  it('rejects absent required fields while allowing empty text', () => {
    for (const key of Object.keys(defaultBandProfile)) {
      const value: Record<string, unknown> = { ...defaultBandProfile }
      delete value[key]
      expect(() => validateBandProfile(value)).toThrow('velden')
    }
  })
  it('summarizes explicit preferences without inferring identity or playing speed from genre', () => {
    const profile = { ...defaultBandProfile, name: 'Band One', genres: 'Heavy jazz', energy: 'high' as const, preferredColors: ['#ff0000'] }
    expect(bandProfileSummary(profile)).toBe('Band One · Heavy jazz · 2 voorkeuren')
    expect(bandDesignLimits(profile)).toEqual(bandDesignLimits())
  })
  it.each([['auto', 16], ['simple', 2], ['layered', 4], ['rich', 8]] as const)('bounds %s patterns at %i relative steps', (complexity, maxSteps) => {
    expect(bandDesignLimits({ ...defaultBandProfile, complexity }).maxSteps).toBe(maxSteps)
  })
  it.each([['auto', .125, 64], ['slow', 8, 32], ['medium', 2, 8], ['fast', .25, 2]] as const)('bounds %s group durations without changing pattern tempo', (motion, minRateBeats, maxRateBeats) => {
    expect(bandDesignLimits({ ...defaultBandProfile, motion })).toMatchObject({ minRateBeats, maxRateBeats })
    expect(defaultBandProfile.motion).toBe('auto')
  })
})
