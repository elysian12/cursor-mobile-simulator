import Foundation

/// Result of a successful HID attach. Coordinates are device points, origin top-left.
public struct HIDAttachInfo: Sendable, Equatable {
    public var transport: String
    public var screenWidthPoints: Double?
    public var screenHeightPoints: Double?
    public var scale: Double?

    public init(
        transport: String,
        screenWidthPoints: Double? = nil,
        screenHeightPoints: Double? = nil,
        scale: Double? = nil
    ) {
        self.transport = transport
        self.screenWidthPoints = screenWidthPoints
        self.screenHeightPoints = screenHeightPoints
        self.scale = scale
    }
}

/// Sends already-mapped HID events. Implementations must throw if the event did not leave the host.
public protocol HIDSending: Sendable {
    var isAvailable: Bool { get }
    var backendName: String { get }

    func attach(udid: String) async throws -> HIDAttachInfo
    func send(udid: String, events: [MappedHIDEvent]) async throws -> HIDAttachInfo
}

public struct UnavailableHIDSender: HIDSending {
    public init() {}

    public var isAvailable: Bool { false }
    public var backendName: String { "unavailable" }

    public func attach(udid: String) async throws -> HIDAttachInfo {
        throw InputError.notAttached(
            "simulator.hid",
            message: hidUnavailableMessage(action: "attach \(udid)")
        )
    }

    public func send(udid: String, events: [MappedHIDEvent]) async throws -> HIDAttachInfo {
        throw InputError.notAttached(
            "simulator.hid",
            message: hidUnavailableMessage(action: "send \(events.count) event(s) to \(udid)")
        )
    }
}

