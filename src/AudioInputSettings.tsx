import type { Dispatch, SetStateAction } from 'react'
import type { ShowDocument } from './domain'

export function AudioInputSettings({
  show,
  onChange,
}: {
  show: ShowDocument
  onChange: Dispatch<SetStateAction<ShowDocument>>
}) {
  return (
    <details className="audio-input-settings">
      <summary>Live-ingang voorbereiden · nog niet beschikbaar</summary>
      <p>
        WAV afspelen en analyseren werkt hieronder. Een directe Dante-/audio-ingang en fysieke MIDI-ontvangst zijn nog
        niet actief. Deze instellingen bewaren alleen je gewenste aansluiting.
      </p>
      <div className="audio-settings">
        <label>
          Gewenste bron
          <select
            value={show.sync.source}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                sync: { ...current.sync, source: event.target.value as ShowDocument['sync']['source'] },
              }))
            }
          >
            <option value="direct-audio">Directe audio / Dante-input</option>
            <option value="midi-clock">MIDI Clock</option>
            <option value="tap-tempo">Tap tempo</option>
          </select>
        </label>
        <label>
          Audioapparaat
          <input
            value={show.sync.audioDeviceName}
            onChange={(event) =>
              onChange((current) => ({ ...current, sync: { ...current.sync, audioDeviceName: event.target.value } }))
            }
          />
        </label>
        <label>
          Lichtoffset (ms)
          <input
            type="number"
            min={-60000}
            max={60000}
            value={show.sync.lightingOffsetMs}
            onChange={(event) => {
              const value = event.target.valueAsNumber
              if (Number.isFinite(value) && Math.abs(value) <= 60000)
                onChange((current) => ({ ...current, sync: { ...current.sync, lightingOffsetMs: value } }))
            }}
          />
        </label>
      </div>
      <p className="muted">Bewaard in show · geen verbinding of output geactiveerd.</p>
    </details>
  )
}
