import Foundation

public enum SimctlError: Error, Sendable, LocalizedError {
    case xcodeNotFound(String)
    case commandFailed(arguments: [String], exitCode: Int32, output: String)
    case invalidJSON(String)

    public var errorDescription: String? {
        switch self {
        case let .xcodeNotFound(message):
            return message
        case let .commandFailed(_, _, output):
            return output.isEmpty ? "simctl failed." : output
        case let .invalidJSON(message):
            return message
        }
    }
}

/// Thin `xcrun simctl` wrapper. Always passes an explicit UDID — never `"booted"`.
public struct SimctlClient: Sendable {
    private let runner: ProcessRunner
    private let resolver: DeveloperDirectoryResolver

    public init(
        runner: ProcessRunner = ProcessRunner(),
        resolver: DeveloperDirectoryResolver = DeveloperDirectoryResolver()
    ) {
        self.runner = runner
        self.resolver = resolver
    }

    public func listDevicesJSON() throws -> Data {
        let result = try run(arguments: ["list", "devices", "-j"])
        try throwIfFailed(result, arguments: ["list", "devices", "-j"])
        return Data(result.stdout.utf8)
    }

    public func listDevices() throws -> [ParsedSimctlDevice] {
        do {
            return try DeviceListParser.parse(listDevicesJSON())
        } catch {
            throw SimctlError.invalidJSON("Failed to parse `simctl list devices -j`: \(error.localizedDescription)")
        }
    }

    public func boot(udid: String) throws {
        let result = try run(arguments: ["boot", udid])
        if result.succeeded { return }
        if isAlreadyBooted(result) { return }
        try throwIfFailed(result, arguments: ["boot", udid])
    }

    /// Wait until the device finishes booting (`simctl bootstatus`).
    public func waitUntilBooted(udid: String) throws {
        let result = try run(arguments: ["bootstatus", udid])
        try throwIfFailed(result, arguments: ["bootstatus", udid])
    }

    public func shutdown(udid: String) throws {
        let result = try run(arguments: ["shutdown", udid])
        if result.succeeded { return }
        if isAlreadyShutdown(result) { return }
        try throwIfFailed(result, arguments: ["shutdown", udid])
    }

    public func install(udid: String, appPath: String) throws {
        let result = try run(arguments: ["install", udid, appPath])
        try throwIfFailed(result, arguments: ["install", udid, appPath])
    }

    /// Returns the launched PID when simctl prints `bundleId: pid`.
    public func launch(udid: String, bundleId: String) throws -> Int? {
        let result = try run(arguments: ["launch", udid, bundleId])
        try throwIfFailed(result, arguments: ["launch", udid, bundleId])
        return parseLaunchPID(result.stdout, bundleId: bundleId)
    }

    public func terminate(udid: String, bundleId: String) throws {
        let result = try run(arguments: ["terminate", udid, bundleId])
        if result.succeeded { return }
        if isNotRunning(result) { return }
        try throwIfFailed(result, arguments: ["terminate", udid, bundleId])
    }

    public func uninstall(udid: String, bundleId: String) throws {
        let result = try run(arguments: ["uninstall", udid, bundleId])
        try throwIfFailed(result, arguments: ["uninstall", udid, bundleId])
    }

    public func screenshot(udid: String, outputPath: String) throws {
        let result = try run(arguments: ["io", udid, "screenshot", outputPath])
        try throwIfFailed(result, arguments: ["io", udid, "screenshot", outputPath])
    }

    /// Guest environment variable. Works on Booted devices (e.g. SIMULATOR_MAINSCREEN_WIDTH).
    public func getenv(udid: String, name: String) throws -> String {
        let result = try run(arguments: ["getenv", udid, name])
        try throwIfFailed(result, arguments: ["getenv", udid, name])
        return result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    public func run(arguments: [String]) throws -> ProcessResult {
        let developerDir: DeveloperDirectory
        switch resolver.resolveOrExplain() {
        case let .success(dir):
            developerDir = dir
        case let .failure(message):
            throw SimctlError.xcodeNotFound(message)
        }

        let extra = ["DEVELOPER_DIR": developerDir.path]
        if FileManager.default.isExecutableFile(atPath: DeveloperDirectory.xcrunBinary) {
            return try runner.run(
                executable: DeveloperDirectory.xcrunBinary,
                arguments: ["simctl"] + arguments,
                extraEnvironment: extra
            )
        }
        return try runner.run(
            executable: developerDir.simctlPath,
            arguments: arguments,
            extraEnvironment: extra
        )
    }

    private func throwIfFailed(_ result: ProcessResult, arguments: [String]) throws {
        if result.succeeded { return }
        throw SimctlError.commandFailed(
            arguments: arguments,
            exitCode: result.exitCode,
            output: result.combinedOutput
        )
    }

    private func isAlreadyBooted(_ result: ProcessResult) -> Bool {
        let text = result.combinedOutput.lowercased()
        return text.contains("current state: booted") || text.contains("already booted")
    }

    private func isAlreadyShutdown(_ result: ProcessResult) -> Bool {
        let text = result.combinedOutput.lowercased()
        return text.contains("current state: shutdown") || text.contains("already shutdown")
    }

    private func isNotRunning(_ result: ProcessResult) -> Bool {
        let text = result.combinedOutput.lowercased()
        return text.contains("not running") || text.contains("is not running")
    }

    private func parseLaunchPID(_ stdout: String, bundleId: String) -> Int? {
        let trimmed = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        if let colon = trimmed.lastIndex(of: ":") {
            let pidPart = trimmed[trimmed.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines)
            if let pid = Int(pidPart) { return pid }
        }
        let prefix = bundleId + ": "
        if trimmed.hasPrefix(prefix) {
            return Int(trimmed.dropFirst(prefix.count).trimmingCharacters(in: .whitespaces))
        }
        return nil
    }
}
