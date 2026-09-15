# Lightlab contributor guidance

Read `.project/PROJECT_CONTEXT.md` before changing product behaviour. It is the
canonical source for hardware-safety constraints, compatibility rules and
subsystem ownership. Keep product and engineering documentation in `docs/`;
keep only durable agent/workflow metadata in `.project/`.

## Architecture boundaries

- `src/` owns the browser editor, local persistence, shared show domain and
  browser simulation.
- `runtime-worker/` evaluates the shared TypeScript engine independently of
  the browser; it must not import UI or simulator code.
- `runtime/` owns local HTTP, playback lifecycle and hardware adapters.
- Hardware adapters consume evaluated frames; they must not mutate editor or
  simulator state.
- Preserve saved-show compatibility. Change schema, transport or validation
  contracts only with matching browser, worker and runtime coverage.

## Safety

- Simulation is the default output. Never arm DMX, send Art-Net/sACN, write to
  a WING, or connect to physical hardware without explicit user authorization.
- Do not put secrets, provider keys, raw AI traces or generated test logs in
  source control.

## Verification

Use the narrowest relevant command, then run the full check for shared or
release-facing changes:

```bash
npm test
npm run build
dotnet run --project runtime-tests -c Release
npm run verify
```

`npm run package:local` creates a host-native artifact and is a release step,
not a routine development check. Generated artifacts belong in ignored output
directories; copy only intentional, durable evidence into `docs/`.

## Delivery

This directory is its own local Git repository. Do not add a remote, create
releases, or publish artifacts unless the user explicitly chooses that delivery
boundary. The `.github/workflows/ci.yml` workflow is the canonical PR
validation contract once the repository is hosted on GitHub.
