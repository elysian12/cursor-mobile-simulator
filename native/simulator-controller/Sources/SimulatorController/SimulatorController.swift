import Foundation
import Input

/// Native owner of simulator state. Callers (CLI, later MCP) always pass an explicit UDID.
public protocol SimulatorController: Sendable {
    func listDevices(availableOnly: Bool, iosOnly: Bool) async throws -> [SimulatorDevice]
    func boot(udid: String) async throws -> SimulatorDevice
    func shutdown(udid: String) async throws -> SimulatorDevice
    func install(udid: String, appPath: String) async throws
    func launch(udid: String, bundleId: String) async throws -> Int?
    func terminate(udid: String, bundleId: String) async throws
    func uninstall(udid: String, bundleId: String) async throws
    func screenshot(udid: String, outputPath: String) async throws -> String
    func tap(udid: String, x: Double, y: Double) async throws
    func swipe(udid: String, x1: Double, y1: Double, x2: Double, y2: Double, duration: Double?) async throws
    func typeText(udid: String, text: String) async throws
    func press(udid: String, button: HardwareButton) async throws
    func uiTree(udid: String) async throws -> String
    func startStream(udid: String, socketPath: String?) async throws -> StreamSession
    /// Hide Device Hub / Simulator.app. Does not shut down CoreSimulator.
    func hideHost() async throws -> HostAppActionResult
    /// Reopen Device Hub / Simulator.app without detaching.
    func showHost() async throws -> HostAppActionResult
}

extension SimulatorController {
    public func hideHost() async throws -> HostAppActionResult {
        HostAppController().hideHost()
    }

    public func showHost() async throws -> HostAppActionResult {
        HostAppController().showHost()
    }
}

public struct StreamSession: Sendable, Equatable, Codable {
    public var udid: String
    public var transport: String
    public var format: String
    public var socketPath: String?
    public var note: String?

    public init(
        udid: String,
        transport: String,
        format: String,
        socketPath: String? = nil,
        note: String? = nil
    ) {
        self.udid = udid
        self.transport = transport
        self.format = format
        self.socketPath = socketPath
        self.note = note
    }
}
