// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Sod",
    // JavaScriptCore is public on every Apple platform except watchOS, which
    // bounds where Sod can run. Not Linux either: no public JSC binding for
    // Swift there.
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15),
        .visionOS(.v1),
    ],
    products: [
        .library(name: "Sod", targets: ["Sod"]),
    ],
    dependencies: [
        .package(url: "https://github.com/SimplyDanny/SwiftLintPlugins", exact: "0.65.0"),
    ],
    targets: [
        .target(
            name: "Sod",
            path: "Sources/Sod"
        ),
        .testTarget(
            name: "SodTests",
            dependencies: ["Sod"],
            path: "Tests/SodTests",
            // Compiled from fixtures/exampleSchemas.ts by `@sod/build` via
            // sod.config.js, so the suite exercises real bundler output rather
            // than only hand-written JS. Committed, so `swift test` needs no
            // Node toolchain.
            resources: [
                .copy("Fixtures/zod.bundle.js"),
                .copy("Fixtures/zod.bundle.version"),
                .copy("Fixtures/schemas.bundle.js"),
            ]
        ),
    ]
)
