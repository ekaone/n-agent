import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/adapters/anthropic.ts",
    "src/adapters/ai-sdk.ts",
  ],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: true, // esbuild
  sourcemap: true,
  treeshake: true,
});
