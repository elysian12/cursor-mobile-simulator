import Foundation

/// Mirrors `packages/protocol` `PermissionsFile`. Path: `~/.mobile-simulator/permissions.json`.
public struct PermissionsFile: Sendable, Equatable, Codable {
    public var version: Int
    public var allowSimulatorControl: Bool
    public var grantedAt: String?

    public init(version: Int = 1, allowSimulatorControl: Bool, grantedAt: String? = nil) {
        self.version = version
        self.allowSimulatorControl = allowSimulatorControl
        self.grantedAt = grantedAt
    }

    public var isGranted: Bool {
        version == 1 && allowSimulatorControl
    }
}

public struct PermissionStore: Sendable {
    public var fileURL: URL

    public static var defaultFileURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".mobile-simulator", isDirectory: true)
            .appendingPathComponent("permissions.json")
    }

    public static let live = PermissionStore(fileURL: defaultFileURL)

    public init(fileURL: URL) {
        self.fileURL = fileURL
    }

    public func load() -> PermissionsFile? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(PermissionsFile.self, from: data)
    }

    public var isGranted: Bool {
        load()?.isGranted ?? false
    }

    public func grant(now: Date = Date()) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if directory.lastPathComponent == ".mobile-simulator" {
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o700],
                ofItemAtPath: directory.path
            )
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let file = PermissionsFile(
            version: 1,
            allowSimulatorControl: true,
            grantedAt: formatter.string(from: now)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(file)
        try data.write(to: fileURL, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: fileURL.path
        )
    }

    public func revoke() throws {
        if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
        }
    }

    public func requireGranted() throws {
        guard isGranted else {
            throw SimulatorError.permissionDenied()
        }
    }
}
