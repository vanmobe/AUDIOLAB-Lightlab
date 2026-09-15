# Finish creative features and daily use

User scope: finish items 3/4; physical output, audio/Dante and physical WING remain deferred. Current implementation is not a reduced product goal.

## Plan and boundaries

1. AI: request-local Ollama timeout 1–60 minutes, default 15; one bounded corrective retry shares the deadline, cancellation and explicit busy response; remove redundant input and complete runtime validation.
2. Show regie: shared beat-quantized Look transitions and fades, exact browser/worker behavior, immediate operator-off/blackout priority, visible queued/fading state.
3. Daily data: a single canonical active package write, guarded legacy migration and recovery; portable referenced fixture catalog with compatibility checks.
4. Distribution: self-contained host package with Node and published .NET, no dependency installation at launch, explicit start/stop, verification manifest and packaged-process smoke test. Cross-platform build scripts are not cross-platform acceptance.
5. Validation: independent cross-review, full automated suite, real browser workflows, local Ollama request beyond the old limit if practical, repeated session/preview lifecycle and measured endurance. Do not claim unmeasured or inaccessible platform results.

## Build tracks

Implementation, architecture, maintainability, code quality, UX, visual consistency, API/compatibility, security, data lifecycle, performance, testing, validation, risk, release and documentation: **required**. Separate agent ownership for AI, transitions, and data; parent owns browser integration, distribution and final evidence. Reviews cross these ownership boundaries.

Delivery/git and dependencies: **light**; preserve existing untracked user project, no commits/branches/pushes, no new frontend packages planned. Bundled runtimes require provenance/license and release verification.

Compliance: **n/a** beyond existing local/private context and diagnostics controls; no regulated workflow introduced. Hardware acceptance: **n/a for this request**, explicitly deferred by user, not fulfilled.

## Compatibility decisions

- New regie fields are optional schema-1 settings; omitted transitions remain instantaneous.
- Master/off/safety actions must never wait for a musical boundary or be defeated by an old fading frame.
- Canonical active storage supersedes legacy keys only after valid migration; corrupt canonical data blocks writes rather than silently selecting older data. Export before downgrading.
- A portable catalog protects meaning across app versions; it does not authorize arbitrary imported DMX executors or claim new fixture support.
- Packaging does not download Ollama models, activate output, or migrate browser-origin data silently.

## Evidence and residuals

Implemented and locally verified on macOS arm64, 2026-09-14. No physical output was activated; user browser storage was not used for testing.

### Delivered

- Optional musical Look boundaries and fades, shared browser/Node implementation, visible queued/fading state in studio/browser Live/runtime Live. Static captures the mixed frame; blackout/safety/off/operator edits retain priority. Coverage text explicitly distinguishes a temporary fade shortfall. [Contract](TRANSITIONS.md).
- Ollama defaults to15minutes, configurable1–60 locally, elapsed-time feedback and cancellation. One corrective attempt shares the deadline; concurrent generation returns429 instead of creating an unbounded queue. Removed duplicate schema text, scoped output budget and strengthened palette/Look validation. [AI contract/evidence](AI_DIAGNOSTICS.md).
- Current show and all versions commit with one canonical storage write. Guarded legacy migration preserves original keys; invalid canonical data blocks overwrite. Autosave failure produces persistent unsaved feedback and tab-close protection. Portable packages include referenced fixture definitions/fingerprints and reject incompatible reinterpretation. Named library recovery remains separate. [Storage](show-library.md), [portable assets](portable-show-packages.md).
- Host-native standalone package bundles Node22.23.1/.NET10.0.3, web/worker/runtime, licenses, launcher and bounded whole-package integrity verification. No dependencies/models downloaded at startup. Routine HTTP poll logging is suppressed by appsettings; lifecycle and warnings/errors remain. [Usage/rollback](LOCAL_DISTRIBUTION.md).

### Verification

- `npm test`:630frontend tests in60files plus10Node launcher/distribution tests. `npm run build:local` and complete Release .NET contract harness pass. Production frontend966.97kB minified/271.51kB gzip; existing large-chunk warning remains.
- Independent cross-reviews fixed manifest symlink/actual-size preflight, Node external-library preflight, worker transition metadata validation, camera/link-only fade cancellation and autosave unload protection. No known unaddressed blocker in these implemented slices.
- Isolated real browser: native IndexedDB save/open/rename/reload, atomic active/version restore/delete, desktop/mobile/focus; transition queue/fade completion, live blackout cancellation, local timeout reload,20repeated studio/Live scene cycles without page errors; screenshots visually checked. Runtime Live regression passes parity, WING screen actions, linked masters/timing, conflict fencing, immutable editor storage and disconnect/reconnect/reload. Scripts: `check-creative-daily.js`, `check-transition-ui.js`, `check-runtime-live-ui.js`.
- Real local `gpt-oss:20b`: HTTP200 in49seconds, one valid palette/oneattempt, configured15minute limit,20,577request characters,9,684raw response characters, complete trace. Setup,80%coverage/fourroles and scoped4096tokenbudget verified. This small successful request does not prove a large collection completes before any chosen deadline; synthetic tests cover timeout bounds/cancellation.
- Real companion five-minute run:300.086seconds,59Look cues,11,486frames,3,032HTTP calls; header latency median1.81ms/p95 2.25ms/max94.06ms. Measured frame cadence median38.83Hz (not GPU FPS). Queue/fade/interruption/static/BPM/blackout/off behavior passed. One worker retained and zero afterstop. Worker RSS44,720→46,608KiB; companion RSS65,616→180,592KiB with prior drops. This is not a leak-free/steady-memory proof or isolated benchmark. [Detailed limits](TRANSITIONS.md).
- Final standalone package started with empty inherited environment, PATH only `/usr/bin:/bin`, invalid DOTNET_ROOT and multilevel lookup disabled. Actual loaded libcoreclr/libhostpolicy paths were inside the package. Built browser canvas and health loaded; real regie/worker-parity test passed, output stayedunarmed. SIGINT closes owned web/runtime processes. Existing unrelated IPv6 Vite server is left intact; development servers restored after acceptance.

Final macOS artifact: `output/releases/Lightlab-osx-arm64-2026-09-14-final.zip` (includes folder `Lightlab-osx-arm64-2026-09-14T09-34-31-990Z-1794f7`). Integrity manifest is inside; distribution hashes are corruption checks, not authentication.

ZIP SHA-256: `c18a9a1b2868c97d5e86056f2e1ff0c48a27651e06096324dc6d288696e302a0`.

### Remaining acceptance / explicit limits

- Windows/Linux native builds and tests, publisher signing/notarization, full-evening/max-capacity profiling and an isolated long memory plateau have not been proven on this machine. No signed installer, cross-platform acceptance or all-night guarantee is claimed.
- Use one writing browser tab. Concurrent-tab conflict resolution, browser quota/privacy deletion and external backups remain operational constraints; IndexedDB/localStorage are not a filesystem backup.
- Fixture snapshots preserve the installed supported definitions, not arbitrary imported fixture executors. New fixture support still follows the reviewed definition workflow.
- Physical sACN/Art-Net, WING/MIDI and Dante/audio acceptance remain the user's deferred1/2, not fulfilled by these simulator/runtime checks. The whole original product goal is not declared complete.
