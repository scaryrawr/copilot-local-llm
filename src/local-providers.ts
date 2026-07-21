import type { NamedProviderConfig, ProviderModelConfig } from "@github/copilot-sdk";
import { discoverLmStudio } from "./providers/lmstudio.js";
import { discoverOllama } from "./providers/ollama.js";
import { discoverOmlx } from "./providers/omlx.js";
import { discoverOsaurus } from "./providers/osaurus.js";
import type { FetchImplementation, LocalProvider } from "./providers/types.js";

interface LocalProviderConfiguration {
  providers: NamedProviderConfig[];
  models: ProviderModelConfig[];
}

export async function discoverLocalProviders(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImplementation: FetchImplementation = fetch,
): Promise<LocalProviderConfiguration> {
  const discovered = (await Promise.all([
    discoverOllama(environment, fetchImplementation),
    discoverLmStudio(environment, fetchImplementation),
    discoverOmlx(environment, fetchImplementation),
    discoverOsaurus(environment, fetchImplementation),
  ])).filter((provider): provider is LocalProvider => provider !== undefined);

  return {
    providers: discovered.map(({ provider }) => provider),
    models: discovered.flatMap(({ models }) => models),
  };
}
