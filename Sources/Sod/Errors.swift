import Foundation

/// One step in the path to the value an issue is about.
///
/// Typed rather than a stringified dotted path so callers can map an issue onto
/// a form field, table row, or array index without re-parsing. `"user.tags.0"`
/// is ambiguous — a key literally named `0` and an array index look identical —
/// and re-splitting a string a library just joined is work with no upside.
public enum PathComponent: Equatable, Hashable, Sendable {
    case key(String)
    case index(Int)
}

extension PathComponent: CustomStringConvertible {
    public var description: String {
        switch self {
        case let .key(name): name
        case let .index(index): String(index)
        }
    }
}

/// A single Zod validation failure.
public struct SodIssue: Equatable, Hashable, Sendable {
    /// The `ZodIssueCode` value, kept as a `String` rather than an enum.
    ///
    /// Zod adds issue codes between minor versions; modelling them as a Swift
    /// enum would mean an unrecognized code either crashes decoding or silently
    /// becomes `.unknown`, and either way Sod would need a release just to
    /// surface something Zod already reported.
    public let code: String

    /// Where the failure is, from the root of the validated value.
    public let path: [PathComponent]

    /// Zod's human-readable message.
    public let message: String

    /// What the schema wanted, when Zod says. Absent for many custom issues.
    public let expected: String?

    /// What it got, when Zod says.
    public let received: String?

    public init(
        code: String,
        path: [PathComponent],
        message: String,
        expected: String? = nil,
        received: String? = nil
    ) {
        self.code = code
        self.path = path
        self.message = message
        self.expected = expected
        self.received = received
    }

    /// Dotted path (`"purchase.price.currency"`), for logs and messages.
    ///
    /// Convenience only — match on ``path`` when mapping issues to UI.
    public var pathDescription: String {
        path.map(\.description).joined(separator: ".")
    }
}

/// Validation failed. Carries every issue Zod reported, not just the first.
public struct SodError: Error, Equatable, Hashable, Sendable {
    public let issues: [SodIssue]

    public init(issues: [SodIssue]) {
        self.issues = issues
    }
}

extension SodError: CustomStringConvertible {
    public var description: String {
        issues
            .map { issue in
                issue.path.isEmpty ? issue.message : "\(issue.pathDescription): \(issue.message)"
            }
            .joined(separator: "; ")
    }
}

/// Sod itself failed — distinct from ``SodError``, which means the *data* was invalid.
///
/// Keeping these apart matters: a `SodError` is something to show a user, while
/// a `SodRuntimeError` is a bug or a bad bundle, and conflating them turns a
/// broken deployment into what looks like a form validation message.
public enum SodRuntimeError: Error, Equatable, Sendable {
    /// The embedded Zod bundle is missing from the package resources.
    case bundleResourceMissing(String)

    /// A script threw while being evaluated. Carries the JS exception's description.
    case scriptEvaluationFailed(String)

    /// `validate(_:against:)` named a schema no registered bundle defines.
    case schemaNotRegistered(String)

    /// The value couldn't be encoded to JSON for handing to Zod.
    case encodingFailed(String)

    /// Zod returned something Sod couldn't interpret — a Zod/Sod version mismatch.
    case malformedValidationResult(String)
}

extension SodRuntimeError: CustomStringConvertible {
    public var description: String {
        switch self {
        case let .bundleResourceMissing(name):
            "Sod resource \"\(name)\" is missing from the package bundle."
        case let .scriptEvaluationFailed(message):
            "JavaScript evaluation failed: \(message)"
        case let .schemaNotRegistered(name):
            "No schema named \"\(name)\" is registered. Call register(source:) with a bundle that defines it."
        case let .encodingFailed(message):
            "Could not encode value for validation: \(message)"
        case let .malformedValidationResult(message):
            "Could not interpret Zod's result: \(message)"
        }
    }
}
