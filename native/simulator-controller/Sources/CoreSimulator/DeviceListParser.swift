import Foundation

public struct SimctlRawDevice: Decodable, Sendable, Equatable {
    public var udid: String
    public var name: String
    public var state: String
    public var isAvailable: Bool?
    public var deviceTypeIdentifier: String?

    public init(
        udid: String,
        name: String,
        state: String,
        isAvailable: Bool? = true,
        deviceTypeIdentifier: String? = nil
    ) {
        self.udid = udid
        self.name = name
        self.state = state
        self.isAvailable = isAvailable
        self.deviceTypeIdentifier = deviceTypeIdentifier
    }
}

public struct SimctlListPayload: Decodable, Sendable {
    public var devices: [String: [SimctlRawDevice]]

    public init(devices: [String: [SimctlRawDevice]]) {
        self.devices = devices
    }
}

public struct ParsedSimctlDevice: Sendable, Equatable {
    public var udid: String
    public var name: String
    public var state: String
    public var runtimeRaw: String
    public var runtimeDisplay: String
    public var platform: SimPlatform
    public var isAvailable: Bool
    public var deviceTypeIdentifier: String?

    public init(
        udid: String,
        name: String,
        state: String,
        runtimeRaw: String,
        runtimeDisplay: String,
        platform: SimPlatform,
        isAvailable: Bool,
        deviceTypeIdentifier: String? = nil
    ) {
        self.udid = udid
        self.name = name
        self.state = state
        self.runtimeRaw = runtimeRaw
        self.runtimeDisplay = runtimeDisplay
        self.platform = platform
        self.isAvailable = isAvailable
        self.deviceTypeIdentifier = deviceTypeIdentifier
    }
}

public enum DeviceListParser {
    public static func parse(_ data: Data) throws -> [ParsedSimctlDevice] {
        let decoder = JSONDecoder()
        let payload = try decoder.decode(SimctlListPayload.self, from: data)
        return flatten(payload)
    }

    public static func parse(json: String) throws -> [ParsedSimctlDevice] {
        try parse(Data(json.utf8))
    }

    public static func flatten(_ payload: SimctlListPayload) -> [ParsedSimctlDevice] {
        var devices: [ParsedSimctlDevice] = []
        for (runtimeKey, rawDevices) in payload.devices {
            let runtime = RuntimeIdentifier.parse(runtimeKey)
            for raw in rawDevices {
                devices.append(
                    ParsedSimctlDevice(
                        udid: raw.udid,
                        name: raw.name,
                        state: raw.state,
                        runtimeRaw: runtime.raw,
                        runtimeDisplay: runtime.displayName,
                        platform: runtime.platform,
                        isAvailable: raw.isAvailable ?? true,
                        deviceTypeIdentifier: raw.deviceTypeIdentifier
                    )
                )
            }
        }
        return devices.sorted { lhs, rhs in
            if lhs.runtimeDisplay != rhs.runtimeDisplay {
                return lhs.runtimeDisplay > rhs.runtimeDisplay
            }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }
}
