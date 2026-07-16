import Foundation

/// Runs real Zod schemas on Apple platforms, by embedding JavaScriptCore.
///
/// Swift clients that need the same validation rules as a TypeScript backend
/// normally re-implement them, and the two drift apart the moment either side
/// changes. Sod evaluates the actual schemas instead, so refinements,
/// transforms, and custom `superRefine` logic all behave exactly as they do on
/// the server — because they *are* the server's schemas.
///
/// ```swift
/// let sod = try await Sod()
/// try await sod.register(source: schemaBundleSource)
/// try await sod.validate(user, against: "UserCreate")
/// ```
///
/// Schemas are authored in TypeScript and pre-bundled with esbuild — Zod marked
/// external, since Sod supplies it — into a JS string that assigns
/// `globalThis.__sodSchemas["Name"]`. Sod doesn't ship a TypeScript compiler;
/// consumers already run one to produce their web bundle.
///
/// ## Threading
///
/// An `actor`: `JSContext` must not be used concurrently, so every call is
/// serialized here and the context never escapes. Callers `await`; they never
/// touch JavaScriptCore.
///
/// ## Trust
///
/// Sod runs the JS you hand it. It is **not a sandbox**, and must not be
/// described as one — a bundle is code, and it executes in your process. The
/// context is given no host bridge, so a bundle can't reach app APIs, but
/// verifying that a bundle is what you think it is (a content hash, a signature,
/// a trusted origin) is the caller's job and must happen *before*
/// ``register(source:)``. That applies especially when bundles are fetched at
/// runtime rather than compiled in.
///
/// ## Platforms
///
/// iOS 15+, iPadOS 15+, macOS 12+, tvOS 15+, visionOS 1+. **Not watchOS** —
/// JavaScriptCore isn't public there — and not Linux.
public actor Sod {
    private let runtime: JSRuntime

    /// The Zod version compiled into this Sod release.
    ///
    /// Pinning a Sod version implicitly pins a Zod version, so this makes the
    /// contract checkable at runtime or assertable in a test rather than a docs
    /// lookup. It matters most when consumer bundles are compiled against a Zod
    /// from `package.json`: that version and this one must agree, or the bundle
    /// is compiled against one Zod and executed against another.
    public static let bundledZodVersion: String = {
        // Reading the resource can't fail in a correctly-built package; if it
        // somehow does, a sentinel is better than a crash in a static.
        (try? JSRuntime().bundledZodVersion) ?? "unknown"
    }()

    /// Creates a context and loads the embedded Zod bundle.
    ///
    /// This is the one-time warm-up: parsing and evaluating Zod costs tens of
    /// milliseconds. Create one `Sod` and keep it; don't make one per validation.
    public init() throws {
        runtime = try JSRuntime()
        try runtime.loadZod()
    }

    /// Evaluates a pre-bundled schema source, making its schemas available to
    /// ``validate(_:against:)``.
    ///
    /// Call it once per bundle at startup. Registering the same names twice
    /// replaces them, last write wins.
    ///
    /// - Important: Sod executes this source. Verify its integrity first — see
    ///   the type's Trust note.
    public func register(source: String) throws {
        try runtime.register(source: source)
    }

    /// Names currently registered, across every bundle.
    public var registeredSchemas: Set<String> {
        runtime.registeredSchemaNames
    }

    /// Validates a value against a registered schema.
    ///
    /// - Throws: ``SodError`` when the value is invalid, carrying every issue
    ///   Zod reported. ``SodRuntimeError`` when Sod itself couldn't run —
    ///   an unregistered name, an encoding failure, a broken bundle. The
    ///   distinction matters: the first is something to show a user, the second
    ///   is a bug.
    public func validate(
        _ value: some Encodable,
        against schemaName: String,
        encoder: JSONEncoder = Sod.defaultEncoder
    ) throws {
        let json: String
        do {
            let data = try encoder.encode(value)
            guard let encoded = String(data: data, encoding: .utf8) else {
                throw SodRuntimeError.encodingFailed("encoded value was not UTF-8")
            }
            json = encoded
        } catch let error as SodRuntimeError {
            throw error
        } catch {
            throw SodRuntimeError.encodingFailed(error.localizedDescription)
        }

        try validate(json: json, against: schemaName)
    }

    /// Validates a raw JSON string against a registered schema.
    ///
    /// For values that are already JSON — a Firestore payload, a network
    /// response — where encoding a Swift type first would just be a round trip.
    public func validate(json: String, against schemaName: String) throws {
        let resultJSON = try runtime.safeParse(schemaName: schemaName, jsonValue: json)
        switch try ValidationResultDecoder.decode(resultJSON) {
        case .success:
            return
        case let .failure(error):
            throw error
        }
    }

    /// Encoder used when the caller doesn't supply one.
    ///
    /// ISO 8601 dates and unaltered key names, matching what a TypeScript Zod
    /// schema expects to receive over the wire.
    public static var defaultEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .useDefaultKeys
        return encoder
    }
}
