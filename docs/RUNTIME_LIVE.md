# Runtime-connected Live

Update: this same Live session can now drive explicit continuous sACN/Art-Net output. See [NETWORK_OUTPUT.md](NETWORK_OUTPUT.md); older no-physical-output statements describe the original memory-only slice, not an armed session.

## Operator layout

The sticky Live transport shows the explicit runtime destination, connected Look, mode controls and reported network-output state. Pending commands fence mode changes; explicit session Stop remains available. On disconnect, output is unknown and no mode is highlighted—loss of a preview is not proof of blackout. Looks and the virtual WING are alternative visible controllers; both remain mounted to retain bank/search state, with group overrides/links/masters below them. Preparation offers loading the editor snapshot as its primary action, with a separate option to connect to an existing session; unavailable runtimes link to connection setup. Recovery and tempo controls remain in advanced settings. Session/tempo, camera settings and audio/output configuration are secondary disclosures. Collapsing audio/output keeps those components mounted and does not detach audio or alter transmission. Starting a show, attaching audio and arming physical output remain separate explicit actions. Snapshot differences and connection errors remain outside disclosures.

## Build plan

Connect the existing Live controls and simulator to the autonomous memory playback session. An explicit source choice preserves offline browser simulation. Runtime mode renders received frames, never a second browser clock. Snapshot geometry/control assignments remain immutable; live changes are session-only. No physical output endpoints are called.

| Track                                         | Coverage                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation                                | Required: atomic preview/snapshot API, shared live-state validation, bounded client/lifecycle, existing control reuse.                                |
| Architecture / maintainability / code quality | Required: runtime authority; reuse creative/group logic, no duplicate engine; independent boundary review.                                            |
| UX / user perspective / visual design         | Required: source choice, explicit start/reconnect/stop, honest session-only labels, responsive controls, no silent fallback.                          |
| Security / API / compatibility                | Required: bounded full-snapshot access under existing loopback policy, strict refs, session/revision fences; additive endpoints preserve old clients. |
| Performance / observability / data lifecycle  | Required: one loaded snapshot and latest frame, sequential bounded polling, no frame history, no raw errors, cleanup on stop/fault.                   |
| Risk / testing / validation                   | Required: stale response/control conflicts, disconnect, no local-show mutation, real process/browser tests, multi-universe parity.                    |
| Documentation / release                       | Required: API and operational distinction; web/worker/runtime update together. Windows/Linux/hardware not assumed tested.                             |
| Dependencies / Git                            | Light: no new dependencies or commits/branches requested; preserve unrelated work.                                                                    |
| Database / compliance                         | N/a: no persistent schema or regulated-data workflow introduced.                                                                                      |

The complete product remains open: physical transport, audio/Dante, WING/MIDI and remaining review goals are not replaced by this slice.

## Runtime Live API

This is an additive extension of [autonomous memory playback](AUTONOMOUS_PLAYBACK.md). Existing Start/Status/Command/Frame contracts remain available. All operations use the existing loopback Host/Origin restrictions; no physical output endpoint is called. Update webapp, worker and companion together.

### Loaded snapshot

`GET /playback/show?sessionId=current-session-id`

```text
{version:1, sessionId:string, show:ShowDocument}
```

The original loaded show is immutable and includes its stage geometry, creative collections and control-surface assignments. Runtime group settings do not modify it. Stop/fault removes the retained snapshot; a missing/stale session returns409. The same session may be reattached after closing/reloading a browser without resending the editor's show.

### Atomic preview

`GET /playback/preview?sessionId=current-session-id`

```text
{
  version:1,
  sessionId:string,
  status:PlaybackStatus,
  frame:EvaluatedFrame,
  controls:{overrides:Record<groupId,LayerChange>,links:string[][]},
  groupIntensities:Record<groupId,number>,
  colorLockId:string|null,
  revision:number
}
```

The complete object represents one published sample. `status.mode` and `status.atBeats` match the frame; revision and Live settings belong to that sample. Frame is never nullable: unavailable/stopped/faulted/stale sessions return409. Preview contains evaluated light values, not DMX packet transmission. The separate `/playback/frame` endpoint retains channel-inspection data.

Initial revision is0, overrides/links are empty, lock isnull and group masters come from the loaded show. Every accepted command advances revision, including Look, mode and BPM; ordinary frame sampling does not.

### Replace transient Live state

`POST /playback/command`, JSON body maximum1MiB, bounded before deserialization:

```json
{
  "version": 1,
  "sessionId": "current-session-id",
  "command": "live",
  "expectedRevision": 5,
  "controls": {
    "overrides": { "wash": { "intensity": 0.7, "rateBeats": 8, "offsetBeats": -2 } },
    "links": [["wash", "back"]]
  },
  "groupIntensities": { "front": 0.8, "wash": 0.6, "back": 0.6, "haze": 0.2 },
  "colorLockId": null
}
```

Example group IDs must be replaced by the exact loaded show groups. This replaces the **complete** transient state, not just the displayed partial override. `groupIntensities` must contain every group exactly once, with finite values0–1. Links contain at least two existing groups, without duplicates or overlapping sets. Linking itself does not copy settings: the existing group helpers apply subsequent edits across linked targets.

Overrides permit only optional `mode`, `programId`, `colorProfileId`, `intensity`, `rateBeats`, `offsetBeats`. Modes are animation/static/off; supplied non-null references must exist in the loaded show. Intensities are finite0–1; durations follow existing compatibility bounds .01–1024 ornull; offsets are finite−64–64. Null duration resolves to1beat. Color lock is explicitlynull or an existing palette ID. Unknown fields, missing envelope fields, malformed numeric types and invalid references are rejected. Boundaries use the shared `assertPlaybackLiveState` helper, and evaluation reuses `livePreview`; there is no second C# creative engine.

Success returns the existing `PlaybackStatus` response. Read the next preview for authoritative revision/controls. Invalid settings return400 and leave the running session unchanged. Stale `expectedRevision` returns409, preventing an older tab from restoring controls after a Look change. Refresh the preview and explicitly reapply the intended edit; do not blindly retry the old full-state payload. Session-ID fencing still applies independently.

Look selection clears overrides and color lock while preserving links/masters. Mode/BPM changes preserve Live state. Runtime masters are session-only, unlike the browser-source masters stored in the editor show. Blackout/safety/Static keep their existing priority over group edits. Stop/new session resets transient state; closing the browser does not.

### Bounds, privacy and lifecycle

Every playback GET response is `Cache-Control: no-store`. The runtime retains one loaded show and the latest immutable preview/channel snapshot, without history or disk persistence. Stop/fault/shutdown clears them. Full-show access includes user-authored band information and route configuration under the same local access policy; it must not be copied into diagnostic logs or external model context. Native local processes remain permitted without authentication.

Start remains limited to2MiB and the worker's bounded2MiB protocol. The browser additionally limits show responses to3MiB and preview responses to1MiB. JSON escaping can expand unusual input; exceeding a client/worker limit fails visibly rather than weakening the bound. Render the received runtime frame directly: do not substitute a browser clock or silently fall back to offline output after a connection error.

### Current evidence

The shared-helper/worker tests cover all runtime modes, linked overrides, masters, color lock, timing, invalid references, large bounded group state and actual Node-process frame parity. Runtime tests cover revision fencing, atomic sample fields, Look reset, invalid-command recovery and retained-state cleanup. All571 tests in53 files, web/worker builds, runtime build and contract harness pass.

`scripts/check-runtime-live-ui.js` verifies the real browser/companion/worker chain: exact frame parity at the server beat, WING screen Look/color/blackout commands, linked masters and timing/offset, two-universe blackout, stale CAS and invalid-reference rejection, unchanged editor storage, snapshot no-store, reload/reconnect and viewer-only network failure. Continuous pointer drag remains enabled throughout and sends exactly one final update. Desktop1440 and mobile390 previews retain their geometry without horizontal overflow. The test session is explicitly stopped; hardware remains unarmed. Existing `check-playback-session.mjs` and `check-dmx-inspection.mjs` regression checks also pass. Browser network errors during intentional failure injection are expected; no JavaScript page errors occurred.

Physical output, platform packaging, Windows/Linux process lifecycle, sustained-load scheduling and hardware synchronization remain unverified. The existing frontend bundle-size warning remains open.

## Operator behavior

Under **3 · Live**, choose **Lokale runtime**, then explicitly start the current show or connect to an already running session. Switching source, workspace or closing the tab disconnects only the viewer. Stop explicitly ends the runtime session. The loaded show and its WING assignments are independent of later editor changes; stop/start to load those changes.

Runtime sliders keep a local draft while dragging and apply on release (or keyboard completion). Exact offsets apply on Enter or leaving the field. This avoids disabling a slider halfway through a gesture or queueing every intermediate value. Camera/brightness/group visibility affect only the viewer; group light behavior, timing and masters affect the runtime session.

## Review synthesis

Accepted: shared creative/live validation, atomic state/frame publication, rendered-revision compare-and-swap, bounded sequential polling, no stale/local fallback, nullable .NET segment compatibility, no-store and explicit immutable-snapshot labels. The independent architecture/security review found no remaining blocker. Its continuous-drag concern was resolved with commit-on-gesture controls and actual pointer validation.

Rejected: continuously resubmitting the whole editor show, optimistic local frame evaluation and unbounded slider-command queues would weaken runtime ownership or recovery. Deferred: hardware transport, audio/MIDI/WING adapters and the remaining full-product goals. No dependency additions, commits, branches or hardware activation were performed; unrelated user changes remain intact.

## Editorshow laden of bestaande sessie verbinden

Live biedt **Laad editorshow in runtime**, ook als al een sessie actief is. De naam en aantallen tonen de huidige editorinhoud; laden gebruikt die volledige show, niet de eerder geladen runtimeversie. **Verbind met bestaande sessie** behoudt juist de huidige runtime-inhoud en tijdelijke bediening. Dezelfde laadactie is beschikbaar in Runtime.

Laden valideert de browseraanvraag vóór een stop, controleert de bekende sessie en stopt die vervolgens vóór het starten van de nieuwe show. De show begint opnieuw op het getoonde tempo; DMX en WAV-koppeling worden niet opnieuw ingeschakeld en tijdelijke live-overrides vervallen. Geen extra bevestigingsvenster: de gevolgen staan naast de laadknop. Dit is geen naadloze overgang of atomaire vervanging. Als starten na een bevestigde stop mislukt, kan de oude show al gestopt zijn; bij een onzeker antwoord wordt niets automatisch herhaald. Servervalidatie kan een nieuwe show nog weigeren.
