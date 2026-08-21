#!/usr/bin/env node
/**
 * CLI for `sod-build`.
 *
 *   sod build         zod.bundle.js + schemas.bundle.js + zod.bundle.version
 *   sod bundle-zod    zod.bundle.js + zod.bundle.version only
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build, bundleZod, findConfig, loadConfig } from "./index.ts";

const GENERAL_HELP = `Usage: sod <command> [options]

Commands:
  build         Bundle the Zod runtime, your schemas, and the version file from
                sod.config.js.
  bundle-zod    Bundle only the Zod runtime (zod.bundle.js + zod.bundle.version).
                For consumers that bundle their own schemas, or only need the
                on-device Zod. No sod.config.js required.

Run \`sod <command> --help\` for command-specific options.
`;

const BUNDLE_ZOD_HELP = `Usage: sod bundle-zod [options]

Bundle the consumer's Zod into a JavaScriptCore-safe IIFE (globalThis.z) plus a
zod.bundle.version file.

Options:
  --out <dir>    Output directory (default: outDir from sod.config.js if present,
                 else ./Generated/Sod)
  --zod <spec>   Zod module specifier or path override (default: "zod", or the
                 \`zod\` field from sod.config.js)
  --cwd <dir>    Directory to resolve Zod from and find sod.config.js
                 (default: current directory)
  -h, --help
`;

interface BundleZodFlags {
  out?: string;
  zod?: string;
  cwd?: string;
  help: boolean;
}

function parseBundleZodFlags(args: string[]): BundleZodFlags {
  const flags: BundleZodFlags = { help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = (label: string): string => {
      const next = args[i + 1];
      if (next === undefined) {
        throw new Error(`${label} requires a value`);
      }
      i += 1;
      return next;
    };
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
    } else if (arg === "--out") {
      flags.out = value("--out");
    } else if (arg === "--zod") {
      flags.zod = value("--zod");
    } else if (arg === "--cwd") {
      flags.cwd = value("--cwd");
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return flags;
}

async function runBuild(): Promise<void> {
  const { zod, schemas } = await build();
  console.log(`zod.bundle.js         ${zod.sizeKB} KB  (Zod ${zod.version})`);
  console.log(`zod.bundle.version    ${zod.version}`);
  console.log(`schemas.bundle.js     ${schemas.sizeKB} KB`);
}

async function runBundleZod(args: string[]): Promise<void> {
  const flags = parseBundleZodFlags(args);
  if (flags.help) {
    console.log(BUNDLE_ZOD_HELP);
    return;
  }

  const resolveDir = resolve(flags.cwd ?? process.cwd());

  let configOutDir: string | undefined;
  let configZod: string | undefined;
  if (findConfig(resolveDir) !== undefined) {
    const config = await loadConfig(resolveDir, { requireSchemas: false });
    configOutDir = config.outDir;
    configZod = config.zod;
  }

  const outDir =
    flags.out !== undefined
      ? resolve(resolveDir, flags.out)
      : (configOutDir ?? resolve(resolveDir, "./Generated/Sod"));
  const zodImport = flags.zod ?? configZod ?? "zod";

  mkdirSync(outDir, { recursive: true });
  const result = await bundleZod({ resolveDir, zodImport, outDir });
  console.log(`zod.bundle.js         ${result.sizeKB} KB  (Zod ${result.version})`);
  console.log(`zod.bundle.version    ${result.version}`);
}

const [command, ...rest] = process.argv.slice(2);

if (command === undefined || command === "--help" || command === "-h") {
  console.log(GENERAL_HELP);
  process.exit(command === undefined ? 1 : 0);
}

try {
  if (command === "build") {
    await runBuild();
  } else if (command === "bundle-zod") {
    await runBundleZod(rest);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run sod --help for usage.");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
