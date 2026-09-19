// swift-tools-version: 6.0
import Foundation
import PackageDescription

let packageDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let repoRoot = packageDir.deletingLastPathComponent().deletingLastPathComponent()
let idbRoot = repoRoot.appendingPathComponent("vendor/facebook-idb")

func idbProductsDir() -> URL? {
    let candidates = [
        idbRoot.appendingPathComponent("Build/Products/Release"),
        idbRoot.appendingPathComponent("Build/Products/Debug"),
    ]
    return candidates.first { dir in
        FileManager.default.fileExists(atPath: dir.appendingPathComponent("libFBSimulatorControl.a").path)
            || FileManager.default.fileExists(atPath: dir.appendingPathComponent("FBSimulatorControl.framework").path)
    }
}

let idbProducts = idbProductsDir()
let hasFBSC = idbProducts != nil

var controllerSwiftSettings: [SwiftSetting] = []
var controllerLinkerSettings: [LinkerSetting] = []
var extraControllerDependencies: [Target.Dependency] = ["CoreSimulator", "Input"]

if let products = idbProducts {
    let frameworkPath = products.path
    let tbdCoreSim = idbRoot.appendingPathComponent("PrivateHeaders/CoreSimulator/CoreSimulator.tbd").path
    let tbdAX = idbRoot.appendingPathComponent("PrivateHeaders/AccessibilityPlatformTranslation/AccessibilityPlatformTranslation.tbd").path
    controllerSwiftSettings.append(.define("MOBILE_SIM_HAS_FBSC"))
    let privateHeaders = idbRoot.appendingPathComponent("PrivateHeaders")
    var swiftFlags = [
        "-I", frameworkPath,
        "-F", frameworkPath,
        "-F", "/Applications/Xcode.app/Contents/Developer/Library/PrivateFrameworks",
        "-Xcc", "-I\(privateHeaders.path)",
    ]
    let moduleMaps = [
        "CoreSimulator",
        "CoreSimulatorUtilities",
        "CoreSimDeviceIO",
        "SimulatorKit",
        "SimulatorApp",
        "DTXConnectionServices",
        "AccessibilityPlatformTranslation",
        "AXRuntime",
    ]
    for name in moduleMaps {
        let map = privateHeaders.appendingPathComponent("\(name)/module.modulemap").path
        if FileManager.default.fileExists(atPath: map) {
            swiftFlags.append(contentsOf: ["-Xcc", "-fmodule-map-file=\(map)"])
        }
    }
    controllerSwiftSettings.append(.unsafeFlags(swiftFlags))
    var linker: [String] = [
        "-F", frameworkPath,
        "-L", frameworkPath,
        "-lFBSimulatorControl",
        "-lCompanionUtilities",
        "-Xlinker", "-ObjC",
        "-Xlinker", "-all_load",
        "-Xlinker", "-rpath",
        "-Xlinker", frameworkPath,
        "-framework", "FBControlCore",
        "-framework", "AVFoundation",
        "-framework", "Accelerate",
        "-framework", "Cocoa",
        "-framework", "CoreGraphics",
        "-framework", "CoreImage",
        "-framework", "CoreMedia",
        "-framework", "CoreVideo",
        "-framework", "IOSurface",
        "-framework", "Metal",
        "-framework", "UniformTypeIdentifiers",
        "-framework", "VideoToolbox",
    ]
    if FileManager.default.fileExists(atPath: tbdCoreSim) {
        linker.append(contentsOf: ["-Xlinker", "-weak_library", "-Xlinker", tbdCoreSim])
    }
    if FileManager.default.fileExists(atPath: tbdAX) {
        linker.append(contentsOf: ["-Xlinker", "-weak_library", "-Xlinker", tbdAX])
    }
    controllerLinkerSettings.append(.unsafeFlags(linker))
}

let package = Package(
    name: "simulator-controller",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .executable(name: "mobile-sim", targets: ["mobile-sim"]),
        .library(name: "SimulatorController", targets: ["SimulatorController"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.5.0"),
    ],
    targets: [
        .target(
            name: "CoreSimulator",
            dependencies: []
        ),
        .target(
            name: "Input",
            dependencies: []
        ),
        .target(
            name: "SimulatorController",
            dependencies: extraControllerDependencies,
            swiftSettings: controllerSwiftSettings,
            linkerSettings: [.linkedFramework("AppKit")]
        ),
        .target(
            name: "RPC",
            dependencies: ["SimulatorController", "Input"],
            swiftSettings: controllerSwiftSettings
        ),
        .executableTarget(
            name: "mobile-sim",
            dependencies: [
                "SimulatorController",
                "RPC",
                "Input",
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ],
            path: "Sources/CLI",
            swiftSettings: controllerSwiftSettings,
            linkerSettings: controllerLinkerSettings
        ),
        .testTarget(
            name: "SimulatorControllerTests",
            dependencies: [
                "SimulatorController",
                "CoreSimulator",
                "Input",
                "RPC",
            ],
            resources: [
                .copy("Fixtures"),
            ],
            swiftSettings: controllerSwiftSettings,
            linkerSettings: controllerLinkerSettings
        ),
    ]
)
