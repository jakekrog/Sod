# Changelog

Plain SemVer. Each release records notable API changes.

## [0.2.0] — 2026-08-20

### Breaking

- Sod no longer embeds Zod. Consumers must bundle their own Zod version with
  `sod-build` and pass it to `Sod(zodSource:zodVersion:)`.
- Removed `Sod.bundledZodVersion`. Use `sod.activeZodVersion` instead.
- Removed `Sod()` parameterless initializer.

### Added

- `sod-build` npm package — `npx sod build` produces `zod.bundle.js`,
  `zod.bundle.version`, and `schemas.bundle.js` from `sod.config.js`.
- `sod-build` programmatic API — `build()`, `loadConfig()`, `bundleZod()`, and
  `bundleSchemas()` with TypeScript types.
- `Sod(zodSource:zodVersion:)` — loads a consumer-supplied Zod bundle.
- `Sod.activeZodVersion` — the Zod semver passed at init, when provided.
- GitHub Actions CI — Swift tests and SwiftLint on macOS; npm lint, format, test,
  and build (Node 22/24/26) on Ubuntu.
- pre-commit hooks — SwiftLint, oxlint, and oxfmt (see `CONTRIBUTING.md`).
- npm Release workflow — manual publish of `sod-build` via GitHub Actions.

### Changed

- `sod-build` rewritten in TypeScript and bundled with tsdown; CLI and bundle
  output format are unchanged.
- npm package published as unscoped `sod-build` (the `@sod` org on npm is
  unavailable).

### Removed

- Embedded `Sources/Sod/Resources/zod.bundle.js` and `zod.bundle.version`.
- `scripts/bundle.mjs` and `scripts/build-fixture.mjs` (replaced by
  `sod-build`).

## [0.1.0] — 2026-07-15

Initial release. Embeds **Zod 4.4.3**.

0.x: the API may change. It's tested and it works, but nothing is committed to
yet.

### Added

- `Sod` — an `actor` owning one long-lived `JSContext`. `JSContext` must not be
  used concurrently, so every call is serialized and the context never escapes.
- `register(source:)` — evaluates a pre-bundled schema source. Bundles assign to
  `globalThis.__sodSchemas`; Zod is external and supplied as `globalThis.z`.
- `validate(_:against:)` for any `Encodable`, and `validate(json:against:)` for
  values that are already JSON.
- `SodError` / `SodIssue` — every issue Zod reported, with a typed
  `[PathComponent]` path so callers can map issues to fields without re-parsing
  a dotted string (and so an array index is never confused with a key named
  `"0"`). `SodIssue.code` is a `String` for forward compatibility with Zod
  releases that add codes.
- `SodRuntimeError` — kept distinct from `SodError`: invalid _data_ is something
  to show a user, while a broken bundle is a bug, and conflating them turns a
  bad deployment into what looks like a form message.
- `Sod.bundledZodVersion` — the embedded Zod version, checkable at runtime.
- `scripts/bundle.mjs` — rebuilds the embedded Zod bundle and refuses output
  that isn't JavaScriptCore-safe.
- `scripts/build-fixture.mjs` — compiles fixture schemas into the test bundle, so
  the suite exercises real bundler output rather than only hand-written JS.

### Notes

- Platforms: iOS 15+, iPadOS 15+, macOS 12+, tvOS 15+, visionOS 1+. Not watchOS
  (no public JavaScriptCore) and not Linux.
- The embedded Zod bundle is ~320 KB.
