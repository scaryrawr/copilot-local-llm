import type { ModelCapabilitiesOverride } from "@github/copilot-sdk";

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 131_072;
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_768;

export type FetchImplementation = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

export interface DiscoveredModel {
  id: string;
  name: string;
  maxContextWindowTokens: number;
  maxOutputTokens: number;
  capabilities?: ModelCapabilitiesOverride;
}

export interface LocalProvider {
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: DiscoveredModel[];
}
