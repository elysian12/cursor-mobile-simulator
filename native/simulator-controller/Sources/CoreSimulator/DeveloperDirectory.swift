import Foundation

/// Resolves Xcode's developer directory without treating `/var/db/xcode_select_link` as the only source.
public struct DeveloperDirectory: Sendable, Equatable {
    public var path: String
    public var source: Source

    public enum Source: String, Sendable, Codable {
        case environment = "DEVELOPER_DIR"
        case xcodeSelect = "xcode-select"
        case applicationsFallback = "/Applications/Xcode.app"
    }

    public init(path: String, source: Source) {
        self.path = path
        self.source = source
    }

    public var xcodebuildPath: String { path + "/usr/bin/xcodebuild" }
    public var simctlPath: String { path + "/usr/bin/simctl" }
    public var iPhoneSimulatorPlatformPath: String { path + "/Platforms/iPhoneSimulator.platform" }

    public static let applicationsFallbackPath = "/Applications/Xcode.app/Contents/Developer"
    public static let xcodeSelectBinary = "/usr/bin/xcode-select"
    public static let xcrunBinary = "/usr/bin/xcrun"
}

public struct DeveloperDirectoryResolver: Sendable {
    public struct Probe: Sendable, Equatable {
        public var path: String
        public var source: DeveloperDirectory.Source
        public var exists: Bool
        public var isDeveloperDir: Bool
    }

    private let environment: [String: String]
    private let fileExists: @Sendable (String) -> Bool
    private let isDirectory: @Sendable (String) -> Bool
    private let xcodeSelectPath: @Sendable () -> String?

    public init(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fileExists: @escaping @Sendable (String) -> Bool = { FileManager.default.fileExists(atPath: $0) },
        isDirectory: @escaping @Sendable (String) -> Bool = { path in
            var isDir: ObjCBool = false
            let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)
            return exists && isDir.boolValue
        },
        xcodeSelectPath: @escaping @Sendable () -> String? = DeveloperDirectoryResolver.readXcodeSelect
    ) {
        self.environment = environment
        self.fileExists = fileExists
        self.isDirectory = isDirectory
        self.xcodeSelectPath = xcodeSelectPath
    }

    public func probes() -> [Probe] {
        var items: [Probe] = []

        if let env = environment["DEVELOPER_DIR"]?.trimmingCharacters(in: .whitespacesAndNewlines), !env.isEmpty {
            items.append(makeProbe(path: env, source: .environment))
        }

        if let selected = xcodeSelectPath()?.trimmingCharacters(in: .whitespacesAndNewlines), !selected.isEmpty {
            items.append(makeProbe(path: selected, source: .xcodeSelect))
        }

        items.append(makeProbe(path: DeveloperDirectory.applicationsFallbackPath, source: .applicationsFallback))
        return items
    }

    public func resolve() -> DeveloperDirectory? {
        let all = probes()

        if let env = all.first(where: { $0.source == .environment }) {
            if env.isDeveloperDir {
                return DeveloperDirectory(path: env.path, source: .environment)
            }
            return nil
        }

        if let selected = all.first(where: { $0.source == .xcodeSelect && $0.isDeveloperDir }) {
            return DeveloperDirectory(path: selected.path, source: .xcodeSelect)
        }

        if let fallback = all.first(where: { $0.source == .applicationsFallback && $0.isDeveloperDir }) {
            return DeveloperDirectory(path: fallback.path, source: .applicationsFallback)
        }

        return nil
    }

    public enum Resolution: Sendable {
        case success(DeveloperDirectory)
        case failure(String)
    }

    public func resolveOrExplain() -> Resolution {
        let all = probes()

        if let env = all.first(where: { $0.source == .environment }) {
            if env.isDeveloperDir {
                return .success(DeveloperDirectory(path: env.path, source: .environment))
            }
            return .failure(
                "DEVELOPER_DIR is set to '\(env.path)' but that path is not a usable Xcode developer directory (expected usr/bin/xcodebuild or usr/bin/simctl). Unset DEVELOPER_DIR or point it at Xcode.app/Contents/Developer."
            )
        }

        if let selected = all.first(where: { $0.source == .xcodeSelect && $0.isDeveloperDir }) {
            return .success(DeveloperDirectory(path: selected.path, source: .xcodeSelect))
        }

        if let fallback = all.first(where: { $0.source == .applicationsFallback && $0.isDeveloperDir }) {
            return .success(DeveloperDirectory(path: fallback.path, source: .applicationsFallback))
        }

        return .failure(
            """
            Could not find Xcode. Checked $DEVELOPER_DIR, `xcode-select -p`, and \(DeveloperDirectory.applicationsFallbackPath).
            Install Xcode 26 or later, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
            Open Xcode once to accept the license.
            """
        )
    }

    public func isDeveloperDir(_ path: String) -> Bool {
        guard isDirectory(path) else { return false }
        return fileExists(path + "/usr/bin/xcodebuild") || fileExists(path + "/usr/bin/simctl")
    }

    private func makeProbe(path: String, source: DeveloperDirectory.Source) -> Probe {
        Probe(
            path: path,
            source: source,
            exists: fileExists(path) || isDirectory(path),
            isDeveloperDir: isDeveloperDir(path)
        )
    }

    public static func readXcodeSelect() -> String? {
        let runner = ProcessRunner()
        guard let result = try? runner.run(
            executable: DeveloperDirectory.xcodeSelectBinary,
            arguments: ["-p"]
        ), result.succeeded else {
            return nil
        }
        let path = result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        return path.isEmpty ? nil : path
    }
}
