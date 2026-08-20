/**
 * Programmatic entry point for `@sod/build`.
 */
import { mkdirSync } from "node:fs";
import { bundleZod } from "./bundle-zod.mjs";
import { bundleSchemas } from "./bundle-schemas.mjs";
import { loadConfig } from "./load-config.mjs";

/**
 * @param {object} [options]
 * @param {string} [options.projectDir] - Directory containing sod.config.js
 * @returns {Promise<{ zod: import("./bundle-zod.mjs").bundleZod extends (...args: any) => Promise<infer R> ? R : never, schemas: import("./bundle-schemas.mjs").bundleSchemas extends (...args: any) => Promise<infer R> ? R : never }>}
 */
export async function build({ projectDir } = {}) {
  const config = await loadConfig(projectDir);
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

export { loadConfig } from "./load-config.mjs";
export { bundleZod } from "./bundle-zod.mjs";
export { bundleSchemas } from "./bundle-schemas.mjs";
