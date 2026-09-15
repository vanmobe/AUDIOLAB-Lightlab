import type { EvaluatedFrame, RuntimeState, ShowDocument } from './domain'

/** Browser-safe contracts. Native implementations live in the local companion runtime. */
export interface LightingOutputAdapter {
  readonly id: string
  readonly protocol: 'artnet' | 'sacn'
  arm(show: ShowDocument): Promise<void>
  send(frame: EvaluatedFrame): Promise<void>
  disarm(): Promise<void>
}

export interface ControlSurfaceAdapter {
  readonly profile: { id: string; name: string; rotaryMode: 'absolute' | 'relative' }
  onCommand(listener: (command: RuntimeCommand) => void): () => void
}

export type RuntimeCommand =
  | { type: 'select-look'; lookId: string }
  | { type: 'set-mode'; mode: RuntimeState['mode'] }
  | { type: 'set-group-intensity'; groupId: string; value: number }

export const wingProfiles = [
  {
    id: 'wing-rack',
    name: 'Behringer WING Rack',
    rotaryMode: 'relative' as const,
    banks: 16,
    buttons: 8,
    rotaries: 4,
    buttonColumns: 4,
  },
  {
    id: 'wing-compact',
    name: 'Behringer WING Compact USER',
    rotaryMode: 'relative' as const,
    banks: 1,
    buttons: 16,
    rotaries: 0,
    buttonColumns: 4,
  },
  {
    id: 'wing-full',
    name: 'Behringer WING',
    rotaryMode: 'relative' as const,
    banks: 16,
    buttons: 8,
    rotaries: 4,
    buttonColumns: 4,
  },
]
