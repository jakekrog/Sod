import Foundation
import Testing

@testable import Sod

/// Runs a bundle produced by a real esbuild pipeline, not hand-written JS.
///
/// The other suites prove the API against fixtures written by hand — which can't
/// tell you whether *bundler output* actually loads, because they never went
/// through a bundler. `fixtures/exampleSchemas.ts` is compiled by
/// `scripts/build-fixture.mjs` the way a consumer compiles their own schemas
/// (Zod external, IIFE, minified), and this suite runs the result. That's what
/// catches Zod failing to resolve to `globalThis.z`, or minified output
/// misbehaving under JavaScriptCore.
///
/// Regenerate the fixture with `node scripts/build-fixture.mjs`; the output is
/// committed so `swift test` needs no Node toolchain.
private func loadFixture() throws -> String {
    guard
        let url = Bundle.module.url(
            forResource: "example.bundle",
            withExtension: "js",
            subdirectory: "Fixtures"
        ) ?? Bundle.module.url(forResource: "example.bundle", withExtension: "js")
    else {
        Issue.record("fixture missing — run: node scripts/build-fixture.mjs")
        throw SodRuntimeError.bundleResourceMissing("example.bundle.js")
    }
    return try String(contentsOf: url, encoding: .utf8)
}

private func makeSod() async throws -> Sod {
    let sod = try Sod()
    try await sod.register(source: try loadFixture())
    return sod
}

private let validOrder = """
{"reference":"A-1","status":"placed","total":{"value":25.5,"currency":"USD"},\
"lines":[{"sku":"TEE","quantity":2}]}
"""

@Suite("a bundler-compiled schema bundle")
struct CompiledBundleTests {
    @Test("registers the schemas it defines")
    func registers() async throws {
        let sod = try await makeSod()
        #expect(await sod.registeredSchemas == ["Order"])
    }

    @Test("accepts a valid value")
    func acceptsValid() async throws {
        let sod = try await makeSod()
        try await sod.validate(json: validOrder, against: "Order")
    }

    @Test("enforces a plain structural rule")
    func rejectsBadEnum() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(
                json: #"{"reference":"A-1","status":"exploded","total":{"value":1,"currency":"USD"},"lines":[{"sku":"X","quantity":1}]}"#,
                against: "Order"
            )
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].path == [.key("status")])
        }
    }

    @Test("runs superRefine logic through the compiled bundle")
    func runsRefinements() async throws {
        // The reason Sod exists, exercised end to end: this rule survives
        // TypeScript → esbuild → minification → JavaScriptCore. Nothing about it
        // is expressible in JSON Schema or a generated Swift struct.
        let sod = try await makeSod()
        do {
            try await sod.validate(
                json: #"{"reference":"A-1","status":"placed","total":{"value":1,"currency":"ZZZ"},"lines":[{"sku":"X","quantity":1}]}"#,
                against: "Order"
            )
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].message.contains("not a supported currency"))
            #expect(error.issues[0].path == [.key("total"), .key("currency")])
        }
    }

    @Test("applies per-currency precision, not a hardcoded two decimals")
    func perCurrencyPrecision() async throws {
        let sod = try await makeSod()
        func check(_ value: String, _ currency: String) async throws {
            try await sod.validate(
                json: #"{"reference":"A-1","status":"placed","total":{"value":\#(value),"currency":"\#(currency)"},"lines":[{"sku":"X","quantity":1}]}"#,
                against: "Order"
            )
        }
        try await check("1000", "JPY") // 0 decimals
        try await check("1.5", "KWD") // 3 decimals
        await #expect(throws: SodError.self) { try await check("1000.5", "JPY") }
        await #expect(throws: SodError.self) { try await check("1.005", "USD") }
    }

    @Test("reports an array index as an index, not a key")
    func arrayIndexPaths() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(
                json: #"{"reference":"A-1","status":"placed","total":{"value":1,"currency":"USD"},"lines":[{"sku":"X","quantity":1},{"sku":"Y","quantity":0}]}"#,
                against: "Order"
            )
            Issue.record("expected a SodError")
        } catch let error as SodError {
            // Why `path` is [PathComponent]: this is index 1, not a key "1".
            #expect(error.issues[0].path == [.key("lines"), .index(1), .key("quantity")])
        }
    }

    @Test("reads Zod from globalThis rather than embedding its own copy")
    func zodIsExternal() throws {
        // A bundle that inlined Zod would shadow Sod's and silently validate
        // against a different version than `bundledZodVersion` reports.
        let source = try loadFixture()
        #expect(source.contains("globalThis.z"))
        #expect(!source.contains("ZodObject"))
    }
}
