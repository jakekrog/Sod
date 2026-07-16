# Changelog

Versioned `{zodMajor}.{zodMinor}.{sodPatch}` — the major and minor track the
embedded Zod, the patch is Sod's own. See the README's Versioning section.

## [4.4.0] — 2026-07-15

Initial release. Embeds **Zod 4.4.3**.

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
- `SodRuntimeError` — kept distinct from `SodError`: invalid *data* is something
  to show a user, while a broken bundle is a bug, and conflating them turns a
  bad deployment into what looks like a form message.
- `Sod.bundledZodVersion` — the embedded Zod version, checkable at runtime.
- `scripts/bundle.mjs` — rebuilds the embedded Zod bundle and refuses output
  that isn't JavaScriptCore-safe.
- `scripts/build-fixture.mjs` — compiles `fixtures/exampleSchemas.ts` into the
  test fixture, so the suite exercises real bundler output rather than only
  hand-written JS.

### Notes

- Platforms: iOS 15+, iPadOS 15+, macOS 12+, tvOS 15+, visionOS 1+. Not watchOS
  (no public JavaScriptCore) and not Linux.
- The embedded Zod bundle is ~320 KB.
