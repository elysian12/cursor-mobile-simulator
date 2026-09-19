import CoreSimulator
import Foundation
import Input

public struct SimctlController: SimulatorController {
    private let simctl: SimctlClient
    private let input: any InputInjecting

    public init(
        simctl: SimctlClient = SimctlClient(),
        input: any InputInjecting = SimHID()
    ) {
        self.simctl = simctl
        self.input = input
    }

    public func listDevices(availableOnly: Bool = true, iosOnly: Bool = true) async throws -> [SimulatorDevice] {
        let parsed: [ParsedSimctlDevice]
        do {
            parsed = try simctl.listDevices()
        } catch let error as SimctlError {
            throw mapSimctl(error)
        }
        return parsed.compactMap { raw in
            if availableOnly && !raw.isAvailable { return nil }
            if iosOnly && raw.platform != .ios { return nil }
            return SimDiscovery(simctl: simctl).makeDevice(from: raw)
        }
    }

    public func boot(udid: String) async throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        var device = try await requireDevice(udid: id)
        if device.state.isBooted {
            return device
        }
        do {
            try simctl.boot(udid: device.udid)
            try simctl.waitUntilBooted(udid: device.udid)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
        device = try await requireDevice(udid: device.udid)
        return device
    }

    public func shutdown(udid: String) async throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        var device = try await requireDevice(udid: id)
        if device.state == .shutdown {
            return device
        }
        do {
            try simctl.shutdown(udid: device.udid)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
        device = try await requireDevice(udid: device.udid)
        return device
    }

    public func install(udid: String, appPath: String) async throws {
        let device = try await requireBooted(udid: udid)
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

    public func launch(udid: String, bundleId: String) async throws -> Int? {
        let device = try await requireBooted(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            return try simctl.launch(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    public func terminate(udid: String, bundleId: String) async throws {
        let device = try await requireBooted(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            try simctl.terminate(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    public func uninstall(udid: String, bundleId: String) async throws {
        let device = try await requireDevice(udid: udid)
        let bundle = try requireBundleId(bundleId)
        do {
            try simctl.uninstall(udid: device.udid, bundleId: bundle)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid, bundleId: bundle)
        }
    }

    public func screenshot(udid: String, outputPath: String) async throws -> String {
        let device = try await requireBooted(udid: udid)
        let expanded = (outputPath as NSString).expandingTildeInPath
        let directory = (expanded as NSString).deletingLastPathComponent
        if !directory.isEmpty, directory != ".", !FileManager.default.fileExists(atPath: directory) {
            try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)
        }
        do {
            try simctl.screenshot(udid: device.udid, outputPath: expanded)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
        return expanded
    }

    public func tap(udid: String, x: Double, y: Double) async throws {
        let device = try await requireBooted(udid: udid)
        do {
            try await input.tap(udid: device.udid, x: x, y: y)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func swipe(
        udid: String,
        x1: Double,
        y1: Double,
        x2: Double,
        y2: Double,
        duration: Double?
    ) async throws {
        let device = try await requireBooted(udid: udid)
        do {
            try await input.swipe(
                udid: device.udid,
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                duration: duration ?? 0.3
            )
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func typeText(udid: String, text: String) async throws {
        let device = try await requireBooted(udid: udid)
        do {
            try await input.typeText(udid: device.udid, text: text)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func press(udid: String, button: HardwareButton) async throws {
        let device = try await requireBooted(udid: udid)
        do {
            try await input.press(udid: device.udid, button: button)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func uiTree(udid: String) async throws -> String {
        _ = try await requireBooted(udid: udid)
        throw SimulatorError.notImplemented(
            feature: "simulator.uiTree",
            message: "axbridge / SimulatorFrameworkBridge helper is not shipped in this build."
        )
    }

    public func startStream(udid: String, socketPath: String?) async throws -> StreamSession {
        try await SimCapture().startStream(udid: udid, socketPath: socketPath)
    }

    private func requireDevice(udid: String) async throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        let devices = try await listDevices(availableOnly: false, iosOnly: false)
        guard let device = devices.first(where: { $0.udid.caseInsensitiveCompare(id) == .orderedSame }) else {
            throw SimulatorError.deviceNotFound(id)
        }
        return device
    }

    private func requireBooted(udid: String) async throws -> SimulatorDevice {
        let device = try await requireDevice(udid: udid)
        guard device.state.isBooted else {
            throw SimulatorError.deviceNotBooted(udid: device.udid, state: device.state)
        }
        return device
    }

    private func requireBundleId(_ bundleId: String) throws -> String {
        let trimmed = bundleId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw SimulatorError.invalidRequest("bundleId is required.")
        }
        return trimmed
    }

    private func mapSimctl(_ error: SimctlError, udid: String? = nil, bundleId: String? = nil) -> SimulatorError {
        switch error {
        case let .xcodeNotFound(message):
            return .xcodeNotFound(message)
        case let .invalidJSON(message):
            return .internalError(message)
        case let .commandFailed(_, _, output):
            let lower = output.lowercased()
            if let bundleId, isAppMissing(lower) {
                return .appNotFound(bundleId: bundleId, udid: udid ?? "")
            }
            if isNotBooted(lower), let udid {
                return .deviceNotBooted(udid: udid, state: .shutdown)
            }
            if isDeviceMissing(lower), let udid {
                return .deviceNotFound(udid)
            }
            return .internalError(output.isEmpty ? "simctl failed." : output)
        }
    }

    private func isAppMissing(_ lower: String) -> Bool {
        lower.contains("no such file")
            || lower.contains("not found")
            || lower.contains("is not installed")
            || lower.contains("failed to find")
    }

    private func isNotBooted(_ lower: String) -> Bool {
        lower.contains("current state: shutdown")
            || lower.contains("not booted")
            || lower.contains("invalid device state")
    }

    private func isDeviceMissing(_ lower: String) -> Bool {
        lower.contains("invalid device")
            || lower.contains("could not find")
            || lower.contains("unable to find")
    }
}
