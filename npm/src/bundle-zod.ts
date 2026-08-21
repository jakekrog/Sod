/**
 * Bundles the consumer's `zod` dependency into a JavaScriptCore-safe IIFE that
 * assigns `globalThis.z`.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { writeFileSync } from "node:fs";

export interface ZodBundleResult {
  zodPath: string;
  versionPath: string;
  version: string;
  sizeKB: string;
}

const FORBIDDEN: readonly (readonly [string, string])[] = [
  ["require(", "CommonJS require"],
  ["process.", "Node process"],
  ["setTimeout(", "timers (JSC has none unless the host provides them)"],
  ["module.exports", "CommonJS exports"],
];

export async function bundleZod(options: {
  resolveDir: string;
  zodImport?: string;
  outDir: string;
}): Promise<ZodBundleResult> {
  const { resolveDir, zodImport = "zod", outDir } = options;
  const require = createRequire(join(resolveDir, "package.json"));
  const isPath = zodImport.startsWith(".") || zodImport.startsWith("/");
  const zodPackageJson = isPath
    ? join(resolve(resolveDir, zodImport), "package.json")
    : require.resolve(`${zodImport}/package.json`);
  const zodVersion = (require(zodPackageJson) as { version: string }).version;
  const zodResolveDir = dirname(zodPackageJson);
  const zodModuleSpecifier = isPath ? dirname(zodPackageJson) : zodImport;

  const result = await build({
    stdin: {
      contents: `
        import * as zod from ${JSON.stringify(zodModuleSpecifier)};
        globalThis.z = zod.z ?? zod;
      `,
      resolveDir: zodResolveDir,
      loader: "js",
      sourcefile: "zod-entry.js",
    },
    bundle: true,
    write: false,
    format: "iife",
    platform: "neutral",
    target: ["es2020"],
    minify: true,
    sourcemap: false,
    legalComments: "none",
  });

  const [output] = result.outputFiles;
  if (output === undefined) {
    throw new Error("esbuild produced no Zod bundle output");
  }

  const source = output.text;
  for (const [needle, why] of FORBIDDEN) {
    if (source.includes(needle)) {
      throw new Error(`zod.bundle.js contains ${needle} — ${why}. Not JSC-safe.`);
    }
  }

  const zodPath = join(outDir, "zod.bundle.js");
  const versionPath = join(outDir, "zod.bundle.version");
  writeFileSync(zodPath, source);
  writeFileSync(versionPath, `${zodVersion}\n`);

  return {
    zodPath,
    versionPath,
    version: zodVersion,
    sizeKB: (source.length / 1024).toFixed(1),
  };
}
