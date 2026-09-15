import { Children, isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CandidatePreview, DesignAssistant } from './DesignAssistant'
import { initialShow } from './seed'

const harness = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], simulator: vi.fn() }))
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++
    if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial
    return [harness.values[index], (value: unknown) => { harness.values[index] = typeof value === 'function' ? value(harness.values[index]) : value }]
  },
  useRef: (initial: unknown) => { const index = harness.cursor++; if (!(index in harness.values)) harness.values[index] = { current: initial }; return harness.values[index] },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => unknown) => { harness.effects.push(effect) },
}))
vi.mock('./simulator', () => ({ StageSimulator: harness.simulator }))
interface Props { children?: ReactNode; hidden?: boolean; disabled?: boolean; onClick?: () => unknown; value?: unknown; 'aria-label'?: string; onChange?: (event: { target: { value: string } }) => void }
const text = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? text(child.props.children) : String(child)).join('')
// Unlike the legacy structural helpers, this follows actual hidden-step visibility.
const visibleText = (node: ReactNode): string => Children.toArray(node).map(child => isValidElement<Props>(child) ? child.props.hidden ? '' : visibleText(child.props.children) : String(child)).join('')
function button(node: ReactNode, label: string): Props {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<Props>(child)) continue
    if (child.props.onClick && text(child.props.children) === label) return child.props
    try { return button(child.props.children, label) } catch { /* next sibling */ }
  }
  throw new Error(`Missing button: ${label}`)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function requestInputs(node: ReactNode): Props[] {
  return Children.toArray(node).flatMap(child => !isValidElement<Props>(child) ? [] : [
    ...(['select', 'input', 'textarea'].includes(String(child.type)) ? [child.props] : []),
    ...requestInputs(child.props.children),
  ])
}
beforeEach(() => { harness.values = []; harness.cursor = 0; harness.effects = []; harness.simulator.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('AI request lifecycle', () => {
  const render = () => { harness.cursor = 0; return DesignAssistant({ show: initialShow, onAccept: vi.fn() }) }
  it('guides scope to brief without generating or losing count drafts', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect(visibleText(render())).toContain('Wat wil je ontwerpen?')
    expect(visibleText(render())).not.toContain('Beschrijf kleur, energie en ritme')
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal kleurprofielen')!.onChange!({ target: { value: '3' } })
    button(render(), 'Verder: beschrijf je idee').onClick!()
    expect(visibleText(render())).toContain('Beschrijf kleur, energie en ritme')
    expect(visibleText(render())).not.toContain('Wat wil je ontwerpen?')
    button(render(), 'Terug naar aantallen').onClick!()
    expect(requestInputs(render()).find(input => input['aria-label'] === 'Aantal kleurprofielen')!.value).toBe(3)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('shows generation in review and provides a visible route back after cancellation', async () => {
    const response = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => response.promise))
    button(render(), 'Verder: beschrijf je idee').onClick!()
    const pending = button(render(), 'Maak voorstel').onClick!()
    expect(visibleText(render())).toContain('Annuleer aanvraag')
    expect(visibleText(render())).not.toContain('Beschrijf kleur, energie en ritme')
    button(render(), 'Annuleer aanvraag').onClick!()
    expect(visibleText(render())).toContain('Aanvraag geannuleerd')
    button(render(), 'Aanvraag aanpassen').onClick!()
    expect(visibleText(render())).toContain('Beschrijf kleur, energie en ritme')
    response.resolve(Response.json({ error: 'late response' }, { status: 502 }))
    await pending
    expect(visibleText(render())).not.toContain('late response')
  })
  it('normalizes hidden count drafts on the wire while preserving their editor values', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'test' }, { status: 502 })); vi.stubGlobal('fetch', fetch)
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal kleurprofielen')!.onChange!({ target: { value: '1.5' } })
    expect(button(render(), 'Maak voorstel').disabled).toBe(true)
    requestInputs(render()).find(input => input.value === 'all')!.onChange!({ target: { value: 'programs' } })
    expect(button(render(), 'Maak voorstel').disabled).toBe(false)
    await button(render(), 'Maak voorstel').onClick!()
    expect(JSON.parse(fetch.mock.calls[0][1].body).options).toMatchObject({ scope: 'programs', profileCount: 0, programCount: 8, lookCount: 0 })
    requestInputs(render()).find(input => input.value === 'programs')!.onChange!({ target: { value: 'all' } })
    expect(requestInputs(render()).find(input => input['aria-label'] === 'Aantal kleurprofielen')!.value).toBe(1.5)
    expect(button(render(), 'Maak voorstel').disabled).toBe(true)
  })
  it('allows zero counts inside a complete request when at least one collection is requested', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'test' }, { status: 502 })); vi.stubGlobal('fetch', fetch)
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal kleurprofielen')!.onChange!({ target: { value: '0' } })
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal animaties')!.onChange!({ target: { value: '2' } })
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal Looks')!.onChange!({ target: { value: '0' } })
    expect(button(render(), 'Maak voorstel').disabled).toBe(false)
    await button(render(), 'Maak voorstel').onClick!()
    expect(JSON.parse(fetch.mock.calls[0][1].body).options).toMatchObject({ scope: 'all', profileCount: 0, programCount: 2, lookCount: 0 })
    requestInputs(render()).find(input => input['aria-label'] === 'Aantal animaties')!.onChange!({ target: { value: '0' } })
    expect(button(render(), 'Maak voorstel').disabled).toBe(true)
  })
  it('keeps scoped replacement scoped instead of forcing a complete collection', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: 'test' }, { status: 502 })); vi.stubGlobal('fetch', fetch)
    requestInputs(render()).find(input => input.value === 'all')!.onChange!({ target: { value: 'colorProfiles' } })
    requestInputs(render()).find(input => input.value === 'new')!.onChange!({ target: { value: 'replace' } })
    await button(render(), 'Maak voorstel').onClick!()
    expect(JSON.parse(fetch.mock.calls[0][1].body).options).toMatchObject({ scope: 'colorProfiles', replace: true, profileCount: 8, programCount: 0, lookCount: 0 })
  })
  it('explains generic legacy input errors without asserting a runtime mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Ontwerpaanvraag heeft ongeldige of ontbrekende velden.' }, { status: 400 })))
    await button(render(), 'Maak voorstel').onClick!()
    expect(text(render())).toContain('niet naar het AI-model')
    expect(text(render())).toContain('mogelijk niet bij elkaar')
    expect(text(render())).toContain('herstart de lokale runtime')
  })
  it('reads a bounded local timeout preference and captures it in the request outside show data', async () => {
    vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'lightlab-ollama-timeout-minutes' ? '45' : null })
    const fetch = vi.fn().mockImplementation(async () => Response.json({ error: 'test' }, { status: 502 })); vi.stubGlobal('fetch', fetch)
    await button(render(), 'Maak voorstel').onClick!()
    const sent = JSON.parse(fetch.mock.calls[0][1].body)
    expect(sent.ollamaTimeoutMinutes).toBe(45)
    expect(sent.show).toEqual(initialShow)
    harness.values = []
    vi.stubGlobal('localStorage', { getItem: () => '999' })
    await button(render(), 'Maak voorstel').onClick!()
    expect(JSON.parse(fetch.mock.calls[1][1].body).ollamaTimeoutMinutes).toBe(15)
  })
  it('ignores a response arriving after cancellation even when fetch does not reject', async () => {
    const response = deferred<unknown>(), json = vi.fn()
    vi.stubGlobal('fetch', vi.fn(() => response.promise))
    const pending = button(render(), 'Maak voorstel').onClick!()
    expect(requestInputs(render()).length).toBeGreaterThan(0)
    expect(requestInputs(render()).every(props => props.disabled)).toBe(true)
    button(render(), 'Annuleer aanvraag').onClick!()
    expect(requestInputs(render()).every(props => !props.disabled)).toBe(true)
    response.resolve({ ok: true, json })
    await pending
    expect(json).not.toHaveBeenCalled()
    expect(text(render())).toContain('Aanvraag geannuleerd')
  })
  it('ignores stale JSON and does not clear the newer request pending state', async () => {
    const oldJson = deferred<string>(), newerResponse = deferred<unknown>()
    const oldResponse = new Response(new ReadableStream({ async start(controller) { controller.enqueue(new TextEncoder().encode(await oldJson.promise)); controller.close() } }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(oldResponse).mockImplementationOnce(() => newerResponse.promise))
    const oldRequest = button(render(), 'Maak voorstel').onClick!()
    await Promise.resolve()
    button(render(), 'Annuleer aanvraag').onClick!()
    const newRequest = button(render(), 'Maak voorstel').onClick!()
    // Intentionally malformed: a stale response must never reach proposal validation.
    oldJson.resolve(JSON.stringify({ summary: 'OLD RESULT', trace: { version: 1, provider: 'ollama', model: null, attempts: [], truncated: false } }))
    await oldRequest
    expect(button(render(), 'Ontwerp wordt gemaakt…').disabled).toBe(true)
    expect(text(render())).not.toContain('OLD RESULT')
    newerResponse.resolve(Response.json({ error: 'Current request error' }, { status: 502 }))
    await newRequest
    expect(text(render())).toContain('Current request error')
    expect(button(render(), 'Maak voorstel').disabled).toBe(false)
  })
  it('retains raw trace for rejection and clears it on demand and on a new request', async () => {
    const trace = { version: 1, provider: 'ollama', model: 'test', truncated: false, attempts: [{ requestBody: '<script>private request</script>', responseBody: 'RAW REJECTION', responseStatus: 200, requestTruncated: false, responseTruncated: false, redacted: false }] }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ error: 'Rejected', trace }, { status: 502 })))
    await button(render(), 'Maak voorstel').onClick!()
    expect(text(render())).toContain('RAW REJECTION')
    button(render(), 'Wis diagnose').onClick!()
    expect(text(render())).not.toContain('RAW REJECTION')
    await button(render(), 'Maak voorstel').onClick!()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    button(render(), 'Maak voorstel').onClick!()
    expect(text(render())).not.toContain('RAW REJECTION')
    button(render(), 'Annuleer aanvraag').onClick!()
  })
})

describe('candidate WebGL recovery', () => {
  it('localizes initialization failure and retries without discarding its input show', () => {
    const show = structuredClone(initialShow), before = JSON.stringify(show)
    const view = { update: vi.fn(), dispose: vi.fn() }
    harness.simulator.mockImplementationOnce(function () { throw new Error('WebGL unavailable') }).mockImplementationOnce(function () { return view })
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123))
    const cancel = vi.fn(); vi.stubGlobal('cancelAnimationFrame', cancel)
    const render = () => { harness.cursor = 0; harness.effects = []; return CandidatePreview({ show, lookId: show.activeLookId }) }
    render()
    // Supply the DOM ref as React would before running the mounted effect.
    ;(harness.values[0] as { current: unknown }).current = {}
    expect(() => harness.effects[0]()).not.toThrow()
    const failed = render()
    expect(text(failed)).toContain('Je voorstel blijft beschikbaar')
    button(failed, 'Preview opnieuw starten').onClick!()
    render()
    const cleanup = harness.effects[0]() as () => void
    expect(text(render())).not.toContain('De 3D-preview kon niet starten')
    expect(view.update).toHaveBeenCalledOnce()
    cleanup()
    expect(cancel).toHaveBeenCalledWith(123)
    expect(view.dispose).toHaveBeenCalledOnce()
    expect(JSON.stringify(show)).toBe(before)
  })
})
