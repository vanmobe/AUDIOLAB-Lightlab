import type { ColorProfile, EvaluatedFrame, FixtureProfile, ShowDocument } from './domain'

export const colorRoles = ['primary', 'accent', 'secondary', 'white'] as const
export type ColorRole = typeof colorRoles[number]
export interface ShowRegie {
  transition?: { quantizeBeats: 0 | 1 | 2 | 4 | 8; fadeBeats: number }
  minimumCoverage: { percent: number; threshold: number }
  colorRoles: ColorRole[]
  safetyGroupIds: string[]
}
export function defaultShowRegie(show: Pick<ShowDocument, 'groups'>): ShowRegie {
  return { minimumCoverage: { percent: 0, threshold: .1 }, colorRoles: ['primary', 'accent'], safetyGroupIds: show.groups.some(group => group.id === 'front') ? ['front'] : [] }
}
export function assertShowRegie(value: unknown, groupIds: string[]): asserts value is ShowRegie {
  const invalid = () => { throw new Error('Ongeldige showregie: controleer lichtdekking, kleurrollen en veiligheidslichtgroepen.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const regie = value as Record<string, unknown>
  if (Object.keys(regie).some(key => !['minimumCoverage', 'colorRoles', 'safetyGroupIds', 'transition'].includes(key))) return invalid()
  if (regie.transition !== undefined) {
    const transition = regie.transition as Record<string, unknown>
    if (!transition || typeof transition !== 'object' || Array.isArray(transition) || Object.keys(transition).some(key => !['quantizeBeats', 'fadeBeats'].includes(key)) || ![0, 1, 2, 4, 8].includes(transition.quantizeBeats as number) || typeof transition.fadeBeats !== 'number' || !Number.isFinite(transition.fadeBeats) || transition.fadeBeats < 0 || transition.fadeBeats > 32) return invalid()
  }
  const coverage = regie.minimumCoverage as Record<string, unknown> | undefined
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage) || Object.keys(coverage).some(key => !['percent', 'threshold'].includes(key))) return invalid()
  if (typeof coverage.percent !== 'number' || !Number.isFinite(coverage.percent) || coverage.percent < 0 || coverage.percent > 100 || typeof coverage.threshold !== 'number' || !Number.isFinite(coverage.threshold) || coverage.threshold < .01 || coverage.threshold > 1) return invalid()
  if (!Array.isArray(regie.colorRoles) || !regie.colorRoles.length || regie.colorRoles.length > 4 || new Set(regie.colorRoles).size !== regie.colorRoles.length || regie.colorRoles.some(role => !colorRoles.includes(role))) return invalid()
  if (!Array.isArray(regie.safetyGroupIds) || regie.safetyGroupIds.length > groupIds.length || new Set(regie.safetyGroupIds).size !== regie.safetyGroupIds.length || regie.safetyGroupIds.some(id => !groupIds.includes(id))) return invalid()
}

/** Preserve the old 2:1 primary/accent rhythm unless a different role set is selected. */
export function regieColor(profile: ColorProfile | undefined, index: number, regie?: ShowRegie): string {
  const roles = regie?.colorRoles ?? ['primary', 'accent']
  const role = roles.length === 2 && roles[0] === 'primary' && roles[1] === 'accent'
    ? index % 3 === 0 ? 'accent' : 'primary' : roles[index % roles.length]
  return profile?.[role as ColorRole] ?? '#ffffff'
}

type LightPoint = { fixture: number; segment?: number; intensity: number; color: string; cap: number }
function points(show: ShowDocument, profiles: FixtureProfile[], frame: EvaluatedFrame, caps?: Map<string, number>): LightPoint[] {
  const definitions = new Map(profiles.map(profile => [profile.id, profile]))
  const deployments = new Map(show.fixtures.map(fixture => [fixture.id, fixture]))
  return frame.fixtures.flatMap((light, fixture) => {
    const deployment = deployments.get(light.fixtureId), definition = deployment && definitions.get(deployment.profileId)
    const mode = definition?.modes.find(mode => mode.id === deployment?.modeId)
    if (!mode || definition?.kind === 'hazer') return []
    const cap = caps?.get(light.fixtureId) ?? 0
    if (light.segments) return light.segments.map((segment, index) => ({ fixture, segment: index, ...segment, cap }))
    const count = mode.independentHeads ? deployment?.visualSegments ?? 1 : 1
    return Array.from({ length: count }, (_, index) => ({ fixture, ...(count > 1 ? { segment: index } : {}), intensity: light.intensity, color: light.color, cap }))
  })
}
function visible(point: LightPoint, threshold: number) { return point.intensity + 1e-9 >= threshold && point.color.toLowerCase() !== '#000000' }
export function coverageReport(show: ShowDocument, profiles: FixtureProfile[], frame: EvaluatedFrame) {
  const settings = show.regie?.minimumCoverage ?? { percent: 0, threshold: .1 }
  const all = points(show, profiles, frame)
  const lit = all.filter(point => visible(point, settings.threshold)).length
  const required = Math.ceil(all.length * settings.percent / 100)
  return { total: all.length, lit, required, percent: all.length ? lit / all.length * 100 : 0, unmet: Math.max(0, required - lit), applied: settings.percent > 0 && (frame.mode === 'automation' || frame.mode === 'static') }
}

/** Raise only the minimum number of eligible points, never operator-off or level caps. */
export function applyMinimumCoverage(show: ShowDocument, profiles: FixtureProfile[], frame: EvaluatedFrame, caps: Map<string, number>): EvaluatedFrame {
  const settings = show.regie?.minimumCoverage
  if (!settings?.percent || frame.mode === 'blackout' || frame.mode === 'safety') return frame
  const all = points(show, profiles, frame, caps)
  let missing = Math.ceil(all.length * settings.percent / 100) - all.filter(point => visible(point, settings.threshold)).length
  if (missing <= 0) return frame
  // Stable fixture/segment order breaks ties; no random flicker from this correction itself.
  const candidates = all.filter(point => !visible(point, settings.threshold) && point.cap + 1e-9 >= settings.threshold && point.color.toLowerCase() !== '#000000')
    .sort((a, b) => b.intensity - a.intensity || a.fixture - b.fixture || (a.segment ?? 0) - (b.segment ?? 0))
  const headCounts = new Map<number, number>()
  for (const point of all) if (point.segment !== undefined) headCounts.set(point.fixture, (point.segment ?? 0) + 1)
  const fixtures = frame.fixtures.map((fixture, index) => ({ ...fixture, ...(fixture.segments ? { segments: fixture.segments.map(segment => ({ ...segment })) } : headCounts.has(index) ? { segments: Array.from({ length: headCounts.get(index)! }, () => ({ intensity: fixture.intensity, color: fixture.color })) } : {}) }))
  for (const point of candidates) {
    if (missing-- <= 0) break
    const light = fixtures[point.fixture]
    if (point.segment === undefined) light.intensity = settings.threshold
    else light.segments![point.segment].intensity = settings.threshold
  }
  for (const light of fixtures) if (light.segments) {
    light.intensity = light.segments.reduce((sum, segment) => sum + segment.intensity, 0) / light.segments.length
    light.color = light.segments.find(segment => segment.intensity > 0)?.color ?? light.color
  }
  return { ...frame, fixtures }
}
