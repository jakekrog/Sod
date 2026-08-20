/**
 * Bundles consumer TypeScript schemas into a JavaScriptCore-safe IIFE that
 * registers them on `globalThis.__sodSchemas`, reading Zod from `globalThis.z`.
 */
import { build } from "esbuild";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * @typedef {object} SchemaEntry
 * @property {string} name - Registry name passed to `validate(..., against: name)`
 * @property {string} from - Module path relative to the config directory
 * @property {string} export - Named export to register
 */

/**
 * @param {SchemaEntry[]} schemas
 * @param {string} configDir
 * @returns {string}
 */
function buildEntryContents(schemas, configDir) {
  const imports = schemas
    .map((schema) => {
      const modulePath = resolve(configDir, schema.from);
      return `import { ${schema.export} as __sod_${schema.name} } from ${JSON.stringify(modulePath)};`;
    })
    .join("\n");

  const registrations = schemas
    .map((schema) => `globalThis.__sodSchemas[${JSON.stringify(schema.name)}] = __sod_${schema.name};`)
    .join("\n");

  return `
${imports}
globalThis.__sodSchemas = globalThis.__sodSchemas || {};
${registrations}
`;
}

/**
 * @param {object} options
 * @param {SchemaEntry[]} options.schemas
 * @param {string} options.configDir
 * @param {string} options.outDir
 * @returns {{ schemasPath: string, sizeKB: string }}
 */
export async function bundleSchemas({ schemas, configDir, outDir }) {
  if (schemas.length === 0) {
    throw new Error("sod.config.js must declare at least one schema");
  }

  const tempDir = mkdtempSync(join(tmpdir(), "sod-build-"));
  const shimPath = join(tempDir, "zodShim.js");
  writeFileSync(
    shimPath,
    "export const z = globalThis.z;\nexport default globalThis.z;\n",
  );

  const result = await build({
    stdin: {
      contents: buildEntryContents(schemas, configDir),
      resolveDir: configDir,
      loader: "ts",
      sourcefile: "sod-schemas-entry.ts",
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
    throw new Error("esbuild produced no schema bundle output");
  }

  if (!output.text.includes("globalThis.z")) {
    throw new Error("schemas.bundle.js does not read globalThis.z — the zod alias is not working");
  }

  const schemasPath = join(outDir, "schemas.bundle.js");
  writeFileSync(schemasPath, output.text);

  return {
    schemasPath,
    sizeKB: (output.text.length / 1024).toFixed(1),
  };
}
