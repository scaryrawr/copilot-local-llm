import { builtinModules } from "node:module";

const result = await Bun.build({
  entrypoints: ["./src/extension.ts"],
  outdir: ".",
  naming: {
    entry: "extension.mjs",
  },
  format: "esm",
  target: "node",
  splitting: false,
  env: "disable",
  external: [
    ...builtinModules,
    ...builtinModules.map((moduleName) => `node:${moduleName}`),
    "@github/copilot-sdk",
    "@github/copilot-sdk/*",
  ],
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
