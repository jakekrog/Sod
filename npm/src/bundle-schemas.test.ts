import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { bundleSchemas } from "./bundle-schemas.ts";

describe("bundleSchemas", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function tempProject(): { configDir: string; outDir: string } {
    const configDir = mkdtempSync(join(tmpdir(), "sod-bundle-schemas-"));
    const outDir = mkdtempSync(join(tmpdir(), "sod-bundle-schemas-out-"));
    tempDirs.push(configDir, outDir);

    writeFileSync(
      join(configDir, "widget.ts"),
      `import { z } from "zod";\nexport const Widget = z.object({ id: z.string() });\n`,
    );

    return { configDir, outDir };
  }

  it("throws when no schemas are declared", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "sod-bundle-schemas-out-"));
    tempDirs.push(outDir);

    await expect(
      bundleSchemas({
        schemas: [],
        configDir: tmpdir(),
        outDir,
      }),
    ).rejects.toThrow(/at least one schema/);
  });

  it("bundles schema modules and registers them on globalThis.__sodSchemas", async () => {
    const { configDir, outDir } = tempProject();

    const result = await bundleSchemas({
      schemas: [{ name: "Widget", from: "./widget.ts", export: "Widget" }],
      configDir,
      outDir,
    });

    const source = readFileSync(result.schemasPath, "utf8");

    expect(result.schemasPath).toBe(join(outDir, "schemas.bundle.js"));
    expect(source).toContain("globalThis.z");
    expect(source).toContain("globalThis.__sodSchemas");
    expect(source).toContain("__sodSchemas.Widget");
    expect(result.sizeKB).toMatch(/^\d+\.\d$/);
  });
});
