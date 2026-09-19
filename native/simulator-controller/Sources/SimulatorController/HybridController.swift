import Foundation
import Input

/// Production controller: FBSimulatorControl-first for HID / stream; simctl fallback
/// for discovery, lifecycle, apps, and still screenshots.
public struct HybridController: SimulatorController {
    private let discovery: SimDiscovery
    private let lifecycle: SimLifecycle
    private let apps: SimApps
    private let hid: SimHID
    private let capture: SimCapture

    public init(
        discovery: SimDiscovery = SimDiscovery(),
        lifecycle: SimLifecycle? = nil,
        apps: SimApps? = nil,
        hid: SimHID? = nil,
        capture: SimCapture? = nil
    ) {
        self.discovery = discovery
        self.lifecycle = lifecycle ?? SimLifecycle(discovery: discovery)
        self.apps = apps ?? SimApps(discovery: discovery)
        self.hid = hid ?? SimHID(discovery: discovery)
        self.capture = capture ?? SimCapture(discovery: discovery)
    }

    public func listDevices(availableOnly: Bool, iosOnly: Bool) async throws -> [SimulatorDevice] {
        try discovery.listDevices(availableOnly: availableOnly, iosOnly: iosOnly)
    }

    public func boot(udid: String) async throws -> SimulatorDevice {
        try lifecycle.boot(udid: udid)
    }

    public func shutdown(udid: String) async throws -> SimulatorDevice {
        try lifecycle.shutdown(udid: udid)
    }

    public func install(udid: String, appPath: String) async throws {
        try apps.install(udid: udid, appPath: appPath)
    }

    public func launch(udid: String, bundleId: String) async throws -> Int? {
        try apps.launch(udid: udid, bundleId: bundleId)
    }

    public func terminate(udid: String, bundleId: String) async throws {
        try apps.terminate(udid: udid, bundleId: bundleId)
    }

    public func uninstall(udid: String, bundleId: String) async throws {
        try apps.uninstall(udid: udid, bundleId: bundleId)
    }

    public func screenshot(udid: String, outputPath: String) async throws -> String {
        try capture.screenshot(udid: udid, outputPath: outputPath)
    }

    public func tap(udid: String, x: Double, y: Double) async throws {
        do {
            try await hid.tap(udid: udid, x: x, y: y)
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
        do {
            try await hid.swipe(udid: udid, x1: x1, y1: y1, x2: x2, y2: y2, duration: duration ?? 0.3)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func typeText(udid: String, text: String) async throws {
        do {
            try await hid.typeText(udid: udid, text: text)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func press(udid: String, button: HardwareButton) async throws {
        do {
            try await hid.press(udid: udid, button: button)
        } catch let error as InputError {
            throw SimulatorError.fromInput(error)
        }
    }

    public func uiTree(udid: String) async throws -> String {
        _ = try discovery.requireBooted(udid: udid)
        throw SimulatorError.notImplemented(
            feature: "simulator.uiTree",
            message: """
            UI tree needs axbridge via SimulatorFrameworkBridge shipped next to mobile-sim \
            (facebook/idb helper binary). That helper is not in this build. \
            Build it with `./build.sh build SimulatorFrameworkBridge` inside vendor/facebook-idb \
            and we can attach it later. No fake tree is returned.
            """
        )
    }

    public func startStream(udid: String, socketPath: String?) async throws -> StreamSession {
        try await capture.startStream(udid: udid, socketPath: socketPath)
    }
}
