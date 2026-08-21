import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./load-config.ts";

describe("loadConfig", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function tempProject(configBody: string): string {
    const dir = mkdtempSync(join(tmpdir(), "sod-load-config-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "sod.config.js"), configBody);
    return dir;
  }

  it("throws when no config exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sod-load-config-"));
    tempDirs.push(dir);

    await expect(loadConfig(dir)).rejects.toThrow(/No sod.config.js found/);
  });

  it("loads object-map schemas with default export names", async () => {
    const dir = tempProject(`export default {
  schemas: { Widget: "./widget.ts" },
  outDir: "./out",
};`);

    const config = await loadConfig(dir);

    expect(config.schemas).toEqual([{ name: "Widget", from: "./widget.ts", export: "Widget" }]);
    expect(config.outDir).toBe(join(dir, "out"));
    expect(config.zod).toBeUndefined();
  });

  it("loads array schemas with explicit export names", async () => {
    const dir = tempProject(`export default {
  schemas: [{ name: "Widget", from: "./widget.ts", export: "WidgetSchema" }],
};`);

    const config = await loadConfig(dir);

    expect(config.schemas).toEqual([
      { name: "Widget", from: "./widget.ts", export: "WidgetSchema" },
    ]);
  });

  it("uses schema name as export when array entry omits export", async () => {
    const dir = tempProject(`export default {
  schemas: [{ name: "Widget", from: "./widget.ts" }],
};`);

    const config = await loadConfig(dir);

    expect(config.schemas).toEqual([{ name: "Widget", from: "./widget.ts", export: "Widget" }]);
  });

  it("resolves outDir relative to the config directory", async () => {
    const dir = tempProject(`export default {
  schemas: { Widget: "./widget.ts" },
  outDir: "../generated",
};`);

    const config = await loadConfig(dir);

    expect(config.outDir).toBe(join(dir, "../generated"));
  });

  it("loads optional zod override", async () => {
    const dir = tempProject(`export default {
  schemas: { Widget: "./widget.ts" },
  zod: "zod",
};`);

    const config = await loadConfig(dir);

    expect(config.zod).toBe("zod");
  });

  it("rejects invalid schemas shape", async () => {
    const dir = tempProject(`export default {
  schemas: "not-valid",
};`);

    await expect(loadConfig(dir)).rejects.toThrow(/object map or array/);
  });

  it("rejects empty outDir", async () => {
    const dir = tempProject(`export default {
  schemas: { Widget: "./widget.ts" },
  outDir: "",
};`);

    await expect(loadConfig(dir)).rejects.toThrow(/outDir.*non-empty string/);
  });

  it("rejects empty zod override", async () => {
    const dir = tempProject(`export default {
  schemas: { Widget: "./widget.ts" },
  zod: "",
};`);

    await expect(loadConfig(dir)).rejects.toThrow(/zod.*non-empty module specifier/);
  });
});
