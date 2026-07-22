import type { SystemMessageConfig, SystemMessageSection } from "@github/copilot-sdk";

const LOCAL_PROVIDER_NAMES = new Set(["ollama", "lmstudio", "omlx-local", "osaurus"]);

const MINIMAL_IDENTITY = [
  "You are GitHub Copilot CLI, an expert coding agent.",
  "Use the available tools to inspect, edit, and validate the current workspace.",
  "Follow the user's request and project instructions. Be concise and continue until the task is complete.",
].join(" ");

const MINIMAL_SAFETY = [
  "Do not expose secrets.",
  "Do not perform destructive actions without explicit user approval.",
].join(" ");

const LOCAL_SECTION_CONTENT: Partial<Record<SystemMessageSection, string>> = {
  identity: MINIMAL_IDENTITY,
  preamble: MINIMAL_IDENTITY,
  tone: "",
  tool_efficiency: "",
  code_change_rules: "",
  guidelines: "",
  safety: MINIMAL_SAFETY,
  tool_instructions: "",
  last_instructions: "",
};

/** Tracks whether the active model is supplied by this extension. */
export class LocalModelPromptController {
  private localModelSelected = false;

  /** Updates prompt behavior for a provider-qualified model selection ID. */
  setModel(modelId: string | undefined): void {
    this.localModelSelected = isLocalModel(modelId);
  }

  /** Builds dynamic section transforms that preserve the default prompt for hosted models. */
  createSystemMessage(): SystemMessageConfig {
    return {
      mode: "customize",
      sections: Object.fromEntries(
        Object.entries(LOCAL_SECTION_CONTENT).map(([section, content]) => [
          section,
          {
            action: (currentContent: string) =>
              this.localModelSelected ? content : currentContent,
          },
        ]),
      ),
    };
  }
}

/** Returns whether a model selection ID belongs to a registered local provider. */
export function isLocalModel(modelId: string | undefined): boolean {
  if (!modelId) {
    return false;
  }

  const separator = modelId.indexOf("/");
  return separator > 0 && LOCAL_PROVIDER_NAMES.has(modelId.slice(0, separator));
}
