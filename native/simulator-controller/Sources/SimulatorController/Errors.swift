import Foundation
import Input

/// Wire codes from `packages/protocol` `ErrorCode`.
public enum SimulatorErrorCode: String, Sendable, Codable {
    case deviceNotBooted = "DEVICE_NOT_BOOTED"
    case deviceNotFound = "DEVICE_NOT_FOUND"
    case permissionDenied = "PERMISSION_DENIED"
    case notAttached = "NOT_ATTACHED"
    case appNotFound = "APP_NOT_FOUND"
    case notImplemented = "NOT_IMPLEMENTED"
    case invalidRequest = "INVALID_REQUEST"
    case invalidUDID = "INVALID_UDID"
    case xcodeNotFound = "XCODE_NOT_FOUND"
    case internalError = "INTERNAL_ERROR"
}

public struct SimulatorError: Error, Sendable, LocalizedError, Equatable {
    public var code: SimulatorErrorCode
    public var message: String
    public var data: [String: String]

    public init(code: SimulatorErrorCode, message: String, data: [String: String] = [:]) {
        self.code = code
        self.message = message
        self.data = data
    }

    public var errorDescription: String? { "\(code.rawValue): \(message)" }

    public var exitCode: Int32 {
        switch code {
        case .invalidRequest, .invalidUDID, .internalError, .xcodeNotFound:
            return 1
        case .deviceNotFound:
            return 2
        case .deviceNotBooted:
            return 3
        case .permissionDenied:
            return 4
        case .appNotFound:
            return 5
        case .notImplemented:
            return 6
        case .notAttached:
            return 7
        }
    }

    public static func deviceNotFound(_ udid: String) -> SimulatorError {
        SimulatorError(
            code: .deviceNotFound,
            message: "No simulator with UDID \(udid). Run `mobile-sim list` and pass an explicit UDID.",
            data: ["udid": udid]
        )
    }

    public static func deviceNotBooted(udid: String, state: SimulatorDeviceState) -> SimulatorError {
        SimulatorError(
            code: .deviceNotBooted,
            message: "Simulator \(udid) is \(state.rawValue). Boot it first: mobile-sim boot \(udid)",
            data: ["udid": udid, "state": state.rawValue]
        )
    }

    public static func permissionDenied(_ message: String = defaultPermissionMessage) -> SimulatorError {
        SimulatorError(code: .permissionDenied, message: message)
    }

    public static func notAttached(_ message: String) -> SimulatorError {
        SimulatorError(code: .notAttached, message: message)
    }

    public static func appNotFound(bundleId: String, udid: String) -> SimulatorError {
        SimulatorError(
            code: .appNotFound,
            message: "App '\(bundleId)' was not found on simulator \(udid).",
            data: ["bundleId": bundleId, "udid": udid]
        )
    }

    public static func notImplemented(feature: String, message: String) -> SimulatorError {
        SimulatorError(code: .notImplemented, message: message, data: ["feature": feature])
    }

    public static func fromInput(_ error: Input.InputError) -> SimulatorError {
        switch error.kind {
        case .notImplemented:
            return .notImplemented(feature: error.feature, message: error.message)
        case .notAttached:
            return .notAttached(error.message)
        case .sendFailed:
            return .internalError(error.message)
        }
    }

    public static func invalidRequest(_ message: String) -> SimulatorError {
        SimulatorError(code: .invalidRequest, message: message)
    }

    public static func invalidUDID(_ message: String) -> SimulatorError {
        SimulatorError(code: .invalidUDID, message: message)
    }

    public static func xcodeNotFound(_ message: String) -> SimulatorError {
        SimulatorError(code: .xcodeNotFound, message: message)
    }

    public static func internalError(_ message: String) -> SimulatorError {
        SimulatorError(code: .internalError, message: message)
    }

    public static let defaultPermissionMessage = """
    Simulator control over RPC is not granted. Run `mobile-sim grant` to write \
    ~/.mobile-simulator/permissions.json (interactive CLI does not need this).
    """
}

public struct WireError: Sendable, Codable, Equatable {
    public var code: String
    public var message: String
    public var data: [String: String]?

    public init(code: String, message: String, data: [String: String]? = nil) {
        self.code = code
        self.message = message
        self.data = data
    }

    public init(_ error: SimulatorError) {
        self.code = error.code.rawValue
        self.message = error.message
        self.data = error.data.isEmpty ? nil : error.data
    }
}
