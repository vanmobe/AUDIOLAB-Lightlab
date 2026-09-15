export interface PatternStep {
  selection: 'all' | 'alternate' | 'moving' | 'random'
  direction: 'forward' | 'reverse' | 'bounce' | 'inward' | 'outward'
  envelope: 'hold' | 'fade-in' | 'fade-out' | 'pulse'
  width: number
  trail: number
  level: number
  weight: number
}

/** Relative composition only. Duration and phase belong to the Look group. */
export interface Pattern {
  version: 1
  floor: number
  steps: PatternStep[]
}

const selections = ['all', 'alternate', 'moving', 'random']
const directions = ['forward', 'reverse', 'bounce', 'inward', 'outward']
const envelopes = ['hold', 'fade-in', 'fade-out', 'pulse']
function record(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error('Patroon bevat ontbrekende of onbekende velden.')
}
function bounded(value: unknown, min: number, max: number, integer = false) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
  )
}
export function validatePattern(value: unknown): asserts value is Pattern {
  record(value, ['version', 'floor', 'steps'])
  if (
    value.version !== 1 ||
    !bounded(value.floor, 0, 1) ||
    !Array.isArray(value.steps) ||
    value.steps.length < 1 ||
    value.steps.length > 16
  )
    throw new Error('Ongeldige patroonversie, basisintensiteit of aantal stappen (1–16).')
  for (const step of value.steps) {
    record(step, ['selection', 'direction', 'envelope', 'width', 'trail', 'level', 'weight'])
    if (
      !selections.includes(step.selection as string) ||
      !directions.includes(step.direction as string) ||
      !envelopes.includes(step.envelope as string) ||
      !bounded(step.width, 1, 8, true) ||
      !bounded(step.weight, 1, 8, true) ||
      !bounded(step.trail, 0, 1) ||
      !bounded(step.level, 0, 1)
    )
      throw new Error('Ongeldige patroonstap: selectie, richting, verloop, breedte, lichtstaart, niveau of gewicht.')
  }
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}
/** Content identity excludes compatibility fields and controls with no effect on playback. */
export function patternSignature(program: { effect: string; pattern?: Pattern }): string {
  if (!program.pattern) return `effect:${program.effect}`
  validatePattern(program.pattern)
  const { floor, steps } = program.pattern
  // Only collapse provably constant output for every rig size, not visual similarity on one setup.
  const constants = steps.map((step) =>
    step.level <= floor ? floor : step.selection === 'all' && step.envelope === 'hold' ? step.level : undefined,
  )
  const constant = constants[0]
  if (constant !== undefined && constants.every((value) => value === constant)) {
    return (
      'recipe:' +
      JSON.stringify({
        version: 1,
        floor: constant,
        steps: [
          { selection: 'all', direction: 'forward', envelope: 'hold', width: 1, trail: 0, level: constant, weight: 1 },
        ],
      })
    )
  }
  const divisor = steps.reduce((value, step) => gcd(value, step.weight), 0)
  return (
    'recipe:' +
    JSON.stringify({
      version: 1,
      floor,
      steps: steps.map((step) => ({
        selection: step.selection,
        direction: step.selection === 'moving' ? step.direction : 'forward',
        envelope: step.envelope,
        width: step.selection === 'moving' || step.selection === 'random' ? step.width : 1,
        trail: step.selection === 'moving' ? step.trail : 0,
        level: step.level,
        weight: step.weight / divisor,
      })),
    })
  )
}

export function patternDescription(pattern: Pattern): string {
  const selection = {
    all: 'Alle lampen',
    alternate: 'Afwisselende sets',
    moving: 'Lopend venster',
    random: 'Willekeurige lampen',
  }
  const direction = {
    forward: 'vooruit',
    reverse: 'achteruit',
    bounce: 'heen en weer',
    inward: 'naar het midden',
    outward: 'naar buiten',
  }
  const envelope = { hold: 'vast niveau', 'fade-in': 'opkomend', 'fade-out': 'uitdovend', pulse: 'ademend' }
  return (
    pattern.steps
      .map(
        (step) =>
          `${selection[step.selection]}${step.selection === 'moving' ? ` ${direction[step.direction]} (breedte ${step.width}${step.trail > 0 ? `, lichtstaart ${Math.round(step.trail * 100)}%` : ''})` : step.selection === 'random' ? ` (${step.width})` : ''}, ${envelope[step.envelope]}${step.level < 1 ? ` op ${Math.round(step.level * 100)}%` : ''}`,
      )
      .join(' → ') + ` · basislicht ${Math.round(pattern.floor * 100)}%`
  )
}

function hash(cycle: number, step: number) {
  let value = Math.imul(cycle ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step + 1, 0xc2b2ae35)
  value ^= value >>> 16
  return Math.imul(value, 0x85ebca6b) >>> 0
}

function moving(step: PatternStep, progress: number, point: number, count: number) {
  const mirrored = step.direction === 'inward' || step.direction === 'outward'
  const size = mirrored ? Math.ceil(count / 2) : count
  let coordinate = mirrored ? Math.min(point, count - 1 - point) : point
  let backwards = step.direction === 'reverse' || step.direction === 'outward'
  if (step.direction === 'bounce') {
    backwards = progress >= 0.5
    progress = progress < 0.5 ? progress * 2 : (1 - progress) * 2
  }
  if (step.direction === 'reverse' || step.direction === 'outward') coordinate = size - 1 - coordinate
  const width = Math.min(step.width, size)
  const start = Math.min(size - width, Math.floor(progress * (size - width + 1)))
  if (coordinate >= start && coordinate < start + width) return 1
  // Reverse/outward already invert coordinates; only bounce reverses travel mid-cycle.
  const behind = step.direction === 'bounce' && backwards ? coordinate - (start + width - 1) : start - coordinate
  const length = Math.ceil(step.trail * size)
  return behind > 0 && behind <= length ? step.trail * (1 - behind / (length + 1)) : 0
}

/** Pure, bounded evaluation. Call only with validated patterns and a group-local spatial index. */
export function evaluatePattern(pattern: Pattern, phase: number, point: number, count: number): number {
  if (count < 1 || point < 0 || point >= count || !Number.isFinite(phase)) return pattern.floor
  const cycle = Math.floor(phase)
  const total = pattern.steps.reduce((sum, step) => sum + step.weight, 0)
  const position = (phase - cycle) * total
  let start = 0,
    index = 0
  while (index < pattern.steps.length - 1 && position >= start + pattern.steps[index].weight)
    start += pattern.steps[index++].weight
  const step = pattern.steps[index]
  const progress = (position - start) / step.weight
  const envelope =
    step.envelope === 'hold'
      ? 1
      : step.envelope === 'fade-in'
        ? progress
        : step.envelope === 'fade-out'
          ? 1 - progress
          : Math.sin(progress * Math.PI) ** 2
  let selected = 1
  if (step.selection === 'moving') selected = moving(step, progress, point, count)
  else if (step.selection === 'alternate') selected = (point + cycle + index) % 2 === 0 ? 1 : 0
  else if (step.selection === 'random') {
    const seed = hash(cycle, index)
    let stride = seed % count || 1
    while (gcd(stride, count) !== 1) stride++
    selected = 0
    for (let slot = 0; slot < Math.min(step.width, count); slot++) {
      if (((seed % count) + slot * stride) % count === point) {
        selected = 1
        break
      }
    }
  }
  return Math.max(pattern.floor, step.level * envelope * selected)
}
