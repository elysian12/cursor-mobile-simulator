import CoreSimulator
import Foundation

/// List + screen-size resolution. simctl is the fallback (and default) path.
public struct SimDiscovery: Sendable {
    private let simctl: SimctlClient

    public init(simctl: SimctlClient = SimctlClient()) {
        self.simctl = simctl
    }

    public func listDevices(availableOnly: Bool = true, iosOnly: Bool = true) throws -> [SimulatorDevice] {
        let parsed: [ParsedSimctlDevice]
        do {
            parsed = try simctl.listDevices()
        } catch let error as SimctlError {
            throw mapSimctl(error)
        }
        return parsed.compactMap { raw in
            if availableOnly && !raw.isAvailable { return nil }
            if iosOnly && raw.platform != .ios { return nil }
            return makeDevice(from: raw)
        }
    }

    public func requireDevice(udid: String) throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        let devices = try listDevices(availableOnly: false, iosOnly: false)
        guard let device = devices.first(where: { $0.udid.caseInsensitiveCompare(id) == .orderedSame }) else {
            throw SimulatorError.deviceNotFound(id)
        }
        return device
    }

    public func requireBooted(udid: String) throws -> SimulatorDevice {
        let device = try requireDevice(udid: udid)
        guard device.state.isBooted else {
            throw SimulatorError.deviceNotBooted(udid: device.udid, state: device.state)
        }
        return device
    }

    public func makeDevice(from raw: ParsedSimctlDevice) -> SimulatorDevice {
        var screen = KnownScreens.screen(deviceTypeIdentifier: raw.deviceTypeIdentifier)
        if raw.state == "Booted" {
            screen = liveScreen(udid: raw.udid) ?? screen
        }
        return SimulatorDevice(
            udid: raw.udid,
            name: raw.name,
            runtime: raw.runtimeDisplay,
            state: SimulatorDeviceState(simctl: raw.state),
            deviceType: raw.deviceTypeIdentifier,
            screen: screen
        )
    }

    /// Booted devices expose pixel size + scale via simctl getenv. Convert to points.
    public func liveScreen(udid: String) -> ScreenInfo? {
        guard
            let widthPixels = try? Double(simctl.getenv(udid: udid, name: "SIMULATOR_MAINSCREEN_WIDTH")),
            let heightPixels = try? Double(simctl.getenv(udid: udid, name: "SIMULATOR_MAINSCREEN_HEIGHT")),
            let scale = try? Double(simctl.getenv(udid: udid, name: "SIMULATOR_MAINSCREEN_SCALE")),
            widthPixels > 0, heightPixels > 0, scale > 0
        else {
            return nil
        }
        return ScreenInfo(width: widthPixels / scale, height: heightPixels / scale, scale: scale)
    }

    private func mapSimctl(_ error: SimctlError) -> SimulatorError {
        switch error {
        case let .xcodeNotFound(message):
            return .xcodeNotFound(message)
        case let .invalidJSON(message):
            return .internalError(message)
        case let .commandFailed(_, _, output):
            return .internalError(output.isEmpty ? "simctl failed." : output)
        }
    }
}
