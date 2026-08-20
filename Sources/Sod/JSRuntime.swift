import Foundation
import JavaScriptCore

/// Owns the `JSContext` and everything that touches it.
///
/// **Not thread-safe, and deliberately not made so here.** `JSContext` must not
/// be used concurrently; ``Sod`` is an `actor` and owns exactly one of these, so
/// serialization is the actor's job and this type stays free of its own locking.
/// Nothing outside the package gets a reference to the context.
final class JSRuntime {
    private let context: JSContext

    /// Names of schemas registered so far, for a useful error on a typo'd lookup.
    private(set) var registeredSchemaNames: Set<String> = []

    init() throws {
        guard let context = JSContext() else {
            throw SodRuntimeError.scriptEvaluationFailed("could not create a JSContext")
        }
        self.context = context

        // JSC surfaces exceptions through this handler rather than throwing;
        // `evaluate` below reads it back. Without it, a throwing script fails
        // silently and returns undefined.
        context.exceptionHandler = { _, exception in
            JSRuntime.lastException = exception?.toString() ?? "unknown JavaScript exception"
        }
    }

    /// Set by the exception handler, consumed by `evaluate`. Static because the
    /// handler closure can't capture `self` without a retain cycle; safe because
    /// all access is serialized by the owning actor.
    private nonisolated(unsafe) static var lastException: String?

    /// Evaluates a script, turning a JS exception into a thrown Swift error.
    @discardableResult
    func evaluate(_ script: String, context description: String) throws -> JSValue {
        JSRuntime.lastException = nil
        let result = context.evaluateScript(script)
        if let exception = JSRuntime.lastException {
            JSRuntime.lastException = nil
            throw SodRuntimeError.scriptEvaluationFailed("\(description): \(exception)")
        }
        guard let result else {
            throw SodRuntimeError.scriptEvaluationFailed("\(description): script produced no value")
        }
        return result
    }

    /// Loads a consumer-supplied Zod bundle, defining `globalThis.z`.
    ///
    /// Must run before any schema bundle: those are compiled with Zod marked
    /// external and read it from `globalThis.z` at evaluation time, so the
    /// reverse order fails on the first `z.object(...)` call (ADR-015).
    func loadZod(source: String) throws {
        try evaluate(source, context: "loading the Zod bundle")

        guard let z = context.objectForKeyedSubscript("z"), !z.isUndefined else {
            throw SodRuntimeError.scriptEvaluationFailed(
                "the Zod bundle did not define globalThis.z"
            )
        }

        // Consumer bundles register themselves here. Defined up front so a
        // bundle can be evaluated before anything reads the registry.
        try evaluate(
            "globalThis.__sodSchemas = globalThis.__sodSchemas || {};",
            context: "initialising the schema registry"
        )
    }

    /// Evaluates a consumer schema bundle and records the schema names it added.
    func register(source: String) throws {
        let before = currentSchemaNames()
        try evaluate(source, context: "registering a schema bundle")
        let after = currentSchemaNames()

        guard after.count > before.count || !after.isEmpty else {
            throw SodRuntimeError.scriptEvaluationFailed(
                "the bundle registered no schemas — it must assign to globalThis.__sodSchemas"
            )
        }
        registeredSchemaNames = after
    }

    private func currentSchemaNames() -> Set<String> {
        guard
            let registry = context.objectForKeyedSubscript("__sodSchemas"),
            !registry.isUndefined,
            let names = context.evaluateScript("Object.keys(globalThis.__sodSchemas)")?
                .toArray() as? [String]
        else {
            return []
        }
        return Set(names)
    }

    /// Runs `schema.safeParse(value)` and returns Zod's result as JSON.
    ///
    /// The JSON round-trip is the boundary: values cross as data, and Zod's
    /// result comes back as data. Nothing in the consumer's JS gets a handle on
    /// anything Swift-side — the context has no host bridge at all.
    func safeParse(schemaName: String, jsonValue: String) throws -> String {
        guard registeredSchemaNames.contains(schemaName) else {
            throw SodRuntimeError.schemaNotRegistered(schemaName)
        }

        // The value is injected as a JSON literal rather than string-interpolated
        // into an expression, so its contents can never be parsed as code.
        let script = """
        (function () {
          var schema = globalThis.__sodSchemas[\(Self.jsStringLiteral(schemaName))];
          var result = schema.safeParse(\(jsonValue));
          if (result.success) { return JSON.stringify({ success: true }); }
          return JSON.stringify({ success: false, issues: result.error.issues });
        })()
        """

        let result = try evaluate(script, context: "validating against \"\(schemaName)\"")
        guard let json = result.toString() else {
            throw SodRuntimeError.malformedValidationResult("result was not a string")
        }
        return json
    }

    /// JSON-encodes a Swift string into a JS string literal, quotes included.
    private static func jsStringLiteral(_ value: String) -> String {
        guard
            let data = try? JSONEncoder().encode(value),
            let literal = String(data: data, encoding: .utf8)
        else {
            return "\"\""
        }
        return literal
    }
}
