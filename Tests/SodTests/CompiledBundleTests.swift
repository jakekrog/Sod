import Foundation
import Testing

@testable import Sod

/// Runs a bundle produced by a real esbuild pipeline, not hand-written JS.
///
/// The other suites prove the API against fixtures written by hand — which can't
/// tell you whether *bundler output* actually loads, because they never went
/// through a bundler. The modules under `fixtures/` are compiled by `@sod/build`
/// via `sod.config.js` the way a consumer compiles their own schemas (Zod
/// external, IIFE, minified), and this suite runs the result. That's what
/// catches Zod failing to resolve to `globalThis.z`, or minified output
/// misbehaving under JavaScriptCore.
///
/// Regenerate the fixtures with `npm run build`; the output is committed so
/// `swift test` needs no Node toolchain.
private func makeSod() async throws -> Sod {
    try await TestFixtures.makeSod(schemaSource: try TestFixtures.schemaBundle())
}

private let compiledSchemaNames: Set<String> = ["Order", "CatalogItem", "Webhook", "Profile"]

private let validOrder = """
{"reference":"A-1","status":"placed","total":{"value":25.5,"currency":"USD"},\
"lines":[{"sku":"TEE","quantity":2}]}
"""

@Suite("a bundler-compiled schema bundle")
struct CompiledBundleTests {
    @Test("registers every schema defined in the fixture module")
    func registers() async throws {
        let sod = try await makeSod()
        #expect(await sod.registeredSchemas == compiledSchemaNames)
    }

    @Test("reads Zod from globalThis rather than embedding its own copy")
    func zodIsExternal() throws {
        // A bundle that inlined Zod would shadow the supplied copy and silently
        // validate against a different version than `activeZodVersion` reports.
        let source = try TestFixtures.schemaBundle()
        #expect(source.contains("globalThis.z"))
        #expect(!source.contains("ZodObject"))
    }
}

@Suite("Order (compiled)")
struct CompiledOrderTests {
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
}

@Suite("CatalogItem (compiled)")
struct CompiledCatalogItemTests {
    @Test("accepts input that passes through a transform")
    func acceptsValid() async throws {
        let sod = try await makeSod()
        try await sod.validate(
            json: #"{"slug":"  widget-pro  ","title":"Widget Pro"}"#,
            against: "CatalogItem"
        )
    }

    @Test("rejects invalid input before transforms run")
    func rejectsInvalid() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(json: #"{"slug":"widget","title":""}"#, against: "CatalogItem")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].path == [.key("title")])
        }
    }
}

@Suite("Webhook (compiled)")
struct CompiledWebhookTests {
    @Test("accepts a discriminated branch")
    func acceptsValid() async throws {
        let sod = try await makeSod()
        try await sod.validate(
            json: #"{"type":"user.created","userId":"550e8400-e29b-41d4-a716-446655440000"}"#,
            against: "Webhook"
        )
    }

    @Test("rejects a branch missing required fields")
    func rejectsIncompleteBranch() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(json: #"{"type":"order.paid","orderId":"A-1"}"#, against: "Webhook")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].path == [.key("amount")])
        }
    }

    @Test("rejects an unknown discriminator")
    func rejectsUnknownType() async throws {
        let sod = try await makeSod()
        await #expect(throws: SodError.self) {
            try await sod.validate(json: #"{"type":"invoice.sent","id":"x"}"#, against: "Webhook")
        }
    }
}

@Suite("Profile (compiled)")
struct CompiledProfileTests {
    @Test("accepts optional, nullable, and defaulted fields")
    func acceptsValid() async throws {
        let sod = try await makeSod()
        try await sod.validate(json: #"{"displayName":"Ada","avatarUrl":null}"#, against: "Profile")
        try await sod.validate(json: #"{"displayName":"Ada","bio":"builder"}"#, against: "Profile")
    }

    @Test("applies a default when the field is omitted")
    func appliesDefault() async throws {
        let sod = try await makeSod()
        try await sod.validate(json: #"{"displayName":"Ada"}"#, against: "Profile")
    }

    @Test("rejects a null display name")
    func rejectsInvalid() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(
                json: #"{"displayName":"","bio":"builder","theme":"dark"}"#,
                against: "Profile"
            )
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].path == [.key("displayName")])
        }
    }
}
