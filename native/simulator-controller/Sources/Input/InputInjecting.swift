import Foundation

/// Touch / keyboard / button injection. Implementations must send real HID
/// (`SimulatorHID` + `SimulatorHIDEvent` via FBSimulatorControl, Indigo / DTUHID).
/// Never click Simulator.app or use AppleScript. Never report success if HID did not send.
public protocol InputInjecting: Sendable {
    func tap(udid: String, x: Double, y: Double) async throws
    func swipe(udid: String, x1: Double, y1: Double, x2: Double, y2: Double, duration: Double) async throws
    func typeText(udid: String, text: String) async throws
    func press(udid: String, button: HardwareButton) async throws
}

public struct InputError: Error, Sendable, LocalizedError, Equatable {
    public enum Kind: String, Sendable, Equatable {
        case notImplemented
        case notAttached
        case sendFailed
    }

    public var kind: Kind
    public var feature: String
    public var message: String

    public init(kind: Kind, feature: String, message: String) {
        self.kind = kind
        self.feature = feature
        self.message = message
    }

    public var errorDescription: String? { message }

    public static func notImplemented(_ feature: String) -> InputError {
        InputError(
            kind: .notImplemented,
            feature: feature,
            message: """
            \(feature) is not implemented.

            HID is SimulatorHID + SimulatorHIDEvent (Indigo / DTUHID) linked in-process \
            from facebook/idb. Build frameworks with scripts/build-idb.sh, then rebuild \
            mobile-sim. This tool will not click Simulator.app, send AppleScript, or fake a successful gesture.
            """
        )
    }

    public static func notAttached(_ feature: String, message: String) -> InputError {
        InputError(kind: .notAttached, feature: feature, message: message)
    }

    public static func sendFailed(_ message: String) -> InputError {
        InputError(kind: .sendFailed, feature: "hid.send", message: message)
    }
}

/// Used only when no HID backend is compiled in. Always throws — never succeeds.
public struct UnimplementedInputInjector: InputInjecting {
    public init() {}

    public func tap(udid: String, x: Double, y: Double) async throws {
        throw InputError.notAttached(
            "simulator.tap",
            message: hidUnavailableMessage(action: "tap (udid=\(udid), x=\(x), y=\(y))")
        )
    }

    public func swipe(
        udid: String,
        x1: Double,
        y1: Double,
        x2: Double,
        y2: Double,
        duration: Double
    ) async throws {
        throw InputError.notAttached(
            "simulator.swipe",
            message: hidUnavailableMessage(
                action: "swipe (udid=\(udid), from=(\(x1), \(y1)), to=(\(x2), \(y2)), duration=\(duration))"
            )
        )
    }

    public func typeText(udid: String, text: String) async throws {
        throw InputError.notAttached(
            "simulator.type",
            message: hidUnavailableMessage(action: "type (udid=\(udid), text=\(text.prefix(32)))")
        )
    }

    public func press(udid: String, button: HardwareButton) async throws {
        throw InputError.notAttached(
            "simulator.press",
            message: hidUnavailableMessage(action: "press \(button.cliName) on \(udid)")
        )
    }
}

public func hidUnavailableMessage(action: String) -> String {
    """
    HID did not send: \(action).

    In-process FBSimulatorControl (SimulatorHID / DTUHID) is not linked. \
    Run `scripts/build-idb.sh` then `npm run build:native`. \
    Until then list/boot/install/screenshot still work via simctl. \
    Tap/swipe/type/press will not be faked.

    On Xcode 27, if frameworks are linked but attach still fails: close DeviceHub.app \
    and boot headless (`mobile-sim boot <UDID>`). dtuhidd can crash if the display \
    is not up yet; idb \( "92cc718" ) retries liveness instead of dropping events.
    """
}
