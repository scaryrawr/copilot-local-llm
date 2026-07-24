# Repository Guidelines

## Project Structure & Module Organization

`src/extension.ts` is the Copilot CLI extension entrypoint: it discovers local
providers, joins the active session, and registers the result. Keep discovery
or protocol-specific behavior in `src/providers/`; each adapter maps a server's
discovery response to the Copilot SDK configuration. Shared URL normalization,
timeouts, parsing, and model configuration helpers belong in
`src/providers/types.ts`. `src/local-providers.ts` aggregates the adapters.

Tests live in `tests/`, currently centered on discovery with injected
environment and `fetch` implementations. `build.ts` bundles
`src/extension.ts` to the generated root-level `extension.mjs`; edit source,
not that artifact.

## Build, Test, and Development Commands

Use Bun and the checked-in `bun.lock`:

```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

Run a focused test with `bunx vitest run tests/local-providers.test.ts`.
Use `bun run format:check` to verify formatting; `bun run format` rewrites
files. Before handing off a code change, run typecheck, lint, tests, and build
in that order.

## Coding Style & Naming Conventions

The project is strict TypeScript targeting ES2024 with NodeNext module
resolution. Source imports use explicit `.js` extensions. Use the repository's
oxfmt defaults (two-space indentation and double quotes); `oxlint` excludes
only generated `extension.mjs`. Prefer narrow runtime guards when interpreting
untyped discovery JSON, and keep provider-specific environment aliases within
that provider adapter.

## Testing Guidelines

Use Vitest. Test discovery behavior by injecting a `FetchImplementation` and
environment object rather than starting local servers. Cover valid model
mapping, malformed responses, provider unavailability, and relevant
environment overrides. Preserve the three-second discovery timeout and the
non-fatal behavior for unreachable local servers.

## Security & Configuration Tips

Provider endpoints and optional credentials are read from
`<PROVIDER>_BASE_URL` and `<PROVIDER>_API_KEY`. Never add real API keys to
tests, fixtures, logs, or documentation. Keep registration logs ephemeral and
avoid exposing authorization values in errors.

## Commit & Pull Request Guidelines

Recent commits use concise conventional prefixes such as `fix(omlx): ...` and
`feat(prompt): ...`. Keep each change scoped to its provider or shared
discovery behavior, and include tests for observable mapping changes.
