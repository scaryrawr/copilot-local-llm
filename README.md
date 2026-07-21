# Copilot Local LLM

`copilot-local-llm` exposes models from local OpenAI-compatible servers in the
Copilot CLI model picker. It adds providers only when their model-discovery
endpoint is available, so Copilot-hosted models continue to work normally.
Discovery requests time out after three seconds to avoid delaying session joins.
Discovered models are registered in the active session, making them available
through `/model` as `provider/model-id` (for example,
`omlx-local/Qwen3.5-9B-mxfp4`).

| Provider | Default URL | Discovery endpoint |
| --- | --- | --- |
| Ollama | `http://localhost:11434` | `/api/tags` |
| LM Studio | `http://localhost:1234` | `/api/v1/models` |
| OMLX | `http://localhost:8000` | `/v1/models/status` |
| OSaurus | `http://localhost:1337` | `/api/tags` |

Set `<PROVIDER>_BASE_URL` to override a default server URL, and optionally set
`<PROVIDER>_API_KEY` when a local server requires authentication. Ollama and
OSaurus use `<PROVIDER>_CONTEXT_LENGTH` to override their default 131072-token
context window. `OSARAUS_*` aliases are accepted for compatibility with the
original project's spelling.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
```
