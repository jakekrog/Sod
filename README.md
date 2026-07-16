# Sod

Run real [Zod](https://zod.dev) schemas on Apple platforms.

Swift clients that share a contract with a TypeScript backend usually
re-implement its validation rules — and the two drift apart the moment either
side changes. Sod evaluates the actual schemas in an embedded JavaScriptCore
context, so refinements, transforms, and `superRefine` logic behave exactly as
they do on the server. Because they *are* the server's schemas.

```swift
let sod = try Sod()
try await sod.register(source: schemaBundleSource)
try await sod.validate(user, against: "UserCreate")
```

## Install

```swift
.package(url: "https://github.com/jakekrog/Sod.git", from: "4.4.0")
```

**iOS 15+ · iPadOS 15+ · macOS 12+ · tvOS 15+ · visionOS 1+.** Not watchOS —
JavaScriptCore isn't public there — and not Linux.

## How schemas get in

Sod ships Zod; you ship your schemas. Author them in TypeScript and pre-bundle
with esbuild, marking Zod **external** (Sod provides it as `globalThis.z`) and
assigning each schema to `globalThis.__sodSchemas`:

```js
// build output, registered via sod.register(source:)
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
compiler or an esbuild port, and you already run both to produce your web
bundle.

The source is just a `String`, so where it comes from is up to you — compiled
into the app, or downloaded and registered at runtime.

## Errors

`validate` throws two distinct things, and the difference matters:

- **`SodError`** — the *data* was invalid. Carries every issue Zod reported.
  Show this to a user.
- **`SodRuntimeError`** — *Sod* couldn't run: an unregistered schema name, a
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
trusted origin) is your job, and it must happen *before* `register(source:)`.
This matters most if you fetch bundles at runtime.

Values you validate never leave the device. JavaScriptCore runs in-process; the
trust boundary is the same as `JSONEncoder`'s.

## Versioning

`{zodMajor}.{zodMinor}.{sodPatch}` — **`4.4.0` embeds Zod 4.4.x.**

Pinning a Sod version implicitly pins a Zod version, so the scheme makes that
contract visible and resolvable. The patch is Sod's to spend on a Zod patch
bump, a Swift fix, or a docs release. `Sod.bundledZodVersion` reports the exact
embedded version at runtime — assert against it in your tests if your schema
bundles are compiled against a Zod from `package.json`, since those two must
agree or your bundles are compiled against one Zod and executed against another.

Build metadata (`4.4.0+zod.4.4.3`) was rejected: SemVer excludes it from
precedence, so SwiftPM couldn't pin it.

## Performance

Creating a `Sod` parses and evaluates the Zod bundle — tens of milliseconds,
once. **Create one and keep it.** Steady-state cost per call is a JSON encode
plus a synchronous JS call. The embedded bundle adds ~320 KB to your app; a
`JSContext` costs low-single-digit MB of memory.

## Development

```bash
swift test                     # requires no Node toolchain
npm install                    # only for the two scripts below
node scripts/bundle.mjs        # only when moving to a new Zod version
node scripts/build-fixture.mjs # only when changing the test fixture's schema
```

`Sources/Sod/Resources/zod.bundle.js` is checked in deliberately, so consumers
need no Node toolchain. `scripts/bundle.mjs` regenerates it and refuses output
that isn't JavaScriptCore-safe (no `require`, `process`, timers, or CommonJS
exports — JSC is a bare engine with no module loader and no host globals).

The suite runs a **bundler-compiled** fixture, not only hand-written JS:
`fixtures/exampleSchemas.ts` is compiled by `scripts/build-fixture.mjs` exactly
the way a consumer compiles their schemas. A hand-written fixture can't tell you
whether real bundler output loads — it never went through a bundler — so this is
what catches Zod failing to resolve to `globalThis.z`, or minified output
misbehaving under JavaScriptCore. It doubles as a worked example of the consumer
build.

## License

MIT. Embeds Zod, also MIT — see [LICENSE](LICENSE).
