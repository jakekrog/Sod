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
    targets: [
        .target(
            name: "Sod",
            path: "Sources/Sod",
            // Checked into the repo and shipped as a resource so consumers need
            // no Node toolchain. Regenerate with `node scripts/bundle.mjs`.
            resources: [
                .copy("Resources/zod.bundle.js"),
                .copy("Resources/zod.bundle.version"),
            ]
        ),
        .testTarget(
            name: "SodTests",
            dependencies: ["Sod"],
            path: "Tests/SodTests",
            // Compiled from fixtures/exampleSchemas.ts by scripts/build-fixture.mjs,
            // so the suite exercises real bundler output rather than only
            // hand-written JS. Committed, so `swift test` needs no Node toolchain.
            resources: [
                .copy("Fixtures/example.bundle.js"),
            ]
        ),
    ]
)
