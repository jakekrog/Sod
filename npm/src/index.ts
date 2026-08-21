/**
 * Programmatic entry point for `sod-build`.
 */
import { mkdirSync } from "node:fs";
import { bundleZod, type ZodBundleResult } from "./bundle-zod.ts";
import { bundleSchemas, type SchemasBundleResult } from "./bundle-schemas.ts";
import { loadConfig, type SodConfig } from "./load-config.ts";

export interface BuildResult {
  zod: ZodBundleResult;
  schemas: SchemasBundleResult;
  config: SodConfig;
}

export async function build(options: { projectDir?: string } = {}): Promise<BuildResult> {
  const config = await loadConfig(options.projectDir);
  mkdirSync(config.outDir, { recursive: true });

  const zod = await bundleZod({
    resolveDir: config.configDir,
    zodImport: config.zod ?? "zod",
    outDir: config.outDir,
  });

  const schemas = await bundleSchemas({
    schemas: config.schemas,
    configDir: config.configDir,
    outDir: config.outDir,
  });

  return { zod, schemas, config };
}

export { bundleZod } from "./bundle-zod.ts";
export { bundleSchemas } from "./bundle-schemas.ts";
export { loadConfig, findConfig } from "./load-config.ts";
export type { SchemaEntry, SchemasBundleResult } from "./bundle-schemas.ts";
export type { ZodBundleResult } from "./bundle-zod.ts";
export type { SodConfig } from "./load-config.ts";
