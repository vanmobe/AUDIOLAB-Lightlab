import { animationLabel, resolveLookLayers, type ShowDocument } from './domain'
import type { DesignProposal } from './design-proposal'
import { patternSignature } from './pattern-language'

function hexRgb(hex: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return undefined
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}
function hueSaturation(hex: string) {
  const rgb = hexRgb(hex)
  if (!rgb) return undefined
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min
  const hue = chroma === 0 ? 0 : max === r ? ((g - b) / chroma + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / chroma + 2) * 60 : ((r - g) / chroma + 4) * 60
  return { hue, saturation: max === 0 ? 0 : chroma / max }
}
function hueBetween(value: number, start: number, end: number) { return value >= start && value <= end }
function redGreenPair(a: string, b: string) {
  const first = hueSaturation(a), second = hueSaturation(b)
  if (!first || !second || first.saturation < .55 || second.saturation < .55) return false
  const red = (hueBetween(first.hue, 340, 360) || hueBetween(first.hue, 0, 25)) || (hueBetween(second.hue, 340, 360) || hueBetween(second.hue, 0, 25))
  const green = hueBetween(first.hue, 85, 155) || hueBetween(second.hue, 85, 155)
  return red && green
}
function frontGroupIds(show: ShowDocument) {
  return new Set(show.groups.filter(group => /front/i.test(group.id + ' ' + group.name)
    || show.fixtures.some(fixture => fixture.groupId === group.id && fixture.profileId === 'varytec-theater-spot-100')).map(group => group.id))
}
function hazeGroupIds(show: ShowDocument) {
  return new Set(show.groups.filter(group => {
    const fixtures = show.fixtures.filter(fixture => fixture.groupId === group.id)
    return fixtures.length > 0 && fixtures.every(fixture => fixture.profileId === 'stairville-hz-200')
  }).map(group => group.id))
}

/** Advisory, not a veto: a deliberately monochrome or static brief is valid. */
export function designQualityWarnings(proposal: DesignProposal, candidate: ShowDocument): string[] {
  const warnings: string[] = []
  for (const profile of proposal.colorProfiles) {
    if (/\b(pulse|puls|chase|looplicht|knipperen|twinkle|sparkle|wave|random)\b/i.test(profile.name)) warnings.push(`Kleurprofiel “${profile.name}” heeft een bewegingsnaam. Geef het een naam die de kleuren of sfeer beschrijft.`)
    if (redGreenPair(profile.primary, profile.accent)) warnings.push(`Kleurprofiel “${profile.name}” combineert verzadigd rood en groen als hoofdkleuren. Dat werkt snel als kerstcontrast; gebruik dit bewust of kies amber/blauw, magenta/cyaan of monochroom met wit accent.`)
  }
  const patterns = new Set<string>()
  for (const program of proposal.programs) {
    const signature = patternSignature(program)
    if (patterns.has(signature)) warnings.push(`Animatie “${animationLabel(program)}” herhaalt hetzelfde patroon als een andere animatie.`)
    patterns.add(signature)
  }
  if (proposal.programs.length >= 4) {
    const effects = new Set(proposal.programs.flatMap(program => program.pattern ? program.pattern.steps.map(step => `${step.selection}:${step.selection === 'moving' ? step.direction : 'forward'}:${step.envelope}`) : [program.effect]))
    if (effects.size < 3) warnings.push('Weinig patroonvariatie: vraag naast pulsen ook looplichten, willekeurige accenten, golven of opbouw. Dit hoeft niet als je bewust een rustige, uniforme reeks wilt.')
  }
  const pairs = new Set<string>()
  const front = frontGroupIds(candidate)
  const haze = hazeGroupIds(candidate)
  for (const look of proposal.looks) {
    const layers = resolveLookLayers(candidate, look)
    const pair = JSON.stringify([look.colorProfileId, [...layers].sort((a, b) => a.groupId.localeCompare(b.groupId))])
    if (pairs.has(pair)) warnings.push(`Look “${look.name}” gebruikt dezelfde groepsindeling, animaties en kleuren als een andere Look.`)
    pairs.add(pair)
    if (!layers.some(layer => layer.mode !== 'off' && layer.intensity > 0 && candidate.fixtures.some(fixture => fixture.groupId === layer.groupId))) warnings.push(`Look “${look.name}” laat alle geplaatste lampen uit.`)
    if (layers.some(layer => front.has(layer.groupId) && (layer.mode === 'off' || layer.intensity < .35))) warnings.push(`Look “${look.name}” zet frontlicht uit of erg laag. Prima als effect, maar bewaar meestal leesbaar warm frontlicht voor performers.`)
    if (layers.some(layer => haze.has(layer.groupId) && layer.mode !== 'off' && layer.intensity > .25)) warnings.push(`Look “${look.name}” gebruikt veel haze. Houd haze meestal laag en constant zodat beweging en kleur leesbaar blijven.`)
    const animated = layers.filter(layer => layer.mode === 'animation' && layer.intensity > 0 && candidate.fixtures.some(fixture => fixture.groupId === layer.groupId))
    const visible = layers.filter(layer => layer.mode !== 'off' && layer.intensity > 0 && candidate.fixtures.some(fixture => fixture.groupId === layer.groupId))
    if (animated.length >= 2 && visible.length >= 3 && new Set(animated.map(layer => `${layer.programId}:${layer.colorProfileId ?? look.colorProfileId}:${layer.rateBeats ?? 1}`)).size === 1) warnings.push(`Look “${look.name}” laat meerdere groepen hetzelfde patroon, kleur en tempo volgen. Overweeg front stabiel te houden en wash/back/bars verschillend te timen voor meer podiumbalans.`)
  }
  if (proposal.looks.length >= 4) {
    const scores = proposal.looks.map(look => resolveLookLayers(candidate, look).reduce((sum, layer) => sum + (layer.mode === 'animation' ? 2 : layer.mode === 'static' ? 1 : 0) * layer.intensity, 0))
    if (Math.max(...scores) - Math.min(...scores) < 1.5) warnings.push('De voorgestelde Looks hebben weinig energiecontrast. Een bruikbare set heeft meestal rustige, medium, high-energy, accent/build en steady fallback momenten.')
  }
  return warnings
}
