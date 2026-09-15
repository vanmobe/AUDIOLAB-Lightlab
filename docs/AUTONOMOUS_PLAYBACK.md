# Autonomous runtime playback — memory only

Historical foundation: the memory-only default still applies to Start, but explicit continuous network output has since been added. Read [NETWORK_OUTPUT.md](NETWORK_OUTPUT.md) for current arm/disarm, stop/fault behavior and the boolean `outputSent` contract; it supersedes the no-output statements below when output is armed.

This slice runs the existing TypeScript creative engine independently of the browser. The .NET companion owns the monotonic clock, session and trusted DMX compilation; a supervised Node worker evaluates the loaded show. Compiled universes are retained **in memory only**. No playback endpoint arms or sends UDP, and all responses report `outputSent: false`.

This is not Dante/audio synchronization, MIDI/WING input, physical fixture verification or a complete live-output sender. The existing raw `/output/arm`, `/output/frame` and `/output/disarm` endpoints are separate: stopping playback does not control that independent low-level session.

## Prerequisites and launch

Use Node.js22+ and the .NET10 SDK for development. Build the evaluator from the repository root before starting the companion:

```sh
npm run build:engine
dotnet run --project runtime
```

`npm run build` also builds the evaluator. The generated standalone ESM file is `runtime-worker/dist/engine.mjs`; it shares the existing domain/pattern/validation code and does not import the UI or simulator.

The companion launches `node` from its process environment. Set `LIGHTLAB_NODE_PATH` to an explicit executable path when Node is not on that PATH. `LIGHTLAB_WORKER_PATH` overrides the absolute worker-file location. The default resolves `../../../../runtime-worker/dist/engine.mjs` from the .NET application's base directory, matching the development build layout. A published/custom installation must supply the worker and configure its path. There is no runtime package installation, shell execution or model download.

Build the webapp, worker and companion together when the shared engine/protocol changes. Existing show-file schema remains unchanged.

## Session lifecycle

One session may be starting/running. Start uploads a show snapshot once; the worker validates it, the companion validates its physical patch, and the first frame must compile successfully before status becomes `running`. Unsupported personalities or overlapping addresses block start. Missing/disabled routes remain inspectable because there is no transmission; manual-backed personalities remain physically unverified.

The operational budget is256 fixtures and256 total visual heads, with the existing inspector's trusted personality/head checks. This does not narrow saved-show import limits. Large shows can remain editable but fail runtime startup.

The companion integrates monotonic elapsed time at the selected manual BPM. After each sequential evaluation/compilation it waits25ms before the next sample. This targets at most approximately40Hz; evaluation time lowers the actual rate. Missed samples are not queued or replayed. A BPM change preserves accumulated beat phase; Static captures the runtime beat, while Blackout forces all compiled channels to zero. Choosing a Look returns to automation.

Closing or reloading the browser does **not** stop a successfully started session. Only explicit Stop, worker failure, invalid returned data or companion shutdown ends it. The loaded show is immutable: browser edits require stopping and starting a new snapshot. No show is autoloaded after companion restart.

Worker exchanges have a two-second deadline and2MiB line limit. On failure, status becomes `faulted`, the worker is released and the last memory frame is discarded. Stop is idempotent for the current session ID and discards the frame. Neither operation promises physical blackout. Only the latest snapshot is retained—no frame history, diagnostics archive or persistent playback session.

## HTTP contract

Base URL: `http://127.0.0.1:5188`. The existing Host/Origin policy applies: only the configured localhost/127.0.0.1 browser origins on5173 are accepted; native loopback clients without Origin remain permitted. This is not authentication of local processes.

Bodies require JSON with exact property names, required fields and numeric values (numeric strings are rejected). Unknown or duplicate fields are rejected. Version is1.

### Start

`POST /playback/start`, maximum2MiB, including chunked requests:

```json
{ "version": 1, "show": {}, "bpm": 120, "lookId": "existing-look-id" }
```

Replace the illustrative empty `show` with a complete valid ShowDocument. `bpm` is finite30–240; `lookId` must identify a Look in that snapshot. An active session causes409; there is no implicit replacement.

### Status

`GET /playback/status`, and successful Start/Command, return:

```json
{
  "version": 1,
  "sessionId": null,
  "status": "idle",
  "mode": "automation",
  "lookId": null,
  "bpm": 120,
  "atBeats": 0,
  "frameCount": 0,
  "universeCount": 0,
  "outputSent": false,
  "error": null
}
```

Status is `idle`, `starting`, `running`, `stopped` or `faulted`. Session IDs are server-generated and change on restart. Beat/frame count describe sampled runtime progress, not audio synchronization or network delivery. `error` contains authored diagnostic text, never raw worker stderr. Reconnecting clients should read this endpoint before attempting Start again.

### Commands

`POST /playback/command`, maximum1MiB. Send one operation-specific field, none for Stop, or the complete Live-state envelope described below:

```json
{ "version": 1, "sessionId": "current-session-id", "command": "look", "lookId": "existing-look-id" }
```

Other forms: `command:"bpm", bpm:30..240`; `command:"mode", mode:"automation"|"static"|"safety"|"blackout"`; `command:"stop"`. Fields belonging to other operations are rejected. Unknown Look IDs do not silently fall back.

Commands are serialized and fenced to the active session ID. Stale IDs return409; there is no request-sequence/idempotency-key protocol. An accepted command is owned by the runtime and continues if its HTTP connection closes. Stop can be repeated for the same session ID.

`command:"live"` atomically replaces transient group overrides, links, masters and color lock, guarded by `expectedRevision`. It uses the shared TypeScript Live validator and renderer; invalid settings return400 without faulting or changing the session. A stale revision returns409. Every accepted command, including Look/BPM/mode, advances the revision, so another tab cannot restore controls from before a Look change. Pump frames do not advance it. See the [complete Live contract](RUNTIME_LIVE.md#runtime-live-api).

Look selection clears overrides and color lock, preserving group links and session masters. Runtime masters are not written back to the editor show; they reset to the loaded show values on a new session.

### Reconnect and atomic Live preview

`GET /playback/show?sessionId=...` returns `{version:1,sessionId,show}` for the running session's original immutable ShowDocument. It is not a live-edited show export.

`GET /playback/preview?sessionId=...` returns `{version:1,sessionId,status,frame,controls,groupIntensities,colorLockId,revision}`. The status, frame and controls come from one completed evaluation; clients must not combine independently polled fields to construct this view. Frame is non-null. Both endpoints return409 when the requested session is stale or unavailable.

All playback GET responses carry `Cache-Control: no-store`, including status/frame. The full show remains within the authorized local runtime/browser boundary and can contain band descriptions and network-route configuration. It is retained only until stop/fault/runtime shutdown, never logged as diagnostics or sent to a model. Runtime transient controls and latest preview are discarded with it. Explicit local-process clients remain trusted; the loopback policy is not per-user authentication.

### Latest frame

`GET /playback/frame?sessionId=current-session-id` returns:

```text
{version:1, sessionId, frame:EvaluatedFrame, inspection:InspectionResult}
```

Inspection uses the [existing DMX inspection contract](OUTPUT_FOUNDATION.md): independent512-channel universe arrays, fixture channel labels and warnings. A stale ID or unavailable frame returns409. This endpoint reads a snapshot; it neither advances the clock nor sends data.

### Errors and recovery

- 400: malformed/unknown/missing fields, invalid numeric values or unsupported command choices.
- 409: active session already exists, stale session, stale Live revision or no readable frame.
- 413: request exceeds its byte limit; 415: non-JSON body.
- 503: evaluator startup/evaluation failure; inspect status and prerequisites, then explicitly restart.

Error responses contain an authored `error` string. Show loading/compilation failure may leave a `faulted` status; an invalid request rejected before startup does not replace a running session. HTTP response loss is not proof that Start failed: check status before retrying.

## Validation status

Implemented automated checks cover two-universe memory compilation, autonomous frame-count progression without client requests, monotonic BPM continuity, Static hold, Blackout, session fencing, stop/restart, evaluator failure, wrong returned beat/mode/fixture coverage and client disconnect after accepted commands. Node worker tests independently compare shared-engine results and exercise the bounded protocol.

The runtime build and contract harness pass. Real-process HTTP checks (`node scripts/check-playback-session.mjs`) passed for two universes, BPM, Static, Blackout and session fencing. Browser checks (`scripts/check-playback-ui.js`, via Playwright CLI) passed for explicit start/commands, discovery after reload, reachable Stop with invalid BPM, and desktop1440/mobile390 layout without overflow or browser errors. Cleanup-failure regression confirms that an OS process-cleanup error cannot retain a playable memory frame. Process termination itself is best-effort and bounded. These checks are not full product acceptance. Physical WING/Dante/DMX tests, packaged deployment, Windows/Linux process lifecycle and sustained-load performance remain unverified. Frame cadence is best-effort, not a real-time scheduling guarantee.

## Review synthesis

Accepted: reuse the shared creative engine; .NET owns the clock and trusted encoder; bound IPC, retain only the latest frame, fence session commands, clear memory on every failure, preserve accepted commands after browser disconnect, and hydrate the actual BPM on reconnect without overwriting edits. Independent runtime/worker review found no remaining blocking contract mismatch. OS-cleanup hardening and regressions were included.

Rejected alternative: implementing a second C# pattern engine would introduce semantic drift. A worker-owned clock was also considered; .NET remains the timing authority to keep future audio and transport control in one runtime boundary.

Runtime group controls and atomic Live-preview APIs are now implemented as a subsequent slice; their current validation evidence is tracked in [Runtime-connected Live](RUNTIME_LIVE.md). Physical transport and audio/controller adapters remain open. No branches, commits, pushes or hardware activation were performed. The existing main branch and unrelated user changes were preserved.
