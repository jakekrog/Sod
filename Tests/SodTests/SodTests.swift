import Foundation
import Testing

@testable import Sod

/// A schema bundle, hand-written the way esbuild would emit one: Zod marked
/// external (read from `globalThis.z`) and schemas assigned to
/// `globalThis.__sodSchemas`.
private let userBundle = """
(() => {
  const z = globalThis.z;
  globalThis.__sodSchemas = globalThis.__sodSchemas || {};
  globalThis.__sodSchemas["UserCreate"] = z.object({
    email: z.string().email(),
    age: z.number().int().min(0).max(150),
    tags: z.array(z.string()).optional(),
  });
  globalThis.__sodSchemas["Money"] = z.object({
    value: z.number().nonnegative(),
    currency: z.string(),
  }).superRefine((money, ctx) => {
    if (money.currency !== money.currency.toUpperCase()) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "currency must be uppercase" });
    }
  });
})();
"""

private struct User: Encodable {
    let email: String
    let age: Int
    let tags: [String]?
}

private func makeSod() async throws -> Sod {
    let sod = try Sod()
    try await sod.register(source: userBundle)
    return sod
}

@Suite("Zod bundle")
struct BundleTests {
    @Test("reports the Zod version it embeds")
    func bundledVersion() {
        // Pinning Sod pins Zod; consumers assert against this so a drift between
        // their schema bundle's Zod and ours can't go unnoticed.
        #expect(Sod.bundledZodVersion == "4.4.3")
    }

    @Test("loads Zod into a fresh context")
    func loadsZod() throws {
        let runtime = try JSRuntime()
        try runtime.loadZod()
        let version = try runtime.evaluate("typeof globalThis.z", context: "probe")
        #expect(version.toString() == "object")
    }
}

@Suite("register")
struct RegisterTests {
    @Test("makes a bundle's schemas available")
    func registersSchemas() async throws {
        let sod = try await makeSod()
        let names = await sod.registeredSchemas
        #expect(names.contains("UserCreate"))
        #expect(names.contains("Money"))
    }

    @Test("rejects a bundle that registers nothing")
    func rejectsEmptyBundle() async throws {
        let sod = try Sod()
        await #expect(throws: SodRuntimeError.self) {
            try await sod.register(source: "(() => { var unused = 1; })();")
        }
    }

    @Test("surfaces a throwing bundle as a runtime error, not a validation error")
    func surfacesBundleException() async throws {
        let sod = try Sod()
        await #expect(throws: SodRuntimeError.self) {
            try await sod.register(source: "throw new Error('boom');")
        }
    }

    @Test("accepts more than one bundle")
    func multipleBundles() async throws {
        let sod = try await makeSod()
        try await sod.register(
            source: """
            (() => {
              const z = globalThis.z;
              globalThis.__sodSchemas["Extra"] = z.object({ ok: z.boolean() });
            })();
            """
        )
        let names = await sod.registeredSchemas
        #expect(names.isSuperset(of: ["UserCreate", "Money", "Extra"]))
    }
}

@Suite("validate")
struct ValidateTests {
    @Test("accepts a valid value")
    func acceptsValid() async throws {
        let sod = try await makeSod()
        try await sod.validate(
            User(email: "a@example.com", age: 30, tags: ["x"]),
            against: "UserCreate"
        )
    }

    @Test("throws SodError with Zod's issues for an invalid value")
    func rejectsInvalid() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(User(email: "nope", age: 30, tags: nil), against: "UserCreate")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues.count == 1)
            #expect(error.issues[0].path == [.key("email")])
        }
    }

    @Test("reports every issue, not just the first")
    func reportsAllIssues() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(User(email: "nope", age: -5, tags: nil), against: "UserCreate")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues.count == 2)
            #expect(Set(error.issues.map(\.pathDescription)) == ["email", "age"])
        }
    }

    @Test("distinguishes an array index from a string key in a path")
    func typedPaths() async throws {
        let sod = try await makeSod()
        do {
            try await sod.validate(json: #"{"email":"a@b.com","age":1,"tags":["ok",42]}"#, against: "UserCreate")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            // The reason path is [PathComponent] and not a dotted string: this
            // is an index, not a key literally named "1".
            #expect(error.issues[0].path == [.key("tags"), .index(1)])
        }
    }

    @Test("runs superRefine logic, not just structural checks")
    func runsRefinements() async throws {
        // The whole reason Sod exists: this rule can't be expressed in JSON
        // Schema or a generated Swift struct, but it runs here unchanged.
        let sod = try await makeSod()
        try await sod.validate(json: #"{"value":25,"currency":"USD"}"#, against: "Money")
        do {
            try await sod.validate(json: #"{"value":25,"currency":"usd"}"#, against: "Money")
            Issue.record("expected a SodError")
        } catch let error as SodError {
            #expect(error.issues[0].message == "currency must be uppercase")
            #expect(error.issues[0].path == [.key("currency")])
        }
    }

    @Test("throws a runtime error for an unregistered schema")
    func unregisteredSchema() async throws {
        let sod = try await makeSod()
        await #expect(throws: SodRuntimeError.schemaNotRegistered("Nope")) {
            try await sod.validate(json: "{}", against: "Nope")
        }
    }

    @Test("treats a value that looks like code as data")
    func injectionIsData() async throws {
        // The value crosses as a JSON literal, never interpolated into an
        // expression — a string that looks like JS must validate as a string.
        let sod = try await makeSod()
        do {
            try await sod.validate(
                json: #"{"email":"\"); globalThis.pwned = true; (\"","age":30}"#,
                against: "UserCreate"
            )
            Issue.record("expected a SodError for the malformed email")
        } catch is SodError {
            let runtime = try JSRuntime()
            try runtime.loadZod()
            let pwned = try runtime.evaluate("typeof globalThis.pwned", context: "probe")
            #expect(pwned.toString() == "undefined")
        }
    }

    @Test("encodes dates as ISO 8601 by default")
    func iso8601Dates() async throws {
        let sod = try Sod()
        try await sod.register(
            source: """
            (() => {
              const z = globalThis.z;
              globalThis.__sodSchemas = globalThis.__sodSchemas || {};
              globalThis.__sodSchemas["Dated"] = z.object({ at: z.iso.datetime() });
            })();
            """
        )
        struct Dated: Encodable { let at: Date }
        try await sod.validate(Dated(at: Date(timeIntervalSince1970: 0)), against: "Dated")
    }
}

@Suite("result decoding")
struct ResultDecodingTests {
    @Test("tolerates issues missing optional fields")
    func tolerantDecoding() throws {
        // Zod omits expected/received for most custom issues, and adds fields
        // between minors. Neither should turn a validation failure into a crash.
        let json = #"{"success":false,"issues":[{"code":"custom","path":["a"],"message":"nope"}]}"#
        let result = try ValidationResultDecoder.decode(json)
        guard case let .failure(error) = result else {
            Issue.record("expected a failure")
            return
        }
        #expect(error.issues[0].expected == nil)
        #expect(error.issues[0].code == "custom")
    }

    @Test("keeps an unrecognized issue code rather than dropping it")
    func forwardCompatibleCodes() throws {
        // `code` is a String precisely so a Zod release that adds a code doesn't
        // require a Sod release to surface it.
        let json = #"{"success":false,"issues":[{"code":"a_code_from_the_future","path":[],"message":"x"}]}"#
        guard case let .failure(error) = try ValidationResultDecoder.decode(json) else {
            Issue.record("expected a failure")
            return
        }
        #expect(error.issues[0].code == "a_code_from_the_future")
    }

    @Test("rejects a result that isn't Zod's")
    func malformedResult() {
        #expect(throws: SodRuntimeError.self) {
            try ValidationResultDecoder.decode("not json")
        }
    }

    @Test("never reports a failure with no issues")
    func failureAlwaysHasIssues() throws {
        guard case let .failure(error) = try ValidationResultDecoder.decode(#"{"success":false}"#) else {
            Issue.record("expected a failure")
            return
        }
        #expect(!error.issues.isEmpty)
    }
}
