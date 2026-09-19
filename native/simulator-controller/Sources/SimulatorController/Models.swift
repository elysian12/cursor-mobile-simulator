import Foundation

/// Device-point coordinate space. Origin is top-left. Mirrors `packages/protocol` `ScreenInfo`.
public struct ScreenInfo: Sendable, Equatable, Codable {
    public var width: Double
    public var height: Double
    public var scale: Double
    public var origin: String

    public init(width: Double, height: Double, scale: Double, origin: String = "topLeft") {
        self.width = width
        self.height = height
        self.scale = scale
        self.origin = origin
    }

    public var widthPixels: Double { width * scale }
    public var heightPixels: Double { height * scale }
}

/// Mirrors `packages/protocol` `SimulatorDevice`.
public struct SimulatorDevice: Sendable, Equatable, Codable {
    public var udid: String
    public var name: String
    public var runtime: String
    public var state: SimulatorDeviceState
    public var deviceType: String?
    public var screen: ScreenInfo?

    public init(
        udid: String,
        name: String,
        runtime: String,
        state: SimulatorDeviceState,
        deviceType: String? = nil,
        screen: ScreenInfo? = nil
    ) {
        self.udid = udid
        self.name = name
        self.runtime = runtime
        self.state = state
        self.deviceType = deviceType
        self.screen = screen
    }
}

/// Mirrors `packages/protocol` `SimulatorDeviceState`.
public enum SimulatorDeviceState: String, Sendable, Codable, Equatable {
    case creating = "Creating"
    case booting = "Booting"
    case booted = "Booted"
    case shuttingDown = "Shutting Down"
    case shutdown = "Shutdown"
    case unknown = "Unknown"

    public init(simctl: String) {
        self = SimulatorDeviceState(rawValue: simctl) ?? .unknown
    }

    public var isBooted: Bool { self == .booted }
}

/// Reserved for MCP / viewer attach. Mirrors `packages/protocol` `Session`.
public struct Session: Sendable, Equatable, Codable {
    public var id: String
    public var deviceUDID: String
    public var createdAt: String
    public var owner: String
    public var attached: Bool
    public var bootedByServer: Bool

    public init(
        id: String,
        deviceUDID: String,
        createdAt: String,
        owner: String,
        attached: Bool,
        bootedByServer: Bool
    ) {
        self.id = id
        self.deviceUDID = deviceUDID
        self.createdAt = createdAt
        self.owner = owner
        self.attached = attached
        self.bootedByServer = bootedByServer
    }
}

public enum DeviceID {
    public static let bannedLiterals: Set<String> = [
        "booted",
        "current",
        "booted-simulator",
        "the-booted-simulator",
    ]

    /// Always an explicit UUID. Rejects simctl's `"booted"` alias.
    public static func parse(_ raw: String) throws -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            throw SimulatorError.invalidUDID("Device UDID is required. Pass an explicit UUID; never 'booted'.")
        }
        if bannedLiterals.contains(trimmed.lowercased()) {
            throw SimulatorError.invalidUDID(
                "'\(trimmed)' is not allowed. mobile-sim always requires an explicit device UDID (never 'booted' or 'the currently booted simulator')."
            )
        }
        guard UUID(uuidString: trimmed) != nil else {
            throw SimulatorError.invalidUDID(
                "Expected an explicit simulator UDID (UUID), got '\(trimmed)'."
            )
        }
        return trimmed
    }
}
