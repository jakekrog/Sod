import Foundation

/// Zod's `safeParse` result, as it crosses the JSON boundary.
struct RawValidationResult: Decodable {
    let success: Bool
    let issues: [RawIssue]?

    struct RawIssue: Decodable {
        let code: String?
        let path: [RawPathComponent]?
        let message: String?
        let expected: String?
        let received: String?
    }

    /// A Zod path element is a string key or a numeric index — JSON has no way
    /// to say "one of these", so decode both and let ``PathComponent`` keep the
    /// distinction the caller needs.
    enum RawPathComponent: Decodable {
        case key(String)
        case index(Int)

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            // Int first: a JSON number must not become the string "0".
            if let index = try? container.decode(Int.self) {
                self = .index(index)
            } else if let key = try? container.decode(String.self) {
                self = .key(key)
            } else {
                // Zod can emit symbol keys, which JSON.stringify drops. Don't
                // fail the whole result over one unrepresentable path element.
                self = .key("")
            }
        }

        var component: PathComponent {
            switch self {
            case let .key(name): .key(name)
            case let .index(index): .index(index)
            }
        }
    }
}

enum ValidationResultDecoder {
    /// Turns Zod's JSON result into either success or a ``SodError``.
    ///
    /// Tolerant on purpose: fields Zod omits (`expected`/`received` are absent
    /// for most custom issues) or renames between minor versions must not turn
    /// a legitimate validation failure into an unrelated decoding crash. Only a
    /// result that isn't recognizably Zod's is an error.
    static func decode(_ json: String) throws -> Result<Void, SodError> {
        guard let data = json.data(using: .utf8) else {
            throw SodRuntimeError.malformedValidationResult("result was not UTF-8")
        }

        let raw: RawValidationResult
        do {
            raw = try JSONDecoder().decode(RawValidationResult.self, from: data)
        } catch {
            throw SodRuntimeError.malformedValidationResult(error.localizedDescription)
        }

        if raw.success {
            return .success(())
        }

        let issues = (raw.issues ?? []).map { issue in
            SodIssue(
                code: issue.code ?? "unknown",
                path: (issue.path ?? []).map(\.component),
                message: issue.message ?? "Invalid value",
                expected: issue.expected,
                received: issue.received
            )
        }

        // A failure with no issues would be a silent, unactionable rejection.
        guard !issues.isEmpty else {
            return .failure(
                SodError(issues: [
                    SodIssue(code: "unknown", path: [], message: "Validation failed"),
                ])
            )
        }
        return .failure(SodError(issues: issues))
    }
}
