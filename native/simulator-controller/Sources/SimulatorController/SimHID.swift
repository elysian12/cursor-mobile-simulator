import Foundation
import Input

/// HID owner. FBSimulatorControl `SimulatorHID` + `SimulatorHIDEvent` first.
/// simctl is never used here — if HID does not send, we throw.
public struct SimHID: InputInjecting, Sendable {
    private let discovery: SimDiscovery
    private let sender: any HIDSending

    public init(discovery: SimDiscovery = SimDiscovery(), sender: any HIDSending = HIDBackend.make()) {
        self.discovery = discovery
        self.sender = sender
    }

    public var isAvailable: Bool { sender.isAvailable }
    public var backendName: String { sender.backendName }

    public func attach(udid: String) async throws -> HIDAttachInfo {
        let device = try discovery.requireBooted(udid: udid)
        return try await sender.attach(udid: device.udid)
    }

    public func tap(udid: String, x: Double, y: Double) async throws {
        let device = try discovery.requireBooted(udid: udid)
        _ = try await sender.send(udid: device.udid, events: HIDEventMapper.tap(x: x, y: y))
        AgentActionLog.record(udid: device.udid, action: "tap", payload: ["x": x, "y": y, "deviceId": device.udid])
    }

    public func swipe(
        udid: String,
        x1: Double,
        y1: Double,
        x2: Double,
        y2: Double,
        duration: Double
    ) async throws {
        let device = try discovery.requireBooted(udid: udid)
        _ = try await sender.send(
            udid: device.udid,
            events: HIDEventMapper.swipe(x1: x1, y1: y1, x2: x2, y2: y2, duration: duration)
        )
        AgentActionLog.record(
            udid: device.udid,
            action: "swipe",
            payload: ["x1": x1, "y1": y1, "x2": x2, "y2": y2, "duration": duration, "deviceId": device.udid]
        )
    }

    public func typeText(udid: String, text: String) async throws {
        let device = try discovery.requireBooted(udid: udid)
        let events = try HIDEventMapper.typeText(text)
        _ = try await sender.send(udid: device.udid, events: events)
        AgentActionLog.record(udid: device.udid, action: "type", payload: ["text": text, "deviceId": device.udid])
    }

    public func press(udid: String, button: HardwareButton) async throws {
        let device = try discovery.requireBooted(udid: udid)
        _ = try await sender.send(udid: device.udid, events: HIDEventMapper.press(button))
        AgentActionLog.record(
            udid: device.udid,
            action: button == .home ? "home" : "press",
            payload: ["button": button.cliName, "deviceId": device.udid]
        )
    }
}

public enum HIDBackend {
    public static func make() -> any HIDSending {
        #if MOBILE_SIM_HAS_FBSC
        return FBSCHIDSender()
        #else
        return UnavailableHIDSender()
        #endif
    }

    public static var isLinked: Bool {
        #if MOBILE_SIM_HAS_FBSC
        true
        #else
        false
        #endif
    }
}
