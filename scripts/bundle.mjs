/**
 * Rebuilds `Sources/Sod/Resources/zod.bundle.js` and `zod.bundle.version`.
 *
 * Sod embeds a pre-built Zod so consumers need no Node toolchain: the artifact
 * is checked into this repo and shipped as a SwiftPM resource. Run this only
 * when moving to a new Zod version, then commit the result.
 *
 *   npm install && node scripts/bundle.mjs
 *
 * The output targets a JavaScriptCore-safe profile (ADR-015): an IIFE, no ESM,
 * no Node builtins, no `setTimeout`. JSC is a bare JS engine — it has no module
 * loader, no `process`, no timers unless a host provides them.
 *
 * The bundle assigns `globalThis.z`, which is the contract the rest of Sod and
 * every consumer schema bundle depends on.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const resources = join(here, "..", "Sources", "Sod", "Resources");

const zodVersion = require("zod/package.json").version;

const result = await build({
  stdin: {
    contents: `
      import * as zod from "zod";
      // The whole point: consumer schema bundles are compiled with Zod marked
      // external and read it from here.
      globalThis.z = zod.z ?? zod;
    `,
    resolveDir: join(here, ".."),
    loader: "js",
    sourcefile: "zod-entry.js",
  },
  bundle: true,
  write: false,
  // JSC evaluates this as a plain script: no module loader exists.
  format: "iife",
  // "neutral" keeps Node/browser builtins out; Zod needs neither.
  platform: "neutral",
  target: ["es2020"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
});

const [output] = result.outputFiles;
if (output === undefined) {
  throw new Error("esbuild produced no output");
}

const source = output.text;

// Guard the JSC-safe profile rather than trusting the config. A bundle that
// reaches for a Node builtin fails at runtime inside JSC with an opaque error,
// long after this script has claimed success.
const forbidden = [
  ["require(", "CommonJS require"],
  ["process.", "Node process"],
  ["setTimeout(", "timers (JSC has none unless the host provides them)"],
  ["module.exports", "CommonJS exports"],
];
for (const [needle, why] of forbidden) {
  if (source.includes(needle)) {
    throw new Error(`zod.bundle.js contains ${needle} — ${why}. Not JSC-safe.`);
  }
}

writeFileSync(join(resources, "zod.bundle.js"), source);
writeFileSync(join(resources, "zod.bundle.version"), `${zodVersion}\n`);

console.log(`zod.bundle.js      ${(source.length / 1024).toFixed(1)} KB`);
console.log(`zod.bundle.version ${zodVersion}`);
console.log(`\nUpdate Sod.bundledZodVersion's test and CHANGELOG.md to match.`);
