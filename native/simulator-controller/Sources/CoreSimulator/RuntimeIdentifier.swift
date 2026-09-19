import Foundation

public enum SimPlatform: String, Sendable, Codable, Equatable {
    case ios
    case watchos
    case tvos
    case xros
    case unknown
}

/// Parses simctl runtime map keys such as `com.apple.CoreSimulator.SimRuntime.iOS-26-5` or `iOS 18.0`.
public struct RuntimeIdentifier: Sendable, Equatable {
    public var raw: String
    public var displayName: String
    public var platform: SimPlatform

    public var isIOS: Bool { platform == .ios }

    public init(raw: String, displayName: String, platform: SimPlatform) {
        self.raw = raw
        self.displayName = displayName
        self.platform = platform
    }

    public static func parse(_ raw: String) -> RuntimeIdentifier {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let identifierPrefix = "com.apple.CoreSimulator.SimRuntime."

        if trimmed.hasPrefix(identifierPrefix) {
            let rest = String(trimmed.dropFirst(identifierPrefix.count))
            let parts = rest.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
            if let family = parts.first {
                let version = parts.dropFirst().joined(separator: ".")
                let platform = platform(forFamily: family)
                let display = version.isEmpty ? family : "\(displayFamily(family)) \(version)"
                return RuntimeIdentifier(raw: trimmed, displayName: display, platform: platform)
            }
        }

        let platform = inferPlatform(fromDisplay: trimmed)
        let display = trimmed.replacingOccurrences(
            of: #"\s*\(unavailable\)"#,
            with: "",
            options: .regularExpression
        )
        return RuntimeIdentifier(raw: trimmed, displayName: display, platform: platform)
    }

    private static func platform(forFamily family: String) -> SimPlatform {
        switch family.lowercased() {
        case "ios": return .ios
        case "watchos": return .watchos
        case "tvos": return .tvos
        case "xros", "visionos": return .xros
        default: return .unknown
        }
    }

    private static func displayFamily(_ family: String) -> String {
        switch family.lowercased() {
        case "ios": return "iOS"
        case "watchos": return "watchOS"
        case "tvos": return "tvOS"
        case "xros": return "xrOS"
        case "visionos": return "visionOS"
        default: return family
        }
    }

    private static func inferPlatform(fromDisplay raw: String) -> SimPlatform {
        let lower = raw.lowercased()
        if lower.contains("watchos") { return .watchos }
        if lower.contains("tvos") { return .tvos }
        if lower.contains("xros") || lower.contains("visionos") { return .xros }
        if lower.contains("ios") { return .ios }
        return .unknown
    }
}
