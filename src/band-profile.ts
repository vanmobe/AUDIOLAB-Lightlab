export interface BandProfile {
  name: string
  genres: string
  character: string
  colorMood: 'auto' | 'warm' | 'cool' | 'bold' | 'restrained'
  energy: 'auto' | 'calm' | 'balanced' | 'high'
  complexity: 'auto' | 'simple' | 'layered' | 'rich'
  motion: 'auto' | 'slow' | 'medium' | 'fast'
  preferredColors: string[]
}

export const defaultBandProfile: BandProfile = {
  name: '', genres: '', character: '', colorMood: 'auto', energy: 'auto', complexity: 'auto', motion: 'auto', preferredColors: [],
}

export function validateBandProfile(value: unknown): asserts value is BandProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ongeldig bandprofiel.')
  const profile = value as Record<string, unknown>
  const keys = Object.keys(defaultBandProfile)
  if (Object.keys(profile).length !== keys.length || keys.some(key => !Object.hasOwn(profile, key))) throw new Error('Bandprofiel bevat ontbrekende of onbekende velden.')
  for (const [key, limit] of [['name', 120], ['genres', 240], ['character', 1200]] as const) {
    if (typeof profile[key] !== 'string' || profile[key].length > limit) throw new Error(`Bandprofiel ${key} mag maximaal ${limit} tekens bevatten.`)
  }
  for (const [key, choices] of [
    ['colorMood', ['auto', 'warm', 'cool', 'bold', 'restrained']],
    ['energy', ['auto', 'calm', 'balanced', 'high']],
    ['complexity', ['auto', 'simple', 'layered', 'rich']],
    ['motion', ['auto', 'slow', 'medium', 'fast']],
  ] as const) {
    if (typeof profile[key] !== 'string' || !(choices as readonly string[]).includes(profile[key])) throw new Error(`Ongeldige bandvoorkeur: ${key}.`)
  }
  if (!Array.isArray(profile.preferredColors) || profile.preferredColors.length > 4 || Array.from(profile.preferredColors).some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new Error('Kies maximaal vier geldige voorkeurskleuren.')
}

/** Explicit qualitative preferences bound new output, never rewrite existing design data. */
export function bandDesignLimits(profile?: BandProfile) {
  const maxSteps = { auto: 16, simple: 2, layered: 4, rich: 8 }[profile?.complexity ?? 'auto']
  const [minRateBeats, maxRateBeats] = { auto: [.125, 64], slow: [8, 32], medium: [2, 8], fast: [.25, 2] }[profile?.motion ?? 'auto']
  return { maxSteps, minRateBeats, maxRateBeats }
}

export function bandProfileSummary(profile?: BandProfile): string {
  if (!profile) return 'Bandprofiel · nog niet ingesteld'
  const parts = [profile.name.trim() || 'Bandprofiel']
  if (profile.genres.trim()) parts.push(profile.genres.trim())
  const count = [profile.colorMood, profile.energy, profile.complexity, profile.motion].filter(value => value !== 'auto').length + (profile.preferredColors.length ? 1 : 0)
  parts.push(count ? `${count} ${count === 1 ? 'voorkeur' : 'voorkeuren'}` : 'AI kiest')
  return parts.join(' · ')
}
