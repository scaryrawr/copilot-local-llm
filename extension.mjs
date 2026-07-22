// src/extension.ts
import { joinSession } from "@github/copilot-sdk/extension";

// src/providers/types.ts
var DEFAULT_CONTEXT_WINDOW_TOKENS = 131072;
var DEFAULT_MAX_OUTPUT_TOKENS = 32768;
var DISCOVERY_TIMEOUT_MS = 3000;
function baseUrl(value, fallback) {
  return (value ?? fallback).replace(/\/+$/, "");
}
function modelConfig(provider, id, name, maxContextWindowTokens, maxOutputTokens, capabilities) {
  return {
    id,
    provider,
    name,
    maxContextWindowTokens,
    maxPromptTokens: maxContextWindowTokens,
    maxOutputTokens,
    capabilities
  };
}
function providerConfig(name, endpoint, apiKey, models) {
  if (models.length === 0)
    return;
  return {
    provider: { name, baseUrl: `${endpoint}/v1`, apiKey, wireApi: "completions" },
    models
  };
}
function positiveInteger(value) {
  if (typeof value !== "number" && typeof value !== "string")
    return;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
function maxOutputTokens(contextWindow) {
  return Math.min(DEFAULT_MAX_OUTPUT_TOKENS, Math.floor(contextWindow / 4));
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
async function fetchJson(provider, url, apiKey, fetchImplementation) {
  try {
    const response = await fetchImplementation(url, {
      headers: apiKey === undefined ? undefined : { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`[copilot-local-llm] ${provider} model discovery failed: ${response.status} ${response.statusText}`);
      return;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[copilot-local-llm] ${provider} model discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
}

// src/providers/lmstudio.ts
async function discoverLmStudio(environment, fetchImplementation) {
  const name = "lmstudio";
  const endpoint = baseUrl(environment.LMSTUDIO_BASE_URL, "http://localhost:1234");
  const apiKey = environment.LMSTUDIO_API_KEY ?? "lmstudio";
  const payload = await fetchJson("LM Studio", `${endpoint}/api/v1/models`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models))
    return;
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.key !== "string")
      return [];
    const contextWindow = positiveInteger(model.max_context_length) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
    return [modelConfig(name, model.key, typeof model.display_name === "string" ? model.display_name : model.key, contextWindow, maxOutputTokens(contextWindow))];
  });
  return providerConfig(name, endpoint, apiKey, models);
}

// src/providers/ollama.ts
async function discoverOllama(environment, fetchImplementation) {
  const name = "ollama";
  const endpoint = baseUrl(environment.OLLAMA_BASE_URL, "http://localhost:11434");
  const apiKey = environment.OLLAMA_API_KEY ?? "ollama";
  const payload = await fetchJson("Ollama", `${endpoint}/api/tags`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models))
    return;
  const contextWindow = positiveInteger(environment.OLLAMA_CONTEXT_LENGTH) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.name !== "string")
      return [];
    return [modelConfig(name, model.name, typeof model.model === "string" ? model.model : model.name, contextWindow, maxOutputTokens(contextWindow))];
  });
  return providerConfig(name, endpoint, apiKey, models);
}

// src/providers/omlx.ts
async function discoverOmlx(environment, fetchImplementation) {
  const name = "omlx-local";
  const endpoint = baseUrl(environment.OMLX_BASE_URL, "http://localhost:8000");
  const apiKey = environment.OMLX_API_KEY ?? "omlx";
  const payload = await fetchJson("OMLX", `${endpoint}/v1/models/status`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models))
    return;
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.id !== "string" || model.model_type !== "llm" && model.model_type !== "vlm" || model.engine_type === "batched")
      return [];
    const contextWindow = positiveInteger(model.max_context_window) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
    return [modelConfig(name, model.id, typeof model.display_name === "string" ? model.display_name : model.id, contextWindow, positiveInteger(model.max_tokens) ?? DEFAULT_MAX_OUTPUT_TOKENS, model.model_type === "vlm" ? { supports: { vision: true } } : undefined)];
  });
  return providerConfig(name, endpoint, apiKey, models);
}

// src/providers/osaurus.ts
async function discoverOsaurus(environment, fetchImplementation) {
  const name = "osaurus";
  const endpoint = baseUrl(environment.OSAURUS_BASE_URL ?? environment.OSARAUS_BASE_URL, "http://localhost:1337");
  const apiKey = environment.OSAURUS_API_KEY ?? environment.OSARAUS_API_KEY ?? "osaurus";
  const payload = await fetchJson("OSaurus", `${endpoint}/api/tags`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models))
    return;
  const contextWindow = positiveInteger(environment.OSAURUS_CONTEXT_LENGTH ?? environment.OSARAUS_CONTEXT_LENGTH) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.name !== "string")
      return [];
    return [modelConfig(name, model.name, typeof model.model === "string" ? model.model : model.name, contextWindow, maxOutputTokens(contextWindow))];
  });
  return providerConfig(name, endpoint, apiKey, models);
}

// src/local-providers.ts
async function discoverLocalProviders(environment = process.env, fetchImplementation = fetch) {
  const discovered = (await Promise.all([
    discoverOllama(environment, fetchImplementation),
    discoverLmStudio(environment, fetchImplementation),
    discoverOmlx(environment, fetchImplementation),
    discoverOsaurus(environment, fetchImplementation)
  ])).filter((provider) => provider !== undefined);
  return {
    providers: discovered.map(({ provider }) => provider),
    models: discovered.flatMap(({ models }) => models)
  };
}

// src/system-prompt.ts
var LOCAL_PROVIDER_NAMES = new Set(["ollama", "lmstudio", "omlx-local", "osaurus"]);
var MINIMAL_IDENTITY = [
  "You are GitHub Copilot CLI, an expert coding agent.",
  "Use the available tools to inspect, edit, and validate the current workspace.",
  "Follow the user's request and project instructions. Be concise and continue until the task is complete."
].join(" ");
var MINIMAL_SAFETY = [
  "Do not expose secrets.",
  "Do not perform destructive actions without explicit user approval."
].join(" ");
var LOCAL_SECTION_CONTENT = {
  identity: MINIMAL_IDENTITY,
  preamble: MINIMAL_IDENTITY,
  tone: "",
  tool_efficiency: "",
  code_change_rules: "",
  guidelines: "",
  safety: MINIMAL_SAFETY,
  tool_instructions: "",
  last_instructions: ""
};

class LocalModelPromptController {
  localModelSelected = false;
  setModel(modelId) {
    this.localModelSelected = isLocalModel(modelId);
  }
  createSystemMessage() {
    return {
      mode: "customize",
      sections: Object.fromEntries(Object.entries(LOCAL_SECTION_CONTENT).map(([section, content]) => [
        section,
        {
          action: (currentContent) => this.localModelSelected ? content : currentContent
        }
      ]))
    };
  }
}
function isLocalModel(modelId) {
  if (!modelId) {
    return false;
  }
  const separator = modelId.indexOf("/");
  return separator > 0 && LOCAL_PROVIDER_NAMES.has(modelId.slice(0, separator));
}

// src/extension.ts
var configuration = discoverLocalProviders();
var promptController = new LocalModelPromptController;
var session = await joinSession({
  systemMessage: promptController.createSystemMessage()
});
session.on("session.model_change", (event) => {
  promptController.setModel(event.data.newModel);
});
(async () => {
  try {
    const result = await session.rpc.provider.add(await configuration);
    await session.log(`Registered ${result.models.length} local model(s).`, {
      level: "info",
      ephemeral: true
    });
  } catch (error) {
    await session.log(`Local model registration failed: ${error instanceof Error ? error.message : String(error)}`, { level: "error", ephemeral: true });
  }
})();
(async () => {
  try {
    const currentModel = await session.rpc.model.getCurrent();
    promptController.setModel(currentModel.modelId);
  } catch (error) {
    await session.log(`Local prompt model detection failed: ${error instanceof Error ? error.message : String(error)}`, { level: "warning", ephemeral: true });
  }
})();
