# Sod

[![CI](https://github.com/jakekrog/Sod/actions/workflows/ci.yml/badge.svg)](https://github.com/jakekrog/Sod/actions/workflows/ci.yml)

Run real [Zod](https://zod.dev) schemas on Apple platforms.

Swift clients that share a contract with a TypeScript backend usually
re-implement its validation rules — and the two drift apart the moment either
side changes. Sod evaluates the actual schemas in an embedded JavaScriptCore
context, so refinements, transforms, and `superRefine` logic behave exactly as
they do on the server. Because they _are_ the server's schemas.

```swift
let zodSource = try String(contentsOf: zodBundleURL)
let sod = try Sod(zodSource: zodSource, zodVersion: zodVersion)
try await sod.register(source: schemaBundleSource)
try await sod.validate(user, against: "UserCreate")
```

## Install

**Swift package** — add Sod to your app or library:

```swift
.package(url: "https://github.com/jakekrog/Sod.git", from: "0.2.0")
```

**Build tooling** — Sod does not ship Zod. Bundle the Zod version from your
`package.json` and your TypeScript schemas with `@sod/build`:

```bash
npm install -D @sod/build zod esbuild
```

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

- `zod.bundle.js` — sets `globalThis.z` (JavaScriptCore-safe IIFE)
- `zod.bundle.version` — the resolved Zod semver
- `schemas.bundle.js` — registers `globalThis.__sodSchemas`

Add those files to your Xcode target (or load them at runtime). Pass the Zod
bundle to `Sod(zodSource:zodVersion:)` and the schema bundle to
`register(source:)`.

For re-exports or export names that differ from the registry name:

```js
schemas: [
  { name: "Order", from: "./schemas/order.ts", export: "OrderSchema" },
],
```

An optional `zod` field overrides module resolution (for monorepos):

```js
export default {
  zod: "../packages/zod",
  schemas: {/* ... */},
  outDir: "./Generated/Sod",
};
```

**0.x, and it means what SemVer says it means: the API may change.** Sod is
new. It's tested and it works, but nothing here is committed to yet.

**iOS 15+ · iPadOS 15+ · macOS 12+ · tvOS 15+ · visionOS 1+.** Not watchOS —
JavaScriptCore isn't public there — and not Linux.

## How schemas get in

You ship Zod and your schemas; Sod evaluates them. Author schemas in
TypeScript, list them in `sod.config.js`, and run `@sod/build`. The schema
bundle is an IIFE that reads Zod from `globalThis.z` (which you loaded first)
and assigns each schema to `globalThis.__sodSchemas`:

```js
// schemas.bundle.js output, registered via sod.register(source:)
(() => {
  const z = globalThis.z;
  globalThis.__sodSchemas = globalThis.__sodSchemas || {};
  globalThis.__sodSchemas["UserCreate"] = z.object({
    email: z.string().email(),
    age: z.number().int().min(0),
  });
})();
```

Pre-bundling on your side is the boundary: Sod doesn't ship a TypeScript
compiler or a pinned Zod version, and you already run both to produce your web
bundle.

The source is just a `String`, so where it comes from is up to you — compiled
into the app, or downloaded and registered at runtime.

## Errors

`validate` throws two distinct things, and the difference matters:

- **`SodError`** — the _data_ was invalid. Carries every issue Zod reported.
  Show this to a user.
- **`SodRuntimeError`** — _Sod_ couldn't run: an unregistered schema name, a
  broken bundle, an encoding failure. This is a bug or a bad deployment, not a
  form message.

```swift
do {
    try await sod.validate(user, against: "UserCreate")
} catch let error as SodError {
    for issue in error.issues {
        // .path is [PathComponent] — .key("tags"), .index(1) — not a dotted
        // string, so you can map an issue onto a field or row without
        // re-parsing, and an index is never confused with a key named "1".
        print(issue.pathDescription, issue.message)
    }
}
```

`SodIssue.code` is a `String`, not an enum: Zod adds issue codes between minor
versions, and Sod shouldn't need a release to surface one.

## Trust

**Sod is not a sandbox.** It runs the JavaScript you give it, in your process.
The context gets no host bridge, so a bundle can't reach your app's APIs — but
verifying that a bundle is what you think it is (a content hash, a signature, a
trusted origin) is your job, and it must happen _before_ `register(source:)`.
This matters most if you fetch bundles at runtime.

Values you validate never leave the device. JavaScriptCore runs in-process; the
trust boundary is the same as `JSONEncoder`'s.

## Versioning

**Plain SemVer, currently 0.x.** You own your Zod version — Sod no longer embeds
one. Pass the semver from `zod.bundle.version` to `Sod(zodVersion:)` and assert
`sod.activeZodVersion` in your tests so schema bundles are never compiled
against one Zod and executed against another.

**Zod is fixed for a `Sod` instance's lifetime, by design.** Schema objects
capture their `z` when constructed, so swapping Zod under a live instance would
leave already-registered schemas on the old semantics while new ones use the
new — mixed, and invisible in the results. To move Zod versions, build a new
`Sod` and re-register.

## Performance

Creating a `Sod` parses and evaluates your Zod bundle — tens of milliseconds,
once. **Create one and keep it.** Steady-state cost per call is a JSON encode
plus a synchronous JS call. Your Zod bundle adds ~320 KB to your app; a
`JSContext` costs low-single-digit MB of memory.

## Development

```bash
swift test          # requires no Node toolchain
swift package plugin --allow-writing-to-package-directory swiftlint -- lint --strict
npm install         # only for @sod/build
npm run lint        # oxlint
npm run fmt:check   # oxfmt
npm run build       # regenerates Tests/SodTests/Fixtures/
```

Test fixtures under `Tests/SodTests/Fixtures/` are checked in deliberately, so
`swift test` needs no Node toolchain. `@sod/build` regenerates them from
`fixtures/exampleSchemas.ts` via `sod.config.js`.

The suite runs a **bundler-compiled** fixture, not only hand-written JS: a
hand-written fixture can't tell you whether real bundler output loads — it
never went through a bundler — so this is what catches Zod failing to resolve
to `globalThis.z`, or minified output misbehaving under JavaScriptCore.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching, merge strategy, and
release process.

## License

MIT. Your app bundles Zod separately under its own MIT license — see
[LICENSE](LICENSE).
