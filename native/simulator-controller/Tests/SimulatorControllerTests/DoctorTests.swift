import CoreSimulator
import Foundation
import SimulatorController
import Testing

struct FixtureDoctorHost: DoctorHosting {
    var isMacOS: Bool
    var environment: [String: String]
    var operatingSystemDescription: String
    var files: Set<String>
    var directories: Set<String>
    var commands: [String: ProcessResult]

    func fileExists(at path: String) -> Bool {
        files.contains(path) || directories.contains(path)
    }

    func isDirectory(at path: String) -> Bool {
        directories.contains(path)
    }

    func run(executable: String, arguments: [String]) throws -> ProcessResult {
        let key = ([executable] + arguments).joined(separator: " ")
        if let result = commands[key] {
            return result
        }
        throw SimulatorError.internalError("unexpected command: \(key)")
    }
}

struct DoctorTests {
    private let devDir = "/Applications/Xcode.app/Contents/Developer"

    @Test func healthyXcode27Passes() throws {
        let listJSON = String(data: try fixtureData("simctl-list.json"), encoding: .utf8)!
        let version = try fixtureString("xcodebuild-version.txt")
        let host = FixtureDoctorHost(
            isMacOS: true,
            environment: [:],
            operatingSystemDescription: "macOS 26.6.0 (arm64)",
            files: [
                "/usr/bin/xcrun",
                "\(devDir)/usr/bin/xcodebuild",
                "\(devDir)/usr/bin/simctl",
            ],
            directories: [
                devDir,
                "\(devDir)/Platforms/iPhoneSimulator.platform",
            ],
            commands: [
                "/usr/bin/xcode-select -p": ProcessResult(exitCode: 0, stdout: devDir + "\n", stderr: ""),
                "\(devDir)/usr/bin/xcodebuild -version": ProcessResult(exitCode: 0, stdout: version, stderr: ""),
                "/usr/bin/xcrun simctl list devices -j": ProcessResult(exitCode: 0, stdout: listJSON, stderr: ""),
            ]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok)
        #expect(report.developerDirectory == devDir)
        #expect(report.checks.contains { $0.name == "Xcode version" && $0.ok })
        #expect(report.checks.contains { $0.name == "simctl list" && $0.ok && $0.detail.contains("iOS 26.5") })
    }

    @Test func missingXcodeFailsWithRemedy() {
        let host = FixtureDoctorHost(
            isMacOS: true,
            environment: [:],
            operatingSystemDescription: "macOS 26.6.0 (arm64)",
            files: [],
            directories: [],
            commands: [
                "/usr/bin/xcode-select -p": ProcessResult(exitCode: 1, stdout: "", stderr: "xcode-select: error"),
            ]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok == false)
        let xcode = report.checks.first { $0.name == "Xcode developer directory" }
        #expect(xcode?.ok == false)
        #expect(xcode?.remedy?.contains("xcode-select") == true)
    }

    @Test func oldXcodeFailsMinimum() throws {
        let old = try fixtureString("xcodebuild-old.txt")
        let host = FixtureDoctorHost(
            isMacOS: true,
            environment: [:],
            operatingSystemDescription: "macOS 15.0 (arm64)",
            files: [
                "/usr/bin/xcrun",
                "\(devDir)/usr/bin/xcodebuild",
                "\(devDir)/usr/bin/simctl",
            ],
            directories: [
                devDir,
                "\(devDir)/Platforms/iPhoneSimulator.platform",
            ],
            commands: [
                "/usr/bin/xcode-select -p": ProcessResult(exitCode: 0, stdout: devDir + "\n", stderr: ""),
                "\(devDir)/usr/bin/xcodebuild -version": ProcessResult(exitCode: 0, stdout: old, stderr: ""),
                "/usr/bin/xcrun simctl list devices -j": ProcessResult(exitCode: 0, stdout: #"{"devices":{}}"#, stderr: ""),
            ]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok == false)
        let version = report.checks.first { $0.name == "Xcode version" }
        #expect(version?.ok == false)
        #expect(version?.detail.contains("16.4") == true)
        #expect(version?.remedy?.contains("26") == true)
    }

    @Test func invalidDeveloperDirEnvDoesNotFallThrough() {
        let host = FixtureDoctorHost(
            isMacOS: true,
            environment: ["DEVELOPER_DIR": "/tmp/not-xcode"],
            operatingSystemDescription: "macOS 26.6.0 (arm64)",
            files: ["/usr/bin/xcrun"],
            directories: [devDir, "\(devDir)/Platforms/iPhoneSimulator.platform"],
            commands: [
                "/usr/bin/xcode-select -p": ProcessResult(exitCode: 0, stdout: devDir + "\n", stderr: ""),
            ]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok == false)
        #expect(report.developerDirectory == nil)
        let dir = report.checks.first { $0.name == "Xcode developer directory" }
        #expect(dir?.detail.contains("DEVELOPER_DIR") == true)
    }

    @Test func nonMacOSFails() {
        let host = FixtureDoctorHost(
            isMacOS: false,
            environment: [:],
            operatingSystemDescription: "linux",
            files: [],
            directories: [],
            commands: [:]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok == false)
        #expect(report.checks.first?.name == "macOS")
    }

    @Test func missingSimulatorPlatformSuggestsManualDownload() {
        let host = FixtureDoctorHost(
            isMacOS: true,
            environment: [:],
            operatingSystemDescription: "macOS 26.6.0 (arm64)",
            files: [
                "/usr/bin/xcrun",
                "\(devDir)/usr/bin/xcodebuild",
                "\(devDir)/usr/bin/simctl",
            ],
            directories: [devDir],
            commands: [
                "/usr/bin/xcode-select -p": ProcessResult(exitCode: 0, stdout: devDir + "\n", stderr: ""),
                "\(devDir)/usr/bin/xcodebuild -version": ProcessResult(
                    exitCode: 0,
                    stdout: "Xcode 26.1\nBuild version 26A1\n",
                    stderr: ""
                ),
                "/usr/bin/xcrun simctl list devices -j": ProcessResult(exitCode: 0, stdout: #"{"devices":{}}"#, stderr: ""),
            ]
        )
        let report = Doctor(host: host, permissions: PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-no-consent.json"))).run()
        #expect(report.ok == false)
        let platform = report.checks.first { $0.name == "iPhoneSimulator.platform" }
        #expect(platform?.ok == false)
        #expect(platform?.remedy?.contains("will not download platforms automatically") == true)
    }
}
