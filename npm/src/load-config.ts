/**
 * Loads and validates `sod.config.{js,mjs,cjs}` from a project directory.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { SchemaEntry } from "./bundle-schemas.ts";

const CONFIG_NAMES = ["sod.config.js", "sod.config.mjs", "sod.config.cjs"];

export interface SodConfig {
  /** Absolute path to the loaded config file */
  configPath: string;
  /** Directory containing the config file */
  configDir: string;
  /** Absolute output directory */
  outDir: string;
  /** Optional module specifier or path override for Zod */
  zod?: string;
  schemas: SchemaEntry[];
}

function normalizeSchemas(schemas: unknown): SchemaEntry[] {
  if (Array.isArray(schemas)) {
    return schemas.map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`schemas[${index}] must be an object`);
      }
      const { name, from, export: exportName } = entry as Record<string, unknown>;
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

export async function loadConfig(projectDir: string = process.cwd()): Promise<SodConfig> {
  const root = resolve(projectDir);
  const configPath = CONFIG_NAMES.map((name) => join(root, name)).find((path) => existsSync(path));

  if (configPath === undefined) {
    throw new Error(`No sod.config.js found in ${root}. Create one next to package.json.`);
  }

  const configDir = dirname(configPath);
  const mod = (await import(pathToFileURL(configPath).href)) as { default?: unknown };
  const raw = (mod.default ?? mod) as Record<string, unknown>;

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
    zod: typeof zod === "string" ? zod : undefined,
    schemas: normalizeSchemas(raw.schemas),
  };
}
