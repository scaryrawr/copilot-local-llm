// src/extension.ts
import { joinSession } from "@github/copilot-sdk/extension";

// src/local-provider-types.ts
var DEFAULT_CONTEXT_WINDOW_TOKENS = 131072;
var DEFAULT_MAX_OUTPUT_TOKENS = 32768;

// src/local-provider-discoverers.ts
var DISCOVERY_TIMEOUT_MS = 3000;
async function discoverOllama(environment, fetchImplementation) {
  return discoverTagProvider({
    displayName: "Ollama",
    name: "ollama",
    endpoint: baseUrl(environment.OLLAMA_BASE_URL, "http://localhost:11434"),
    apiKey: environment.OLLAMA_API_KEY,
    limits: localLimits(environment.OLLAMA_CONTEXT_LENGTH),
    fetchImplementation
  });
}
async function discoverLmStudio(environment, fetchImplementation) {
  const endpoint = baseUrl(environment.LMSTUDIO_BASE_URL, "http://localhost:1234");
  const apiKey = environment.LMSTUDIO_API_KEY;
  const payload = await fetchJson("LM Studio", `${endpoint}/api/v1/models`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return;
  }
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.key !== "string") {
      return [];
    }
    const maxContextWindowTokens = positiveInteger(model.max_context_length) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
    return [{
      id: model.key,
      name: typeof model.display_name === "string" ? model.display_name : model.key,
      maxContextWindowTokens,
      maxOutputTokens: maxOutputTokens(maxContextWindowTokens)
    }];
  });
  return createProvider("lmstudio", endpoint, apiKey, models);
}
async function discoverOmlx(environment, fetchImplementation) {
  const endpoint = baseUrl(environment.OMLX_BASE_URL, "http://localhost:8000");
  const apiKey = environment.OMLX_API_KEY;
  const payload = await fetchJson("OMLX", `${endpoint}/admin/api/models`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return;
  }
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.id !== "string" || model.model_type !== "llm" && model.model_type !== "vlm") {
      return [];
    }
    return [{
      id: model.id,
      name: typeof model.display_name === "string" ? model.display_name : model.id,
      maxContextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      capabilities: model.model_type === "vlm" ? { supports: { vision: true } } : undefined
    }];
  });
  return createProvider("omlx-local", endpoint, apiKey, models);
}
async function discoverOsaurus(environment, fetchImplementation) {
  return discoverTagProvider({
    displayName: "OSaurus",
    name: "osaurus",
    endpoint: baseUrl(environment.OSAURUS_BASE_URL ?? environment.OSARAUS_BASE_URL, "http://localhost:1337"),
    apiKey: environment.OSAURUS_API_KEY ?? environment.OSARAUS_API_KEY,
    limits: localLimits(environment.OSAURUS_CONTEXT_LENGTH ?? environment.OSARAUS_CONTEXT_LENGTH),
    fetchImplementation
  });
}
async function discoverTagProvider({
  displayName,
  name,
  endpoint,
  apiKey,
  limits,
  fetchImplementation
}) {
  const payload = await fetchJson(displayName, `${endpoint}/api/tags`, apiKey, fetchImplementation);
  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return;
  }
  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.name !== "string") {
      return [];
    }
    return [{
      id: model.name,
      name: typeof model.model === "string" ? model.model : model.name,
      ...limits
    }];
  });
  return createProvider(name, endpoint, apiKey, models);
}
function createProvider(name, endpoint, apiKey, models) {
  return models.length === 0 ? undefined : {
    name,
    baseUrl: `${endpoint}/v1`,
    apiKey,
    models
  };
}
function localLimits(contextLength) {
  const maxContextWindowTokens = positiveInteger(contextLength) ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  return {
    maxContextWindowTokens,
    maxOutputTokens: maxOutputTokens(maxContextWindowTokens)
  };
}
function maxOutputTokens(contextWindow) {
  return Math.min(DEFAULT_MAX_OUTPUT_TOKENS, Math.floor(contextWindow / 4));
}
function baseUrl(value, fallback) {
  return (value ?? fallback).replace(/\/+$/, "");
}
function positiveInteger(value) {
  if (typeof value !== "number" && typeof value !== "string") {
    return;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
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

// src/local-providers.ts
async function discoverLocalProviders(environment = process.env, fetchImplementation = fetch) {
  const discoveredProviders = (await Promise.all([
    discoverOllama(environment, fetchImplementation),
    discoverLmStudio(environment, fetchImplementation),
    discoverOmlx(environment, fetchImplementation),
    discoverOsaurus(environment, fetchImplementation)
  ])).filter((provider) => provider !== undefined);
  return {
    providers: discoveredProviders.map(({ name, baseUrl: baseUrl2, apiKey }) => ({
      name,
      baseUrl: baseUrl2,
      apiKey,
      wireApi: "completions"
    })),
    models: discoveredProviders.flatMap(({ name: provider, models }) => models.map(({
      id,
      name,
      maxContextWindowTokens,
      maxOutputTokens: maxOutputTokens2,
      capabilities
    }) => ({
      id,
      provider,
      name,
      maxContextWindowTokens,
      maxPromptTokens: maxContextWindowTokens,
      maxOutputTokens: maxOutputTokens2,
      capabilities
    })))
  };
}

// src/extension.ts
var configuration = await discoverLocalProviders();
var session = await joinSession();
(async () => {
  try {
    const result = await session.rpc.provider.add(configuration);
    await session.log(`Registered ${result.models.length} local model(s).`, { level: "info" });
  } catch (error) {
    await session.log(`Local model registration failed: ${error instanceof Error ? error.message : String(error)}`, { level: "error" });
  }
})();
