# Lightlab architecture

Lightlab is a local-first editor, simulator and companion runtime for small
stage lighting shows. The browser is the creative/editor surface; the runtime
is the only component that can own playback sessions or hardware adapters.

```text
React editor and Three.js simulator
        │
        ├── shared TypeScript show domain and frame evaluation
        │                  │
        │                  └── Node worker for autonomous evaluation
        │                                      │
        └── local HTTP clients ────────────────┤
                                               ▼
                                  ASP.NET companion runtime
                                  playback · AI · DMX · WING adapters
```

## Ownership boundaries

| Area              | Owns                                                                                         | Must not own                                               |
| ----------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/`            | Editor state, browser persistence, shared show model, browser simulation and runtime clients | Hardware lifecycle or transport writes                     |
| `runtime-worker/` | Autonomous execution of the shared TypeScript evaluator                                      | UI, browser storage or simulator rendering                 |
| `runtime/`        | Loopback API, session lifecycle, Node worker supervision, AI providers and hardware adapters | Editor state or creative frame evaluation duplicated in C# |
| `scripts/`        | Local server supervision, host-native packaging and artifact integrity checks                | Product-domain rules                                       |

## Non-negotiable rules

- Browser simulation is the default output. DMX and WING writes require an
  explicit user action and must remain opt-in.
- The TypeScript domain/evaluator is shared between browser and worker. Do not
  implement a second creative evaluator in the runtime.
- Runtime sessions operate on validated immutable show snapshots. Runtime live
  state is session-local and must not silently overwrite editor state.
- Saved shows and `.lightflow.json` compatibility are product contracts. Make
  schema changes additive and cover browser, worker and runtime behaviour.
- AI providers receive an allowlisted creative context, never physical routes,
  addresses, credentials or raw diagnostics by default.

## Change guide

| Change                                | Primary owner                      | Required validation                                                                |
| ------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Show schema, frame math or patterns   | `src/` domain plus worker          | TypeScript tests, worker test and runtime contract coverage when its input changes |
| Browser workflow or persistence       | `src/` feature and storage modules | Component/domain tests; browser acceptance where interaction changes               |
| Runtime endpoint or session behaviour | `runtime/`                         | .NET contract harness and matching browser-client tests                            |
| DMX/WING protocol behaviour           | `runtime/` adapter                 | Packet/adapter tests; explicit physical acceptance before release                  |
| Packaging or launcher behaviour       | `scripts/`                         | Launcher/distribution tests and a host-native package check                        |

## Verification and release

`npm run verify` is the standard local and CI gate. It runs frontend and
launcher tests, production browser/worker builds, and the .NET contract
harness. `npm run package:local` is a separate release action because it
produces a host-native distributable.

The full behavioural constraints, safety boundaries and current product scope
are maintained in [the project context](../.project/PROJECT_CONTEXT.md).
Operational protocol details live next to their subsystem in `docs/`.
