# sod-build

Build JavaScriptCore-safe Zod and schema bundles for [Sod](https://github.com/jakekrog/Sod) on Apple platforms.

Sod evaluates real Zod schemas in an embedded JavaScriptCore context. This package bundles the Zod version from your `package.json` and your TypeScript schemas into IIFEs that Sod loads at runtime.

## Install

```bash
npm install -D sod-build zod esbuild
```

Peer dependencies: **Zod 4+** and **esbuild 0.20+** (supplied by your project).

## Quick start

Create `sod.config.js` next to your `package.json`:

```js
export default {
  schemas: {
    UserCreate: "./schemas/user.ts",
    Order: "./schemas/order.ts",
  },
  outDir: "./Generated/Sod",
};
```

Run the build:

```bash
npx sod build
```

This writes three files to `outDir`:

| File                 | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| `zod.bundle.js`      | Sets `globalThis.z` (JavaScriptCore-safe IIFE) |
| `zod.bundle.version` | Resolved Zod semver                            |
| `schemas.bundle.js`  | Registers `globalThis.__sodSchemas`            |

Add those files to your Xcode target (or load them at runtime). Pass the Zod bundle to `Sod(zodSource:zodVersion:)` and the schema bundle to `register(source:)` in the Sod Swift package.

## Configuration

`sod.config.js` (or `.mjs` / `.cjs`) supports:

```js
export default {
  // Optional: override Zod module resolution (monorepos)
  zod: "../packages/zod",

  // Registry name must match the exported schema name
  schemas: {
    Order: "./schemas/order.ts",
  },

  outDir: "./Generated/Sod", // default: ./Generated/Sod
};
```

When the export name differs from the registry name:

```js
schemas: [
  { name: "Order", from: "./schemas/order.ts", export: "OrderSchema" },
],
```

## Programmatic API

```js
import { build, loadConfig } from "sod-build";

const { zod, schemas, config } = await build({ projectDir: "/path/to/project" });
console.log(zod.version, zod.sizeKB, schemas.sizeKB);
```

## Requirements

- Node.js 18+

## License

MIT — see [LICENSE](./LICENSE). Zod is bundled separately under its own MIT license in your app.

## Links

- [Sod (Swift package)](https://github.com/jakekrog/Sod)
- [Issues](https://github.com/jakekrog/Sod/issues)
