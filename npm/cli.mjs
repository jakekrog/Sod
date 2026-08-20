#!/usr/bin/env node
/**
 * CLI for `@sod/build`.
 *
 *   npx sod build
 */
import { build } from "./index.mjs";

const [command] = process.argv.slice(2);

if (command === undefined || command === "--help" || command === "-h") {
  console.log(`Usage: sod build

Build JavaScriptCore-safe Zod and schema bundles from sod.config.js.

Outputs in outDir (default ./Generated/Sod):
  zod.bundle.js       — sets globalThis.z
  zod.bundle.version  — resolved Zod semver
  schemas.bundle.js   — registers globalThis.__sodSchemas
`);
  process.exit(command === undefined ? 1 : 0);
}

if (command !== "build") {
  console.error(`Unknown command: ${command}`);
  console.error("Run sod --help for usage.");
  process.exit(1);
}

try {
  const { zod, schemas } = await build();
  console.log(`zod.bundle.js         ${zod.sizeKB} KB  (Zod ${zod.version})`);
  console.log(`zod.bundle.version    ${zod.version}`);
  console.log(`schemas.bundle.js     ${schemas.sizeKB} KB`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
