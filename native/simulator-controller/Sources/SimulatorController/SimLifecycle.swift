import CoreSimulator
import Foundation

/// Boot / shutdown. simctl is the fallback (and default) path.
public struct SimLifecycle: Sendable {
    private let simctl: SimctlClient
    private let discovery: SimDiscovery

    public init(simctl: SimctlClient = SimctlClient(), discovery: SimDiscovery? = nil) {
        self.simctl = simctl
        self.discovery = discovery ?? SimDiscovery(simctl: simctl)
    }

    public func boot(udid: String) throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        var device = try discovery.requireDevice(udid: id)
        if device.state.isBooted {
            return enrich(device)
        }
        do {
            try simctl.boot(udid: device.udid)
            try simctl.waitUntilBooted(udid: device.udid)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
        device = try discovery.requireDevice(udid: device.udid)
        return enrich(device)
    }

    public func shutdown(udid: String) throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        let device = try discovery.requireDevice(udid: id)
        if device.state == .shutdown {
            return device
        }
        do {
            try simctl.shutdown(udid: device.udid)
        } catch let error as SimctlError {
            throw mapSimctl(error, udid: device.udid)
        }
        return try discovery.requireDevice(udid: device.udid)
    }

    private func enrich(_ device: SimulatorDevice) -> SimulatorDevice {
        var next = device
        if next.screen == nil {
            next.screen = discovery.liveScreen(udid: device.udid)
        }
        return next
    }

    private func mapSimctl(_ error: SimctlError, udid: String) -> SimulatorError {
        switch error {
        case let .xcodeNotFound(message):
            return .xcodeNotFound(message)
        case let .invalidJSON(message):
            return .internalError(message)
        case let .commandFailed(_, _, output):
            let lower = output.lowercased()
            if lower.contains("invalid device") || lower.contains("could not find") {
                return .deviceNotFound(udid)
            }
            return .internalError(output.isEmpty ? "simctl failed." : output)
        }
    }
}
