import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { bundleZod } from "./bundle-zod.ts";

const repoRoot = join(fileURLToPath(import.meta.url), "../../..");

describe("bundleZod", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function tempOutDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "sod-bundle-zod-"));
    tempDirs.push(dir);
    return dir;
  }

  it("bundles workspace zod and writes versioned artifacts", async () => {
    const outDir = tempOutDir();
    const expectedVersion = JSON.parse(
      readFileSync(join(repoRoot, "node_modules/zod/package.json"), "utf8"),
    ).version as string;

    const result = await bundleZod({
      resolveDir: repoRoot,
      outDir,
    });

    expect(result.version).toBe(expectedVersion);
    expect(readFileSync(result.versionPath, "utf8")).toBe(`${expectedVersion}\n`);
    expect(readFileSync(result.zodPath, "utf8").length).toBeGreaterThan(0);
    expect(result.sizeKB).toMatch(/^\d+\.\d$/);
  });

  it("produces JSC-safe output without forbidden Node patterns", async () => {
    const outDir = tempOutDir();

    await bundleZod({
      resolveDir: repoRoot,
      outDir,
    });

    const source = readFileSync(join(outDir, "zod.bundle.js"), "utf8");

    expect(source).not.toContain("require(");
    expect(source).not.toContain("process.");
    expect(source).not.toContain("setTimeout(");
    expect(source).not.toContain("module.exports");
  });
});
