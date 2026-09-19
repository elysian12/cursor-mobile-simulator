import Foundation

public struct XcodeVersion: Sendable, Equatable, Comparable {
    public var major: Int
    public var minor: Int
    public var patch: Int
    public var raw: String
    public var build: String?

    public init(major: Int, minor: Int, patch: Int, raw: String, build: String? = nil) {
        self.major = major
        self.minor = minor
        self.patch = patch
        self.raw = raw
        self.build = build
    }

    public var display: String {
        if let build {
            return "\(raw) (\(build))"
        }
        return raw
    }

    public static let minimumSupported = XcodeVersion(major: 26, minor: 0, patch: 0, raw: "26.0")

    public static func parse(xcodebuildOutput: String) -> XcodeVersion? {
        let lines = xcodebuildOutput.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }
        guard let versionLine = lines.first(where: { $0.hasPrefix("Xcode ") }) else {
            return nil
        }
        let raw = String(versionLine.dropFirst("Xcode ".count)).trimmingCharacters(in: .whitespaces)
        var build: String?
        if let buildLine = lines.first(where: { $0.hasPrefix("Build version ") }) {
            build = String(buildLine.dropFirst("Build version ".count)).trimmingCharacters(in: .whitespaces)
        }
        return parse(versionString: raw, build: build)
    }

    public static func parse(versionString: String, build: String? = nil) -> XcodeVersion? {
        let trimmed = versionString.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = trimmed.split(separator: ".").compactMap { Int($0) }
        guard let major = parts.first else { return nil }
        let minor = parts.count > 1 ? parts[1] : 0
        let patch = parts.count > 2 ? parts[2] : 0
        return XcodeVersion(major: major, minor: minor, patch: patch, raw: trimmed, build: build)
    }

    public func isAtLeast(_ other: XcodeVersion) -> Bool {
        self >= other
    }

    public static func < (lhs: XcodeVersion, rhs: XcodeVersion) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        return lhs.patch < rhs.patch
    }
}
