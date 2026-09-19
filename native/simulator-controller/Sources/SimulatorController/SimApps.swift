import CoreSimulator
import Foundation

/// Install / launch / terminate / uninstall. simctl is the fallback (and default) path.
public struct SimApps: Sendable {
    private let simctl: SimctlClient
    private let discovery: SimDiscovery

    public init(simctl: SimctlClient = SimctlClient(), discovery: SimDiscovery? = nil) {
        self.simctl = simctl
        self.discovery = discovery ?? SimDiscovery(simctl: simctl)
    }

    public func install(udid: String, appPath: String) throws {
        let device = try discovery.requireBooted(udid: udid)
        let expanded = (appPath as NSString).expandingTildeInPath
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: expanded, isDirectory: &isDir) else {
            throw SimulatorError.invalidRequest("App bundle not found at '\(expanded)'.")
        }
        do {
            try simctl.install(udid: device.udid, appPath: expanded)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
    }

    public func launch(udid: String, bundleId: String) throws -> Int? {
        let device = try discovery.requireBooted(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            return try simctl.launch(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    public func terminate(udid: String, bundleId: String) throws {
        let device = try discovery.requireBooted(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            try simctl.terminate(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    public func uninstall(udid: String, bundleId: String) throws {
        let device = try discovery.requireDevice(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            try simctl.uninstall(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    private func requireBundleId(_ bundleId: String) throws -> String {
        let trimmed = bundleId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw SimulatorError.invalidRequest("bundleId is required.")
        }
        return trimmed
    }

    private func mapSimctl(_ error: SimctlError, udid: String, bundleId: String? = nil) -> SimulatorError {
        switch error {
        case let .xcodeNotFound(message):
            return .xcodeNotFound(message)
        case let .invalidJSON(message):
            return .internalError(message)
        case let .commandFailed(_, _, output):
            let lower = output.lowercased()
            if let bundleId,
               lower.contains("no such file")
                || lower.contains("not found")
                || lower.contains("is not installed")
                || lower.contains("failed to find")
            {
                return .appNotFound(bundleId: bundleId, udid: udid)
            }
            if lower.contains("current state: shutdown") || lower.contains("not booted") {
                return .deviceNotBooted(udid: udid, state: .shutdown)
            }
            return .internalError(output.isEmpty ? "simctl failed." : output)
        }
    }
}
