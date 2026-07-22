import { joinSession } from "@github/copilot-sdk/extension";
import { discoverLocalProviders } from "./local-providers.js";
import { LocalModelPromptController } from "./system-prompt.js";

const configuration = discoverLocalProviders();
const promptController = new LocalModelPromptController();
const session = await joinSession({
  systemMessage: promptController.createSystemMessage(),
});

session.on("session.model_change", (event) => {
  promptController.setModel(event.data.newModel);
});

void (async () => {
  try {
    const result = await session.rpc.provider.add(await configuration);
    await session.log(`Registered ${result.models.length} local model(s).`, {
      level: "info",
      ephemeral: true,
    });
  } catch (error) {
    await session.log(
      `Local model registration failed: ${error instanceof Error ? error.message : String(error)}`,
      { level: "error", ephemeral: true },
    );
  }
})();

void (async () => {
  try {
    const currentModel = await session.rpc.model.getCurrent();
    promptController.setModel(currentModel.modelId);
  } catch (error) {
    await session.log(
      `Local prompt model detection failed: ${error instanceof Error ? error.message : String(error)}`,
      { level: "warning", ephemeral: true },
    );
  }
})();
