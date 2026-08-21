import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "./index.ts";

const repoRoot = join(fileURLToPath(import.meta.url), "../../..");

describe("build", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function tempProject(): string {
    const dir = mkdtempSync(join(tmpdir(), "sod-build-"));
    tempDirs.push(dir);

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "sod-build-test", type: "module" }, null, 2),
    );
    writeFileSync(
      join(dir, "widget.ts"),
      `import { z } from "zod";\nexport const Widget = z.object({ id: z.string() });\n`,
    );
    writeFileSync(
      join(dir, "sod.config.js"),
      `export default {
  schemas: { Widget: "./widget.ts" },
  outDir: "./generated",
};`,
    );
    symlinkSync(join(repoRoot, "node_modules"), join(dir, "node_modules"), "dir");

    return dir;
  }

  it("builds zod and schema bundles from sod.config.js", async () => {
    const projectDir = tempProject();

    const result = await build({ projectDir });

    expect(result.config.schemas).toEqual([
      { name: "Widget", from: "./widget.ts", export: "Widget" },
    ]);
    expect(existsSync(result.zod.zodPath)).toBe(true);
    expect(existsSync(result.zod.versionPath)).toBe(true);
    expect(existsSync(result.schemas.schemasPath)).toBe(true);
    expect(readFileSync(result.zod.versionPath, "utf8").trim().length).toBeGreaterThan(0);
    expect(readFileSync(result.schemas.schemasPath, "utf8")).toContain("globalThis.__sodSchemas");
  });
});
