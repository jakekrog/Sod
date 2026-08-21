import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: "esm",
  platform: "node",
  target: "node18",
  dts: true,
  clean: true,
  outDir: "dist",
  outExtensions() {
    return {
      js: ".js",
      dts: ".d.ts",
    };
  },
});
