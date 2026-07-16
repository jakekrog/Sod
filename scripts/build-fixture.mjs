/**
 * Compiles `fixtures/exampleSchemas.ts` to
 * `Tests/SodTests/Fixtures/example.bundle.js`, exactly the way a consumer
 * bundles their own schemas.
 *
 * The suite runs the compiled output rather than hand-written JS, because a
 * hand-written fixture can't tell you whether real bundler output loads: it
 * never went through a bundler. This catches the things that actually break —
 * Zod resolving to `globalThis.z`, IIFE output evaluating in a context with no
 * module loader, minified code surviving JavaScriptCore.
 *
 * It doubles as executable documentation of the consumer build: `zod` aliased
 * to a shim that reads `globalThis.z`, IIFE, no Node builtins.
 *
 * Output is committed, so `swift test` needs no Node toolchain. Regenerate with:
 *
 *   npm install && node scripts/build-fixture.mjs
 */
import { build } from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outPath = join(root, "Tests", "SodTests", "Fixtures", "example.bundle.js");
const shimPath = join(here, "zodShim.js");

// Zod is external: Sod injects it as globalThis.z before any consumer bundle
// runs. An alias rather than esbuild's `external`, because an IIFE has no import
// statements left to resolve at runtime.
writeFileSync(shimPath, "export const z = globalThis.z;\nexport default globalThis.z;\n");

const result = await build({
  stdin: {
    contents: `
      import { Order } from "${join(root, "fixtures", "exampleSchemas.ts")}";
      globalThis.__sodSchemas = globalThis.__sodSchemas || {};
      globalThis.__sodSchemas["Order"] = Order;
    `,
    resolveDir: root,
    loader: "ts",
    sourcefile: "fixture-entry.ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "neutral",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  alias: { zod: shimPath },
});

const [output] = result.outputFiles;
if (output === undefined) {
  throw new Error("esbuild produced no output");
}

// If Zod got inlined, the fixture stops testing the external-Zod contract and
// starts testing a copy of Zod that shadows Sod's.
if (!output.text.includes("globalThis.z")) {
  throw new Error("fixture does not read globalThis.z — the zod alias is not working");
}

writeFileSync(outPath, output.text);
console.log(`Tests/SodTests/Fixtures/example.bundle.js  ${(output.text.length / 1024).toFixed(1)} KB`);
