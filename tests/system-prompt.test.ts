import type {
  SectionTransformFn,
  SystemMessageCustomizeConfig,
  SystemMessageSection,
} from "@github/copilot-sdk";
import { describe, expect, it } from "vitest";
import {
  isLocalModel,
  LocalModelPromptController,
} from "../src/system-prompt.js";

describe("isLocalModel", () => {
  it.each([
    "ollama/qwen3:8b",
    "lmstudio/local-model",
    "omlx-local/Qwen3.5-9B-mxfp4",
    "osaurus/osaurus-model",
  ])("recognizes %s", (modelId) => {
    expect(isLocalModel(modelId)).toBe(true);
  });

  it.each([undefined, "gpt-5.6-sol", "other/model", "/model"])(
    "rejects non-local model %s",
    (modelId) => {
      expect(isLocalModel(modelId)).toBe(false);
    },
  );
});

describe("LocalModelPromptController", () => {
  it("preserves Copilot prompt sections for hosted models", async () => {
    const controller = new LocalModelPromptController();

    expect(await transform(controller, "identity", "hosted identity")).toBe(
      "hosted identity",
    );
    expect(await transform(controller, "tool_instructions", "hosted tools")).toBe(
      "hosted tools",
    );
  });

  it("uses minimal prompt sections for local models and restores hosted sections", async () => {
    const controller = new LocalModelPromptController();

    controller.setModel("ollama/qwen3:8b");
    expect(await transform(controller, "identity", "hosted identity")).toContain(
      "GitHub Copilot CLI",
    );
    expect(await transform(controller, "tool_instructions", "hosted tools")).toBe(
      "",
    );
    expect(await transform(controller, "safety", "hosted safety")).toContain(
      "Do not expose secrets",
    );

    controller.setModel("gpt-5.6-sol");
    expect(await transform(controller, "identity", "hosted identity")).toBe(
      "hosted identity",
    );
  });
});

async function transform(
  controller: LocalModelPromptController,
  section: SystemMessageSection,
  content: string,
): Promise<string> {
  const config = controller.createSystemMessage() as SystemMessageCustomizeConfig;
  const action = config.sections?.[section]?.action;

  expect(action).toBeTypeOf("function");
  return (action as SectionTransformFn)(content);
}
