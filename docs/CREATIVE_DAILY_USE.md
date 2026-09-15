# Creative features and daily use

## Scope and sequence

Historical user decision for this creative wave: postpone physical DMX, WING/MIDI and Dante. The subsequent requested [continuous network-output implementation](NETWORK_OUTPUT.md) now adds explicit runtime sACN/Art-Net streaming; WING/MIDI, Dante and hardware acceptance remain open. This does not narrow the full product goal.

This foundation wave covered minimum-light coverage, active palette roles, selectable partial-blackout groups, actual AI request/response inspection, a named show library with version recovery, and a one-command local launcher. The follow-up now implements transitions, atomic active-package storage, portable referenced fixture definitions and self-contained distribution. Read [current finish/evidence](FINISH_CREATIVE_DAILY.md); the historical verification below is not the current open-work list.

Coverage counts controllable non-haze light points at or above a configured intensity threshold after masters. Explicitly off groups, zero masters, blackout and partial blackout take precedence. Unattainable targets are reported instead of silently overriding operator intent. Existing shows preserve output until these settings are enabled.

## Build tracks

| Track                                     | Coverage                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation                            | Required: shared creative engine + additive saved settings, provider traces, IndexedDB library, version actions, local launcher.            |
| Architecture / maintainability / code     | Required: one shared evaluator, strict transport schemas, request-local traces, separate library adapter; no physical adapter changes.      |
| UX / user perspective / visual design     | Required: progressive disclosure, honest coverage/trace status, safe recovery, keyboard/mobile modal, existing Lightlab styling.            |
| Security / API / compatibility            | Required: no headers/secrets in traces, text-only display, bounded payloads; old shows/packages remain valid.                               |
| Data lifecycle / database / observability | Required: explicit trace clearing/no history, bounded library records/transactions, invalid-item isolation, visible persistence errors.     |
| Performance / testing / validation / risk | Required: deterministic coverage, phase/static priority, storage rejection/cancel/recovery, trace retries, actual browser + runtime checks. |
| Release / documentation                   | Required: launcher prerequisites and ownership/shutdown, web/worker/runtime build together, honest platform gaps.                           |
| Git / dependencies                        | Light: preserve current dirty project, no commits or branches, prefer native IndexedDB/Node/.NET without added packages.                    |
| Compliance                                | N/a: no regulated workflow introduced; local user data remains local except explicit selected AI-provider requests.                         |

Independent agents own creative core, AI trace and library slices. Main agent owns App integration, launcher, cross-review, actual browser validation and acceptance reporting.

## Implemented contracts

- Optional schema1 `regie` stores coverage percent0–100, threshold1–100%, one to four unique active palette roles, and selected existing safety-group IDs. The shared browser/Node evaluator applies it; no second runtime artistic engine. Omission preserves historical output. Fixed-white emitters stay fixed. No evaluated-frame DTO extension is required: coverage status is derived locally from the received frame.
- Coverage counts every controllable non-haze light point, including separately controlled bar heads. Required count is rounded upward; only enough eligible points are raised to threshold. Explicit off, black colors and layer/master/palette caps can make the target unattainable. This differs from recipe `floor`, and from measured lux. Blackout and safety bypass coverage correction.
- Named snapshots and their versions use native IndexedDB, separate from the legacy active-editor keys.32 normal shows plus one dedicated recovery slot prevent a full library blocking every open/restore. Each package is bounded20MB/100versions. Open/restore require a successful recovery write and active-package persistence; failure preserves the editor and explains recovery. Browser/site-data removal can erase the library: export remains necessary.
- Optional AI diagnostics capture the serialized provider body and raw response before proposal validation, including one automatic correction. At most2attempts/128Ki characters per body; hard provider-body limits apply before parsing. Clear/new request/component disposal discards diagnostics. No automatic show/version/library/server-history storage. Explicit exports may include private brief/band data; secret redaction and clipping are visible, so altered text is not claimed byte-exact. [Detailed contract](AI_DIAGNOSTICS.md).

## Local launch

Install prerequisites yourself: Node.js22+, npm dependencies, and .NET10 SDK for building. Running the result needs Node22+ and ASP.NET Core10. Ollama plus a model must already be installed for the default AI provider.

```sh
npm run build:local
npm run check:local
npm run start:local
```

Build compiles the webapp, shared Node worker and Release companion together. Check only verifies prerequisites/files. Start serves the built app at `http://127.0.0.1:5173` and starts its companion at5188. Ctrl+C stops both owned processes; occupied ports fail without stopping their owners. No installs/model downloads, physical activation or browser-data migration is performed. Existing provider environment configuration overrides the Ollama default.

## Accepted cross-review findings

- Recovery capacity: ordinary recovery snapshots consumed the 32-show limit. A separate bounded recovery slot and removal of invalid identifiable entries fix this; capacity/quota regression tests pass.
- Recovery-source safety: direct opening of the reserved recovery entry could overwrite its only durable copy before active persistence succeeded. The recovery entry is now export-only (plus confirmed deletion); export it and use the normal file-import flow to recover. This preserves its source on a failed active write. Library owner reports regression tests passing; combined browser acceptance remains separate.
- AI context/export: field allowlists prevent unknown imported properties entering provider context or diagnostic downloads. Accepted and tested.
- Trace redaction detects bounded nested JSON escapes before clipping; oversized requests are rejected before redaction work and incomplete keyed responses fail closed. Accepted and tested.
- No unresolved reviewer disagreement. Direct recovery opening was rejected in favor of export/import to preserve its source on failure; normal library shows remain directly openable.

## Historical foundation verification

Final verification: 599 Vitest tests in 58 files, one Node launcher test, web/worker/Release runtime builds and the .NET contract harness pass. `npm test` retains worker tests and runs the Node launcher test separately.

`check-creative-daily.js` passed in an isolated real browser: four roles, 80% target and custom safety persisted; native IndexedDB save/open/rename/reload; version restore/delete; desktop 1440px and mobile 390px, dialog focus/Escape and no horizontal overflow. Parent callback tests cover backup ordering, backup rejection, second active-write rollback and dirty-patch protection. File import uses the same recovery path. The two legacy active keys are rollback-protected, not a crash-atomic transaction; the durable recovery snapshot is the fallback.

`check-ai-trace-ui.js` verified a real installed `llama3.2:3b` request (HTTP 200, one attempt, 30,306 request characters and 629 raw response characters): exact rendered bodies include regie/setup, no-store, mobile wrapping and clearing; no proposal acceptance or show mutation. A prior `gpt-oss:20b` request hit the five-minute deadline and showed a recoverable error plus request capture without an HTTP response. The browser test originally used the same deadline and timed out just before that response; its wait now exceeds the provider deadline. Model throughput/artistic quality is not guaranteed.

Launcher prerequisites, occupied-port refusal and actual macOS built-app startup were verified. Built UI and companion health worked; the memory regie test also passed against the launched Release runtime. SIGINT stopped both owned processes and freed their IPv4 ports; the unrelated IPv6 dev server was left intact. Development servers were restored afterwards. No physical output activation or user browser storage was touched.

Residuals: bundle-size warning (~958 kB minified), browser quota/privacy deletion and two-key crash recovery limitations, model-dependent latency, and the existing provider color/Look validation gaps documented in the audit. Library snapshots are not an external backup. No Windows/Linux installation or endurance claim.

Real companion regie acceptance now passes via `node --experimental-strip-types scripts/check-regie-playback.mjs`: a dark recipe receives exactly20/24 lit points at80%, four roles remain present, warmwhite emitters stay fixed, custom wash safety excludes other groups, blackout is zero, and an explicit back-group off creates a shortfall without relighting it. Every sampled state matches a separate built-worker reference at the same beat. The script refuses an active session, stops its own session in cleanup and checks unarmed health before/after; final status was stopped/outputSentfalse. No hardware/output/audio/MIDI endpoints were called. This does not replace UI/platform acceptance.

The above records the foundation state before the [follow-up](FINISH_CREATIVE_DAILY.md), which supersedes its open items and two-key storage limitation. Physical output and WING/MIDI/Dante remain deferred by the user, not implemented or accepted. No complete-product claim follows from either wave.
