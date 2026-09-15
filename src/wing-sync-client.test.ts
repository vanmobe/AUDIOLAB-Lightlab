import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialShow } from './seed'
import { assignControlBinding } from './control-surface'
import {
  parseWingApply,
  parseWingPlan,
  parseWingProbe,
  requestWing,
  wingAddress,
  wingPlanRequest,
} from './wing-sync-client'

function request() {
  let show = assignControlBinding(initialShow, initialShow.controlSurface.bindings[0], {
    bank: 2,
    kind: 'button',
    index: 3,
  })
  show = assignControlBinding(
    show,
    { id: 'master', label: 'Wash', action: 'group-intensity', targetId: 'wash' },
    { bank: 2, kind: 'rotary', index: 1 },
  )
  show = assignControlBinding(show, initialShow.controlSurface.bindings[1], { bank: 3, kind: 'button', index: 1 })
  return { show, body: wingPlanRequest(show, '10.0.0.10', [2]) }
}
const device = { name: 'Studio', model: 'wing-fullsize', firmware: '3.1' }
function plan() {
  const { body } = request()
  return {
    body,
    value: {
      version: 1,
      address: body.address,
      planId: 'abc',
      device,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      changes: body.bindings.map((binding) => ({
        ...binding,
        before: { type: 'OFF' },
        after: { type: 'MIDI', ch: 2 },
      })),
      warnings: [],
    },
  }
}
afterEach(() => vi.unstubAllGlobals())
describe('WING synchronization boundary', () => {
  it('projects assigned selected slots only without live values, targets or show data', () => {
    const { body } = request()
    expect(body.bindings).toHaveLength(2)
    expect(body.bindings.every((binding) => binding.bank === 2)).toBe(true)
    expect(Object.keys(body.bindings[1]).sort()).toEqual(['bank', 'index', 'kind', 'label'])
    expect(JSON.stringify(body)).not.toContain('targetId')
    expect(JSON.stringify(body)).not.toContain('value')
  })
  it('rejects empty banks, duplicates, unsupported consoles and nonprivate hosts before networking', () => {
    const { show } = request()
    for (const banks of [[], [0], [17], [2, 2], [1.5]])
      expect(() => wingPlanRequest(show, '10.0.0.10', banks)).toThrow()
    expect(() =>
      wingPlanRequest(
        { ...show, controlSurface: { ...show.controlSurface, profileId: 'wing-compact' } },
        '10.0.0.10',
        [2],
      ),
    ).toThrow('Compact')
    for (const address of ['localhost', '127.0.0.1', '8.8.8.8', '10.0.0.256', '10.00.0.10', '10.0.0.10:2223'])
      expect(() => wingAddress(address)).toThrow()
    expect(wingAddress(' 192.168.1.2 ')).toBe('192.168.1.2')
  })
  it('fences stale addresses, out-of-scope and duplicate slots and malformed verification', () => {
    const { body, value } = plan()
    expect(parseWingPlan(value, body).changes).toHaveLength(2)
    expect(parseWingProbe({ version: 1, address: body.address, device }, body.address)).toEqual(device)
    expect(() => parseWingProbe({ version: 1, address: '10.0.0.11', device }, body.address)).toThrow()
    expect(() => parseWingPlan({ ...value, address: '10.0.0.11' }, body)).toThrow()
    expect(() => parseWingPlan({ ...value, changes: [{ ...value.changes[0], bank: 3 }] }, body)).toThrow()
    expect(() => parseWingPlan({ ...value, changes: [value.changes[0], value.changes[0]] }, body)).toThrow()
    expect(() => parseWingPlan({ ...value, expiresAt: 'tomorrow' }, body)).toThrow()
    expect(() =>
      parseWingApply({ version: 1, state: 'applied', verifiedSlots: 1, totalSlots: 2, backup: [] }, 2),
    ).toThrow()
    expect(parseWingApply({ version: 1, state: 'partial', verifiedSlots: 1, totalSlots: 2, backup: [] }, 2).state).toBe(
      'partial',
    )
  })
  it('accepts full-console warnings and no-op plans without padding changes', () => {
    const { body, value } = plan()
    expect(parseWingPlan({ ...value, changes: [], warnings: Array(194).fill('Naam ingekort') }, body).changes).toEqual(
      [],
    )
    expect(() => parseWingPlan({ ...value, warnings: Array(257).fill('Naam') }, body)).toThrow()
  })
  it('does not retry uncertain writes and retains actionable bounded errors', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'De bank is intussen gewijzigd.' }), { status: 409 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(
      requestWing('apply', { version: 1, planId: 'abc', confirm: true }, new AbortController().signal),
    ).rejects.toThrow('De bank is intussen gewijzigd.')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:5188/controllers/wing/apply')
    fetcher.mockResolvedValue(new Response(null, { status: 404 }))
    await expect(requestWing('probe', {}, new AbortController().signal)).rejects.toThrow('bijgewerkte runtime')
  })
  it('rejects oversized replies before parsing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-length': String(512 * 1024 + 1) } })),
    )
    await expect(requestWing('plan', {}, new AbortController().signal)).rejects.toThrow('Ongeldig WING-antwoord')
  })
})
