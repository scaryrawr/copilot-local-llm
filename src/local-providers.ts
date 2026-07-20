import type {
  NamedProviderConfig,
  ProviderModelConfig,
} from "@github/copilot-sdk";
import {
  discoverLmStudio,
  discoverOllama,
  discoverOmlx,
  discoverOsaurus,
} from "./local-provider-discoverers.js";
import type {
  FetchImplementation,
  LocalProvider,
} from "./local-provider-types.js";

interface LocalProviderConfiguration {
  providers: NamedProviderConfig[];
  models: ProviderModelConfig[];
}

/**
 * Discovers available local model servers and builds their additive Copilot
 * provider configuration. Providers that cannot be reached are omitted.
 */
export async function discoverLocalProviders(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: FetchImplementation = fetch,
): Promise<LocalProviderConfiguration> {
  const discoveredProviders = (await Promise.all([
    discoverOllama(environment, fetchImplementation),
    discoverLmStudio(environment, fetchImplementation),
    discoverOmlx(environment, fetchImplementation),
    discoverOsaurus(environment, fetchImplementation),
  ])).filter((provider): provider is LocalProvider => provider !== undefined);

  return {
    providers: discoveredProviders.map(({ name, baseUrl, apiKey }) => ({
      name,
      baseUrl,
      apiKey,
      wireApi: "completions",
    })),
    models: discoveredProviders.flatMap(({ name: provider, models }) =>
      models.map(
        ({
          id,
          name,
          maxContextWindowTokens,
          maxOutputTokens,
          capabilities,
        }) => ({
          id,
          provider,
          name,
          maxContextWindowTokens,
          maxPromptTokens: maxContextWindowTokens,
          maxOutputTokens,
          capabilities,
        }),
      ),
    ),
  };
}
