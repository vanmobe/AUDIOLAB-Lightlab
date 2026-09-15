# GitHub Copilot in Lightlab

## Intended workflow

In **Ontwerp & repetitie → Maak met AI**, choose **GitHub Copilot · cloud** under the always-visible **AI-provider & model** panel. Refresh the models available to your account, choose a model and confirm the cloud-data notice. Use the normal design counts and brief, then **Maak voorstel**. Results remain proposals until explicitly accepted; changing provider clears the pending review, not the show.

Authenticate with the official installed CLI using `copilot login`, then refresh models. Lightlab does not ask for a token. CLI credential storage is managed by GitHub; inspect any CLI storage warnings during login. A Copilot subscription does not imply unlimited usage. The selected model and your account policy/quota determine availability and cost. No automatic provider fallback or automatic paid corrective attempt.

## Runtime contract

`GitHub.Copilot.SDK` is pinned to1.0.13. Build-time CLI download is disabled; the official `copilot` executable must be available on the runtime's PATH. The current macOS installation has CLI1.0.83. This is an optional integration: Ollama/offline startup does not require the CLI to run, and merely opening Lightlab does not contact Copilot unless Copilot is the explicitly configured default.

- `GET /ai/status` retains default provider/model/configured metadata and adds `providers:string[]`. This endpoint does not start the SDK or authenticate.
- `GET /ai/copilot/status` explicitly starts a short-lived local SDK connection and returns `{provider:"copilot",available:true,authenticated:boolean}`; failures return an authored error. It does not log in or generate.
- `GET /ai/models?provider=copilot` returns `{provider:"copilot",defaultModel:null,models:string[]}` from authenticated SDK discovery. Automatic routing and policy-disabled choices are excluded. Missing login/CLI/connectivity returns an actionable error; no substitute model.
- `POST /ai/propose` accepts optional `provider:"copilot"|"ollama"|"openai"|"offline-templates"`; absence retains the runtime default. OpenAI requires configured access. Copilot requires an explicit available `model`. The existing `ollamaTimeoutMinutes` field also bounds Copilot, retaining wire compatibility; the UI labels it AI-tijdslimiet for Copilot.

Existing NDJSON progress/terminal response semantics and legacy JSON responses remain intact. Copilot exposes public assistant content, not hidden reasoning. Concurrent Copilot generations fail immediately instead of queueing. Model changes reported by the SDK cancel the request rather than mislabeling provenance. The browser requires cloud acknowledgement, clears available models immediately on provider change, and preserves disappeared selections as unavailable. Provider/model/acknowledgement are session-only, outside show packages.

Plain JSON and one complete JSON/unlabelled Markdown code block are accepted as response containers. Prose around the block, multiple blocks, wrong labels and incomplete fences are rejected; JSON and the complete domain contract are still validated. The diagnostic retains the original answer, including any fences. This deterministic normalization consumes no additional AI call.

## Data and permissions

Only known design context fields are projected into the cloud prompt, including nested creative recipes, layers and positions. No network routes, patch addresses or unknown extension metadata are forwarded. Validation uses the same schema and declarative recipe checks as other providers; no generated program code is executed.

The SDK has no available tools, all permission requests are denied, built-in MCPs and instruction discovery are disabled, and session working/configuration directories are isolated outside the repository. Ambient token variables, Node hooks and telemetry environment are excluded from the SDK subprocess. Official CLI stored-user authentication remains available. No login endpoint or browser token field is added.

Each operation owns a temporary SDK directory. Memory/shared session storage is disabled; abort, session deletion and owned-directory deletion run on cleanup. This is best-effort cleanup, **not a guarantee of zero disk writes**: SDK temporary state can remain after a process crash. GitHub controls cloud retention and billing. Diagnostics are bounded application SDK input and returned assistant text, not the complete internal GitHub/model HTTP exchange. They may contain private brief/band content and remain governed by the existing opt-in diagnostic controls.

Official references:

- [SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate)
- [SDK usage and billing](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing)
- [.NET SDK](https://github.com/github/copilot-sdk/tree/main/dotnet)

## Scope and review plan

| Track                        | Coverage                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Implementation               | Required: official SDK adapter, request-local routing, installed-account model list and UI.                                   |
| Documentation                | Required: authentication, cloud boundary, compatibility, diagnostics and validation evidence.                                 |
| Delivery/git                 | Light: existing dirty workspace preserved; no branches, commits or release ZIP changes requested.                             |
| Architecture                 | Required: transport isolated from show contracts and physical output; shared validators remain authoritative.                 |
| Maintainability/code quality | Required: shared context projection and provider seam, no duplicate creative engine or fallback.                              |
| UX/user perspective          | Required: explicit destination/model/consent, missing-model recovery, actionable login and errors.                            |
| Visual design                | Light: existing Audiolab controls, spacing and responsive layout.                                                             |
| Security                     | Required: deny tools/permissions, disable ambient discovery, credentials never exposed to browser/model.                      |
| Validation                   | Required: real SDK startup/auth/model discovery, browser workflow and a small generation if authentication permits.           |
| Risk                         | Required: cloud usage, version skew, missing CLI/auth/model, cancellation and bounded responses.                              |
| Data lifecycle/diagnostics   | Required: isolated request sessions, bounded temporary preview/trace, SDK capture honestly distinguished from raw cloud wire. |
| Testing                      | Required: fake transport failures/allowlists/cancellation, frontend consent/provider isolation and existing regressions.      |

The .NET backend and independent security/architecture reviewer work in parallel; the parent owns UI, setup, browser checks and documentation. Hardware output, MIDI/WING and Dante remain out of scope.

## Verification (2026-09-14)

- 645 frontend tests,10 launcher/package tests, production web/engine build and full runtime harness passed. Release runtime build has zero warnings/errors; existing large frontend bundle warning remains.
- SDK1.0.13 with CLI1.0.83 on macOS arm64: real stored-user authentication and account model discovery verified. No login/token changes were needed.
- Isolated browser real-cloud single-palette proposals succeeded using `gpt-5-mini` and `claude-haiku-4.5`, without acceptance/show mutation. The initial Claude reply exposed fenced-JSON compatibility; a regression went red, normalization was added, and the real Claude retest passed.
- `scripts/check-copilot-ui.js` verifies explicit model/consent, no automatic routing, real proposal validation and desktop/mobile layout. Screenshots were visually inspected; no horizontal overflow.
- A subsequent real cancellation probe received `ai_busy` before generation, so authenticated SDK cancellation was not established by that probe. No other request was interrupted. Fake transport cancellation/gate-release and browser lifecycle tests pass; real Copilot cancellation remains a manual verification gap.
- Review findings accepted: nested context allowlists, clean credential environment, disabled ambient SDK features, no model substitution, accurate SDK diagnostic labels and bounded temporary lifecycle. No unresolved reviewer disagreement. Windows/Linux end-to-end, maximum collection generation and an updated distribution ZIP are deferred, not claimed complete. Current branch remains `main`; pre-existing untracked/dirty work was preserved and no git publication or cleanup was performed.
