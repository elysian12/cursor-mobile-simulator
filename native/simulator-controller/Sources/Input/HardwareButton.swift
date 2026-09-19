import Foundation

/// Hardware buttons we can press over SimulatorHID (Indigo / DTUHID).
public enum HardwareButton: String, Sendable, Codable, CaseIterable {
    case home
    case lock
    case volumeUp
    case volumeDown
    case sideButton

    public init?(cli: String) {
        switch cli.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "home": self = .home
        case "lock": self = .lock
        case "volumeup", "volume_up", "volume-up": self = .volumeUp
        case "volumedown", "volume_down", "volume-down": self = .volumeDown
        case "side", "sidebutton", "side_button", "side-button": self = .sideButton
        default: return nil
        }
    }

    public var cliName: String {
        switch self {
        case .home: return "home"
        case .lock: return "lock"
        case .volumeUp: return "volumeUp"
        case .volumeDown: return "volumeDown"
        case .sideButton: return "sideButton"
        }
    }
}
