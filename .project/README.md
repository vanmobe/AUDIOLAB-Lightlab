# .project

This folder holds repo-local agent and workflow context.

Use it for:

- `.project/PROJECT_CONTEXT.md`: durable product rules, architecture seams and
  operational constraints.
- `.project/project-helper-config.json`: machine-readable tooling, platform and
  integration metadata.
- `.project/github-project-config.json`: GitHub Project metadata, but only when
  delivery automation is configured.

Do not store secrets, tokens, passwords, private keys, generated artifacts or
ordinary product documentation here. Keep human-facing guides in `docs/`.
