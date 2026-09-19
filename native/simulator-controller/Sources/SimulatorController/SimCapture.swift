import CoreSimulator
import Foundation

/// Screenshot (simctl io, never CoreImage / FBSurfaceImageGenerator) and optional H.264 stream.
public struct SimCapture: Sendable {
    private let simctl: SimctlClient
    private let discovery: SimDiscovery

    public init(simctl: SimctlClient = SimctlClient(), discovery: SimDiscovery? = nil) {
        self.simctl = simctl
        self.discovery = discovery ?? SimDiscovery(simctl: simctl)
    }

    /// Reliable still: `simctl io screenshot`. Not CIContext / BitmapStream polling.
    public func screenshot(udid: String, outputPath: String) throws -> String {
        let device = try discovery.requireBooted(udid: udid)
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

    /// H.264 Annex-B via `SimulatorVideoStream`. Never a screenshot poll loop.
    public func startStream(udid: String, socketPath: String?) async throws -> StreamSession {
        let device = try discovery.requireBooted(udid: udid)
        #if MOBILE_SIM_HAS_FBSC
        return try await FBSCStream.start(udid: device.udid, socketPath: socketPath)
        #else
        throw SimulatorError.notAttached(
            """
            Live H.264 stream requires in-process FBSimulatorControl (`SimulatorVideoStream`, Annex-B). \
            Frameworks are not linked. Run scripts/build-idb.sh then rebuild mobile-sim.

            Screenshot remains available: mobile-sim screenshot \(device.udid)

            If DeviceHub holds the exclusive IOSurface, close DeviceHub.app and boot headless. \
            This CLI will not poll screenshots as a fake live stream.
            """
        )
        #endif
    }

    private func mapSimctl(_ error: SimctlError, udid: String) -> SimulatorError {
        switch error {
        case let .xcodeNotFound(message):
            return .xcodeNotFound(message)
        case let .invalidJSON(message):
            return .internalError(message)
        case let .commandFailed(_, _, output):
            let lower = output.lowercased()
            if lower.contains("not booted") || lower.contains("current state: shutdown") {
                return .deviceNotBooted(udid: udid, state: .shutdown)
            }
            return .internalError(output.isEmpty ? "simctl screenshot failed." : output)
        }
    }
}
