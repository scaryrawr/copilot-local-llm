import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  type DiscoveredModel,
  type FetchImplementation,
  type LocalProvider,
} from "./local-provider-types.js";

const DISCOVERY_TIMEOUT_MS = 3_000;

/**
 * Discovers Ollama models from its native catalog endpoint.
 */
export async function discoverOllama(
  environment: NodeJS.ProcessEnv,
  fetchImplementation: FetchImplementation,
): Promise<LocalProvider | undefined> {
  return discoverTagProvider({
    displayName: "Ollama",
    name: "ollama",
    endpoint: baseUrl(environment.OLLAMA_BASE_URL, "http://localhost:11434"),
    apiKey: environment.OLLAMA_API_KEY,
    limits: localLimits(environment.OLLAMA_CONTEXT_LENGTH),
    fetchImplementation,
  });
}

/**
 * Discovers models loaded by LM Studio.
 */
export async function discoverLmStudio(
  environment: NodeJS.ProcessEnv,
  fetchImplementation: FetchImplementation,
): Promise<LocalProvider | undefined> {
  const endpoint = baseUrl(environment.LMSTUDIO_BASE_URL, "http://localhost:1234");
  const apiKey = environment.LMSTUDIO_API_KEY;
  const payload = await fetchJson(
    "LM Studio",
    `${endpoint}/api/v1/models`,
    apiKey,
    fetchImplementation,
  );

  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return undefined;
  }

  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.key !== "string") {
      return [];
    }

    const maxContextWindowTokens = positiveInteger(model.max_context_length)
      ?? DEFAULT_CONTEXT_WINDOW_TOKENS;

    return [{
      id: model.key,
      name: typeof model.display_name === "string" ? model.display_name : model.key,
      maxContextWindowTokens,
      maxOutputTokens: maxOutputTokens(maxContextWindowTokens),
    }];
  });

  return createProvider("lmstudio", endpoint, apiKey, models);
}

/**
 * Discovers text and vision models managed by OMLX.
 */
export async function discoverOmlx(
  environment: NodeJS.ProcessEnv,
  fetchImplementation: FetchImplementation,
): Promise<LocalProvider | undefined> {
  const endpoint = baseUrl(environment.OMLX_BASE_URL, "http://localhost:8000");
  const apiKey = environment.OMLX_API_KEY;
  const payload = await fetchJson(
    "OMLX",
    `${endpoint}/admin/api/models`,
    apiKey,
    fetchImplementation,
  );

  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return undefined;
  }

  const models = payload.models.flatMap((model) => {
    if (
      !isRecord(model)
      || typeof model.id !== "string"
      || (model.model_type !== "llm" && model.model_type !== "vlm")
    ) {
      return [];
    }

    return [{
      id: model.id,
      name: typeof model.display_name === "string" ? model.display_name : model.id,
      maxContextWindowTokens: DEFAULT_CONTEXT_WINDOW_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      capabilities: model.model_type === "vlm"
        ? { supports: { vision: true } }
        : undefined,
    }];
  });

  return createProvider("omlx-local", endpoint, apiKey, models);
}

/**
 * Discovers OSaurus models from its Ollama-compatible catalog endpoint.
 */
export async function discoverOsaurus(
  environment: NodeJS.ProcessEnv,
  fetchImplementation: FetchImplementation,
): Promise<LocalProvider | undefined> {
  return discoverTagProvider({
    displayName: "OSaurus",
    name: "osaurus",
    endpoint: baseUrl(
      environment.OSAURUS_BASE_URL ?? environment.OSARAUS_BASE_URL,
      "http://localhost:1337",
    ),
    apiKey: environment.OSAURUS_API_KEY ?? environment.OSARAUS_API_KEY,
    limits: localLimits(
      environment.OSAURUS_CONTEXT_LENGTH ?? environment.OSARAUS_CONTEXT_LENGTH,
    ),
    fetchImplementation,
  });
}

interface TagProviderOptions {
  displayName: string;
  name: string;
  endpoint: string;
  apiKey?: string;
  limits: Pick<DiscoveredModel, "maxContextWindowTokens" | "maxOutputTokens">;
  fetchImplementation: FetchImplementation;
}

async function discoverTagProvider({
  displayName,
  name,
  endpoint,
  apiKey,
  limits,
  fetchImplementation,
}: TagProviderOptions): Promise<LocalProvider | undefined> {
  const payload = await fetchJson(
    displayName,
    `${endpoint}/api/tags`,
    apiKey,
    fetchImplementation,
  );

  if (!isRecord(payload) || !Array.isArray(payload.models)) {
    return undefined;
  }

  const models = payload.models.flatMap((model) => {
    if (!isRecord(model) || typeof model.name !== "string") {
      return [];
    }

    return [{
      id: model.name,
      name: typeof model.model === "string" ? model.model : model.name,
      ...limits,
    }];
  });

  return createProvider(name, endpoint, apiKey, models);
}

function createProvider(
  name: string,
  endpoint: string,
  apiKey: string | undefined,
  models: DiscoveredModel[],
): LocalProvider | undefined {
  return models.length === 0
    ? undefined
    : {
      name,
      baseUrl: `${endpoint}/v1`,
      apiKey,
      models,
    };
}

function localLimits(contextLength: string | undefined) {
  const maxContextWindowTokens = positiveInteger(contextLength)
    ?? DEFAULT_CONTEXT_WINDOW_TOKENS;

  return {
    maxContextWindowTokens,
    maxOutputTokens: maxOutputTokens(maxContextWindowTokens),
  };
}

function maxOutputTokens(contextWindow: number) {
  return Math.min(DEFAULT_MAX_OUTPUT_TOKENS, Math.floor(contextWindow / 4));
}

function baseUrl(value: string | undefined, fallback: string) {
  return (value ?? fallback).replace(/\/+$/, "");
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function fetchJson(
  provider: string,
  url: string,
  apiKey: string | undefined,
  fetchImplementation: FetchImplementation,
): Promise<unknown> {
  try {
    const response = await fetchImplementation(url, {
      headers: apiKey === undefined
        ? undefined
        : { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(
        `[copilot-local-llm] ${provider} model discovery failed: ${response.status} ${response.statusText}`,
      );
      return undefined;
    }

    return await response.json();
  } catch (error) {
    console.warn(
      `[copilot-local-llm] ${provider} model discovery failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
