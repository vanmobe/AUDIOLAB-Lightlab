# AI request diagnostics

In Ontwerpstudio, open **AI-aanvraag en antwoord bekijken**. Diagnostic capture is enabled for the next request by default; it is optional and never persisted. The panel contains the actual serialized provider request body, not a reconstructed prompt, and the raw provider response envelope before proposal validation. An automatic Ollama duplicate-recipe correction appears as a second attempt with its own full conversation, schema and response.

Failed, refused or invalid model answers retain diagnostics too. Cancellation does not fetch a result afterward. A new request clears the previous trace immediately; **Wis diagnose**, disabling capture or leaving the component discards it. **Download diagnose** explicitly exports JSON and may contain private band, show and brief text. No trace is written to show files, versions, library, filesystem or shared server history. Provider choice still determines where the actual AI request goes; capture does not change that destination.

## API

`POST /ai/propose` retains the existing intent/options/show/model fields and adds optional `includeTrace:boolean` (default false for existing clients). JSON request bodies are bounded to 2 MiB before deserialization; malformed bodies return 400, excess size 413, wrong content type 415. The response is `Cache-Control: no-store`.

`ollamaTimeoutMinutes` is an optional integer from 1 through 60 (default 15). It is captured per request; the initial generation and any single corrective turn share one deadline. The installed-model lookup remains separately bounded to ten seconds. The UI offers this preference next to generation controls, persists it locally outside the show, and displays elapsed seconds plus the chosen limit. Cancellation keeps the show untouched; late replies cannot replace newer requests. There is no automatic cloud fallback or additional retry.

Only one Ollama generation per runtime is admitted at a time. A simultaneous JSON request receives 429 with an actionable busy message; negotiated streaming returns a terminal `ai_busy` error instead, immediately rather than joining an unbounded queue. Cancellation/failure releases admission. The gate does not coordinate other applications directly calling Ollama or a second runtime process.

## Live activity (2026-09-14)

The browser opts in with `Accept: application/x-ndjson` on the same POST. Existing clients retain JSON responses. Request-decoding failures retain their JSON HTTP errors. Once streaming starts, clients must inspect the terminal event, not just HTTP200:

- `{"type":"progress","phase":"waiting|thinking|generating|validating|correcting","attempt":1}` with optional nullable `thinking`/`content` text deltas and `clipped` flag.
- `{"type":"heartbeat"}` every five seconds indicates runtime contact, **not model activity**.
- Exactly one successful `{"type":"result","result":...}` or failed `{"type":"error","error":"...","trace":...,"code":"..."}` terminal event. Disconnect/cancellation can end without a terminal event and must never apply partial data.

Ollama uses native `stream:true`; only actual thinking/content channels drive model-activity feedback. Other providers expose general waiting/validation only. There is no fabricated percentage or exported OpenAI hidden reasoning. The optional, collapsed raw preview is untrusted provisional text, never executable content. It is cleared on cancellation, completion, replacement or component disposal; it is not saved to shows. Completed diagnostics remain separately controlled above.

Native Ollama transport is bounded to16MiB wire,128KiB per line and2MiB assembled content. Actual NDJSON traces retain the existing128Ki-character limit. Preview deltas share32Ki characters across both attempts, throttled to about100ms; after clipping, text-free model activity continues at most once per second. Awaited writes propagate backpressure and abort; no global job queue or history. The browser bounds transport to8MiB and individual buffered messages to6MiB and fences obsolete callbacks. An incomplete or malformed stream is distinct from an initial runtime connection failure.

This makes slow work observable, not faster or more capable. Large collections can still exceed model/context/output capacity; a longer timeout cannot fix that. GitHub Copilot was added in the subsequent provider integration; see [Copilot setup and API](COPILOT_INTEGRATION.md). Its diagnostics capture application SDK input and received assistant text, not raw internal cloud HTTP, and it has no automatic paid corrective retry.

Validation:642 frontend tests,10 launcher tests, production web/engine build and full Release runtime harness passed. Independent review covered nullable wire fields, bounded buffers, activity after clipping, error semantics and cancellation. `scripts/check-ai-stream-ui.js` observed real `gpt-oss:20b` thinking before a valid single-palette proposal; desktop/mobile screenshots have no horizontal overflow. A second real request was cancelled during model activity; pending output cleared, submit recovered and isolated browser show storage remained unchanged. No proposal was accepted and runtime stayed unarmed. The user's8/16/32 replacement request was not rerun; no maximum-collection capacity claim. Existing distribution ZIP was not regenerated.

The native `format` schema remains authoritative and is no longer repeated verbatim in system prose. Output token allowance scales from 4096 to 32768 with selected profile/program/Look counts and group count; full recipes retain generous headroom. This reduces unnecessary allowance for small color-only requests, not the permitted artistic schema. No measured latency improvement is claimed; installed model capability, context pressure and rig/collection size still matter. Explicit length refusals suggest smaller requests instead of accepting incomplete JSON.

The server now additionally enforces generated palette and Look identity/name/closed-field rules, four hex colors, intensity bounds, and known unique program-group references. Replacement/new requests require new IDs; revisions retain existing IDs. Existing malformed fake-provider fixtures were corrected to schema-valid examples; invalid real provider responses are rejected rather than passed to the browser for the first validation.

When requested, success adds `trace`; provider failures return `{error,trace}` with the existing 400/502/504 semantics. Failures before provider initialization may have no trace. Offline templates do not contact a provider and have no provider trace.

```ts
interface Trace {
  version: 1
  provider: string
  model: string | null
  truncated: boolean
  attempts: Array<{
    requestBody: string
    responseBody: string | null
    responseStatus: number | null
    requestTruncated: boolean
    responseTruncated: boolean
    redacted: boolean
  }>
}
```

At most two attempts are captured, with 128 Ki characters retained per body. Provider request and streamed response bodies have a hard 2 MiB UTF-8 limit before parsing. Truncated or incomplete text is explicitly marked and is not claimed to be a complete exchange. A request body recorded without response status may have failed before sending. Authorization headers are never captured; occurrences of the configured API key in body text are redacted and flagged, so redacted text is not byte-exact. The web client bounds the combined JSON response to 6 MiB before parsing and validates trace shape/limits. Trace output is React text, never evaluated HTML.

Encoded credential echoes (including nested JSON Unicode escapes) withhold the affected body instead of attempting to preserve its formatting. With a configured API key, incomplete responses are also withheld to avoid exposing a partial credential. Escape decoding has a bounded depth and fails closed. The browser reconstructs only documented trace fields for display/export and derives the aggregate truncation flag from attempts.

Setup `regie` context forwards bounded coverage percent/threshold, selected palette roles and known safety-group IDs. This setup-owned context cannot be generated by the model. Coverage is a percentage of controllable light points above a threshold, not lux; explicit off/master/blackout choices retain priority.

## Verification

Automated checks cover exact serialized request equality, both Ollama corrective attempts, raw failed responses, opt-in compatibility and request isolation, key redaction before clipping, hard body bounds, frontend malformed traces, cancellation/stale completion, error visibility and explicit clearing. Provider tests use fake HTTP handlers, not paid or hardware calls. Actual browser integration and a real selected-model run are separate acceptance checks; no cross-platform or physical acceptance is implied.

On 2026-09-14, `node --experimental-strip-types scripts/check-ollama-timeout.mjs` passed against the rebuilt Release runtime and installed `gpt-oss:20b`: HTTP200 in49seconds, explicit15-minute limit, one attempt, one valid palette and no programs/Looks. The untruncated trace contained20,577 request characters and9,684 response characters. The script verified native schema without duplicated system schema,4096 output allowance, coverage80%/four-role context and no-store. It made no acceptance, persistence or output calls and did not save raw traces. An initial400 occurred against an older Release binary before any model invocation; rebuilding/restarting resolved it. This small successful request does not prove maximum collection throughput or that a15-minute timeout is reached correctly in real time.
# Request input errors (2026-09-14 follow-up)

After restarting the corrected Release runtime, a real `gpt-oss:20b` palette request succeeded HTTP200 in30seconds/oneattempt with complete trace (20,577request/6,496response characters). Proposal was not accepted; no user show or physical output changed.

`POST /ai/propose` validates the bounded request envelope before provider execution. Known malformed/missing fields now return HTTP400 with an authored Dutch field label and correction, plus `code: invalid_ai_request`, `stage: request`. No provider trace exists at this stage. Unknown envelope/options keys give a possible webapp/runtime compatibility hint without reflecting private key names. Invalid JSON, deep structures and duplicate keys receive a safe structural error, never raw serializer text. Body limits/content-type responses remain413/415.

The browser sends zero for counts outside the chosen scope, preserving the editable drafts. This fixes a reproducible case where a fractional count became hidden after changing scope but was still sent to the strict integer decoder. Invalid active counts still block submission. An older runtime's exact generic400 now gets a pre-provider explanation and same-version/restart guidance, not a claim that a particular user field is missing.

Reviewed across implementation/API, compatibility, security/bounded transient diagnostics, UX/layout and tests. No new persistence, dependencies, physical controls or git mutations. Runtime tests cover current/legacy envelopes, count/time boundaries, missing/type errors, duplicate/private properties, nesting and size; two frontend regressions went red before the fix.632frontend+10Node tests and Release builds/harness pass. Real browser `scripts/check-ai-input-ui.js` exercises hidden drafts and actual runtime400 feedback using deliberate bad-input injection (no model invocation), unchanged show storage and desktop/mobile layout. The actual cause of the user's original payload is not established without that payload; the decoder location and hidden-draft bug are confirmed. Semantic show-context validation after parsing remains a separate validation phase.
