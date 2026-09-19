import CoreSimulator
import Foundation

public struct DoctorCheck: Sendable, Equatable, Codable {
    public var name: String
    public var ok: Bool
    public var detail: String
    public var remedy: String?

    public init(name: String, ok: Bool, detail: String, remedy: String? = nil) {
        self.name = name
        self.ok = ok
        self.detail = detail
        self.remedy = remedy
    }
}

public struct DoctorReport: Sendable, Equatable, Codable {
    public var ok: Bool
    public var checks: [DoctorCheck]
    public var developerDirectory: String?

    public init(ok: Bool, checks: [DoctorCheck], developerDirectory: String? = nil) {
        self.ok = ok
        self.checks = checks
        self.developerDirectory = developerDirectory
    }
}

public protocol DoctorHosting: Sendable {
    var isMacOS: Bool { get }
    var environment: [String: String] { get }
    var operatingSystemDescription: String { get }
    func fileExists(at path: String) -> Bool
    func isDirectory(at path: String) -> Bool
    func run(executable: String, arguments: [String]) throws -> ProcessResult
}

public struct LiveDoctorHost: DoctorHosting {
    public init() {}

    public var isMacOS: Bool {
        #if os(macOS)
        true
        #else
        false
        #endif
    }

    public var environment: [String: String] {
        ProcessInfo.processInfo.environment
    }

    public var operatingSystemDescription: String {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        #if arch(arm64)
        let arch = "arm64"
        #else
        let arch = "x86_64"
        #endif
        return "macOS \(v.majorVersion).\(v.minorVersion).\(v.patchVersion) (\(arch))"
    }

    public func fileExists(at path: String) -> Bool {
        FileManager.default.fileExists(atPath: path)
    }

    public func isDirectory(at path: String) -> Bool {
        var isDir: ObjCBool = false
        return FileManager.default.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
    }

    public func run(executable: String, arguments: [String]) throws -> ProcessResult {
        try ProcessRunner().run(executable: executable, arguments: arguments)
    }
}

public struct Doctor: Sendable {
    private let host: any DoctorHosting
    private let permissions: PermissionStore

    public init(host: any DoctorHosting = LiveDoctorHost(), permissions: PermissionStore = .live) {
        self.host = host
        self.permissions = permissions
    }

    public func run() -> DoctorReport {
        var checks: [DoctorCheck] = []

        if host.isMacOS {
            checks.append(
                DoctorCheck(
                    name: "macOS",
                    ok: true,
                    detail: host.operatingSystemDescription
                )
            )
        } else {
            checks.append(
                DoctorCheck(
                    name: "macOS",
                    ok: false,
                    detail: "This CLI is macOS-only.",
                    remedy: "Run mobile-sim on a Mac with Xcode 26 or later."
                )
            )
            return DoctorReport(ok: false, checks: checks)
        }

        let resolver = DeveloperDirectoryResolver(
            environment: host.environment,
            fileExists: { [host] path in host.fileExists(at: path) },
            isDirectory: { [host] path in host.isDirectory(at: path) },
            xcodeSelectPath: { [host] in
                guard let result = try? host.run(
                    executable: DeveloperDirectory.xcodeSelectBinary,
                    arguments: ["-p"]
                ), result.succeeded else {
                    return nil
                }
                let path = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
                return path.isEmpty ? nil : path
            }
        )

        let probes = resolver.probes()
        let probeDetail = probes.map { probe in
            let mark = probe.isDeveloperDir ? "usable" : (probe.exists ? "present, not a developer dir" : "missing")
            return "\(probe.source.rawValue): \(probe.path) (\(mark))"
        }.joined(separator: "\n")

        let resolved: DeveloperDirectory?
        let resolveNote: String
        switch resolver.resolveOrExplain() {
        case let .success(dir):
            resolved = dir
            resolveNote = "Using \(dir.path) via \(dir.source.rawValue).\n\(probeDetail)"
            checks.append(DoctorCheck(name: "Xcode developer directory", ok: true, detail: resolveNote))
        case let .failure(message):
            resolved = nil
            resolveNote = message + "\n" + probeDetail
            checks.append(
                DoctorCheck(
                    name: "Xcode developer directory",
                    ok: false,
                    detail: resolveNote,
                    remedy: "Install Xcode 26+ from Apple Developer, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
                )
            )
        }

        if let env = host.environment["DEVELOPER_DIR"], !env.isEmpty {
            checks.append(
                DoctorCheck(
                    name: "DEVELOPER_DIR",
                    ok: resolved?.source != .environment || resolver.isDeveloperDir(env),
                    detail: env
                )
            )
        } else {
            checks.append(
                DoctorCheck(
                    name: "DEVELOPER_DIR",
                    ok: true,
                    detail: "unset (resolution falls through to xcode-select and /Applications/Xcode.app)"
                )
            )
        }

        if let resolved {
            let version = readXcodeVersion(developerDir: resolved)
            if let version {
                if version.isAtLeast(.minimumSupported) {
                    checks.append(
                        DoctorCheck(
                            name: "Xcode version",
                            ok: true,
                            detail: "\(version.display). Targeted line is Xcode 26.x; 26+ is accepted."
                        )
                    )
                } else {
                    checks.append(
                        DoctorCheck(
                            name: "Xcode version",
                            ok: false,
                            detail: "Found Xcode \(version.display); minimum is 26.0.",
                            remedy: "Install Xcode 26 or later. This project targets Xcode 26.x first."
                        )
                    )
                }
            } else {
                checks.append(
                    DoctorCheck(
                        name: "Xcode version",
                        ok: false,
                        detail: "Could not parse `xcodebuild -version` from \(resolved.xcodebuildPath).",
                        remedy: "Open Xcode once and accept the license: sudo xcodebuild -license accept"
                    )
                )
            }

            if host.isDirectory(at: resolved.iPhoneSimulatorPlatformPath) {
                checks.append(
                    DoctorCheck(
                        name: "iPhoneSimulator.platform",
                        ok: true,
                        detail: resolved.iPhoneSimulatorPlatformPath
                    )
                )
            } else {
                checks.append(
                    DoctorCheck(
                        name: "iPhoneSimulator.platform",
                        ok: false,
                        detail: "Missing \(resolved.iPhoneSimulatorPlatformPath)",
                        remedy: """
                        Open Xcode → Settings → Platforms and install iOS. \
                        Or run `xcodebuild -downloadPlatform iOS` yourself after you confirm the download. \
                        mobile-sim will not download platforms automatically.
                        """
                    )
                )
            }

            do {
                let result = try runSimctlList(developerDir: resolved)
                if !result.succeeded {
                    throw SimctlError.commandFailed(
                        arguments: ["list", "devices", "-j"],
                        exitCode: result.exitCode,
                        output: result.combinedOutput
                    )
                }
                let devices = try DeviceListParser.parse(Data(result.stdout.utf8))
                let ios = devices.filter { $0.platform == .ios }
                let runtimes = Set(ios.map(\.runtimeDisplay))
                if ios.isEmpty {
                    checks.append(
                        DoctorCheck(
                            name: "simctl list",
                            ok: false,
                            detail: "simctl ran but no iOS Simulator devices were found (\(devices.count) non-iOS entries).",
                            remedy: """
                            Create an iPhone simulator in Xcode, or install an iOS runtime \
                            (Xcode → Settings → Platforms). Do not rely on `xcodebuild -downloadPlatform` \
                            unless you confirm the download yourself.
                            """
                        )
                    )
                } else {
                    checks.append(
                        DoctorCheck(
                            name: "simctl list",
                            ok: true,
                            detail: "\(ios.count) iOS device(s), \(runtimes.count) iOS runtime(s): \(runtimes.sorted().joined(separator: ", "))."
                        )
                    )
                }
            } catch {
                checks.append(
                    DoctorCheck(
                        name: "simctl list",
                        ok: false,
                        detail: error.localizedDescription,
                        remedy: """
                        CoreSimulatorService may be down. Open Xcode or /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app once, \
                        then retry. If you just installed Xcode, reboot.
                        """
                    )
                )
            }
        }

        if HIDBackend.isLinked {
            checks.append(
                DoctorCheck(
                    name: "HID (FBSimulatorControl)",
                    ok: true,
                    detail: "FBSimulatorControl linked in-process. SimulatorHID / DTUHID (facebook/idb \( "92cc718" )). Close DeviceHub if attach fails."
                )
            )
        } else {
            checks.append(
                DoctorCheck(
                    name: "HID (FBSimulatorControl)",
                    ok: true,
                    detail: """
                    Frameworks not linked. list/boot/install/screenshot use simctl. \
                    tap/swipe/type/press fail loudly (no fake success). \
                    Build: scripts/build-idb.sh && npm run build:native
                    """
                )
            )
        }

        if permissions.isGranted {
            checks.append(
                DoctorCheck(
                    name: "consent",
                    ok: true,
                    detail: "Granted at \(permissions.fileURL.path)"
                )
            )
        } else {
            checks.append(
                DoctorCheck(
                    name: "consent",
                    ok: true,
                    detail: "Not granted. Interactive CLI still works. RPC/MCP requires `mobile-sim grant` (\(permissions.fileURL.path))."
                )
            )
        }

        let ok = checks.allSatisfy(\.ok)
        return DoctorReport(ok: ok, checks: checks, developerDirectory: resolved?.path)
    }

    private func runSimctlList(developerDir: DeveloperDirectory) throws -> ProcessResult {
        if host.fileExists(at: DeveloperDirectory.xcrunBinary) {
            return try host.run(
                executable: DeveloperDirectory.xcrunBinary,
                arguments: ["simctl", "list", "devices", "-j"]
            )
        }
        return try host.run(
            executable: developerDir.simctlPath,
            arguments: ["list", "devices", "-j"]
        )
    }

    private func readXcodeVersion(developerDir: DeveloperDirectory) -> XcodeVersion? {
        if host.fileExists(at: developerDir.xcodebuildPath),
           let result = try? host.run(executable: developerDir.xcodebuildPath, arguments: ["-version"]),
           result.succeeded,
           let version = XcodeVersion.parse(xcodebuildOutput: result.stdout)
        {
            return version
        }
        if host.fileExists(at: DeveloperDirectory.xcrunBinary),
           let result = try? host.run(
            executable: DeveloperDirectory.xcrunBinary,
            arguments: ["xcodebuild", "-version"]
           ),
           result.succeeded,
           let version = XcodeVersion.parse(xcodebuildOutput: result.stdout)
        {
            return version
        }
        return nil
    }
}

public enum DoctorFormatting {
    public static func text(_ report: DoctorReport) -> String {
        var lines: [String] = ["mobile-sim doctor", ""]
        for check in report.checks {
            let mark = check.ok ? "✓" : "✗"
            lines.append("\(mark) \(check.name)")
            for detailLine in check.detail.split(separator: "\n", omittingEmptySubsequences: false) {
                lines.append("  \(detailLine)")
            }
            if let remedy = check.remedy, !check.ok {
                lines.append("  → \(remedy.replacingOccurrences(of: "\n", with: "\n    "))")
            }
            lines.append("")
        }
        lines.append(report.ok ? "Ready." : "Not ready. Fix the failed checks above.")
        return lines.joined(separator: "\n")
    }
}
