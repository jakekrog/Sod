/**
 * Loads and validates `sod.config.{js,mjs,cjs}` from a project directory.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG_NAMES = ["sod.config.js", "sod.config.mjs", "sod.config.cjs"];

/**
 * @typedef {object} SodConfig
 * @property {string} configPath - Absolute path to the loaded config file
 * @property {string} configDir - Directory containing the config file
 * @property {string} outDir - Absolute output directory
 * @property {string} [zod] - Optional module specifier or path override for Zod
 * @property {import("./bundle-schemas.mjs").SchemaEntry[]} schemas
 */

/**
 * @param {unknown} schemas
 * @returns {import("./bundle-schemas.mjs").SchemaEntry[]}
 */
function normalizeSchemas(schemas) {
  if (Array.isArray(schemas)) {
    return schemas.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`schemas[${index}] must be an object`);
      }
      const { name, from, export: exportName } = entry;
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(`schemas[${index}].name must be a non-empty string`);
      }
      if (typeof from !== "string" || from.length === 0) {
        throw new Error(`schemas[${index}].from must be a non-empty string`);
      }
      return {
        name,
        from,
        export: typeof exportName === "string" && exportName.length > 0 ? exportName : name,
      };
    });
  }

  if (typeof schemas === "object" && schemas !== null) {
    return Object.entries(schemas).map(([name, from]) => {
      if (typeof from !== "string" || from.length === 0) {
        throw new Error(`schemas.${name} must be a non-empty module path string`);
      }
      return { name, from, export: name };
    });
  }

  throw new Error("sod.config.js must declare `schemas` as an object map or array");
}

/**
 * @param {string} [projectDir]
 * @returns {Promise<SodConfig>}
 */
export async function loadConfig(projectDir = process.cwd()) {
  const root = resolve(projectDir);
  const configPath = CONFIG_NAMES.map((name) => join(root, name)).find((path) => existsSync(path));

  if (configPath === undefined) {
    throw new Error(
      `No sod.config.js found in ${root}. Create one next to package.json.`,
    );
  }

  const configDir = dirname(configPath);
  const module = await import(pathToFileURL(configPath).href);
  const raw = module.default ?? module;

  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${configPath} must default-export a configuration object`);
  }

  const outDirRaw = raw.outDir ?? "./Generated/Sod";
  if (typeof outDirRaw !== "string" || outDirRaw.length === 0) {
    throw new Error("sod.config.js `outDir` must be a non-empty string");
  }

  const zod = raw.zod;
  if (zod !== undefined && (typeof zod !== "string" || zod.length === 0)) {
    throw new Error("sod.config.js `zod` must be a non-empty module specifier when provided");
  }

  return {
    configPath,
    configDir,
    outDir: resolve(configDir, outDirRaw),
    zod,
    schemas: normalizeSchemas(raw.schemas),
  };
}
