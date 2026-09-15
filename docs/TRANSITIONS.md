# Musical Look transitions

Showregie optionally stores `transition:{quantizeBeats:0|1|2|4|8,fadeBeats:0..32}` in schema1. Missing settings or two zero values preserve immediate Look changes. Start moment chooses the next musical boundary (an exact boundary starts immediately); fade duration is musical beats, not wall-clock seconds. BPM changes alter remaining elapsed time without resetting the beat.

`createLookTransitionPlayer` in `src/look-transitions.ts` is the sole transition implementation. Its session-local `evaluate(show,profiles,state,atBeats)` returns `{frame,transition?}`; `reset()` discards transition history on show replacement/disposal. Inputs are immutable and stable between actual edits. The browser and bundled Node worker use the same module; .NET owns time/commands but never interpolates artistic output.

## Behavior

- A changed active Look queues to the configured boundary. The old Look keeps animating until that beat. At the boundary its exact frame becomes the fade source; the new Look continues evaluating against the shared clock.
- A new cue during a queue/fade captures the current mixed frame without a jump, then schedules the new target. Only the latest source/target is retained; no cue timeline or growing queue.
- Interpolation blends emitted RGB weighted by intensity, including separately controlled bar heads. Fixed-white endpoints retain their physical color. Haze follows the fade; static/safety/blackout keep their existing haze-off priority.
- Blackout and safety cancel immediately. An explicit group/master/color/Look edit cancels the transition and applies the requested state immediately; a stored target Look's lower levels fade normally. Same-ID edits do not create a new fade.
- Static during a transition captures the actual mixed frame and cancels the queue/fade. Later operator edits remain usable at the held beat. Resuming automation returns to the selected Look at the live musical phase; it does not resume an abandoned fade.
- Backward seeking resets the player. Reload/import starts fresh; no transition is persisted in shows or historical versions.

Minimum coverage governs evaluated pattern endpoints. Interpolation may temporarily put fewer points above the threshold, especially between disjoint lit sets. The final received/rendered frame supplies the displayed coverage; transitions are not artificially boosted after blending. This is neither lux calibration nor a guarantee of minimum count throughout a fade.

## Individual-kick audio

The shared audio player uses the same transition controller with an optional frame evaluator and animated outgoing source. Both normal endpoints react to each detected kick throughout a fade; an interrupted transition retains only the captured mixed source, not a recursive history. The standalone audio test, browser Live and runtime worker share this behavior. Audio reactions/decay/floor edits apply to live endpoints without restarting a fade; an already captured interruption/held image stays captured. Authored show inputs remain stable: per-tick audio changes are not creative edits.

Individual kicks trigger pulses or eighth-cycle steps; they do not select Looks. Quantization and fade duration use the chosen BPM grid, not actual kick count or next onset. The WAV beat is absolute media seconds × BPM, unlike the free runtime's integrated clock described above. Pause freezes progress; backward seek, reanalysis and kick-mode BPM edits cancel the old transition. Zero-duration settings keep cuts. Exact media timestamps are preserved when converting render beats to seconds to avoid missing a kick through floating-point rounding. All source/target/captured state is bounded to the session and cleared on reset; no new show fields, storage, API or permissions are introduced.

## Runtime diagnostics and compatibility

The worker's successful evaluate response may add `transition:{phase:'queued'|'fading',fromLookId,toLookId,startAtBeats,endAtBeats,progress}`. `.NET` validates typed metadata, known Look references, time bounds and phase/progress consistency before including it in the atomic `/playback/preview` snapshot. The existing `frame` shape remains unchanged. Preview clients accept omitted/null diagnostics from an instant/no-transition state; newer webapp and worker/runtime should be built together to display transition status.

Derived Live inputs are cached by their actual operator state in the worker, so repeated clock samples do not masquerade as edits and cancel a transition. Live master/off edits retain priority and clear the active transition. Neither worker nor controller writes show data, starts hardware or owns an audio clock.

## Verification

Individual-kick extension: 732 Vitest tests plus 10 launcher/distribution tests passed, including irregular-onset fades, exact kick timestamps, pause/hold/interruption, safety/masters, seek/BPM resets and real bundled Node-process parity. Production web/worker build passed (existing large-chunk warning remains). Chromium loaded the local K.IN.WAV, used pulse and step group reactions, and displayed an in-flight Live transition that stayed paused at 33%; desktop and 390px mobile had no horizontal overflow, with no console errors. No physical output or existing runtime session was activated or changed. Review accepted the shared evaluator seam and corrected exact-kick rounding and zero-fade wording. Hardware/endurance acceptance remains separate.

Focused regression tests cover legacy parity, quantized start/cut, intermediate emitted colors, interruption continuity, static capture, later master edits, immediate blackout/safety, reset/seek and saved-setting bounds. A real bundled Node-process test matches the browser controller across queued, fading, interrupted, static and blackout samples. Runtime tests cover typed diagnostic rejection alongside existing monotonic BPM/session tests. Actual browser/companion integration and endurance acceptance are reported separately; no physical synchronization or Windows/Linux acceptance is implied.

### Real companion acceptance and five-minute soak

Run `node --experimental-strip-types scripts/check-transition-endurance.mjs` with the freshly rebuilt companion at port 5188. It refuses an active or armed session, uses only playback/health endpoints, and stops its own session in `finally`. Seed data creates the normal 19-fixture/24-light-point rig with static red/blue endpoints, quantization of 1 beat and a 4-beat fade; this exercises transitions, not worst-case pattern/GPU load.

The real process chain passed quantized queuing, intermediate fade colors, interruption continuity, holding the actual mixed image across elapsed time/BPM changes, immediate blackout and a group-off edit cancelling a fade. Then a 300.086-second memory-only run completed 59 Look cues and 11,486 frames across 3,032 HTTP requests without errors or output activation.

Measured on this Mac during the session shared with a concurrent local-AI acceptance task:

| Measure                      | Observation                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| HTTP response-header latency | median 1.81 ms, p95 2.25 ms, maximum 94.06 ms                          |
| Observed frame-count cadence | median 38.83 Hz, fifth percentile 29.30 Hz                             |
| Node worker RSS              | start 44,720 KiB; end 46,608 KiB; sampled maximum 50,320 KiB           |
| Companion RSS                | start 65,616 KiB; end 180,592 KiB; intermediate drops and later growth |
| Worker lifecycle             | one worker throughout; zero direct child processes after explicit Stop |

The cadence is not browser FPS or a guaranteed 40 Hz deadline. Companion memory did not demonstrate a plateau; AI overlap and managed allocation/collection are confounders. This run is not proof of leak-free endurance, maximum-capacity performance or cross-platform behavior. A longer isolated profile remains necessary. Cleanup confirmed stopped/output-disabled state and unarmed health; no hardware endpoints were called.
