import Foundation
import Testing

@testable import Sod

enum TestFixtures {
    static func loadResource(named name: String, extension ext: String) throws -> String {
        guard
            let url = Bundle.module.url(
                forResource: name,
                withExtension: ext,
                subdirectory: "Fixtures"
            ) ?? Bundle.module.url(forResource: name, withExtension: ext)
        else {
            Issue.record("fixture missing — run: npm run build")
            throw SodRuntimeError.bundleResourceMissing("\(name).\(ext)")
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    static func zodBundle() throws -> String {
        try loadResource(named: "zod.bundle", extension: "js")
    }

    static func zodVersion() throws -> String {
        try loadResource(named: "zod.bundle", extension: "version")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func schemaBundle() throws -> String {
        try loadResource(named: "schemas.bundle", extension: "js")
    }

    static func makeSod(schemaSource: String? = nil) async throws -> Sod {
        let sod = try Sod(zodSource: try zodBundle(), zodVersion: try zodVersion())
        if let schemaSource {
            try await sod.register(source: schemaSource)
        }
        return sod
    }
}
