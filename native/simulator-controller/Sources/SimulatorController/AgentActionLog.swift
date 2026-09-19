import Foundation

/// Best-effort sidecar so the viewer can overlay MCP/CLI HID while attached to the same UDID.
public enum AgentActionLog {
    public static var defaultFileURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".mobile-simulator", isDirectory: true)
            .appendingPathComponent("last-action.json")
    }

    public static func record(udid: String, action: String, payload: [String: Any] = [:], fileURL: URL = defaultFileURL) {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let object: [String: Any] = [
            "udid": udid,
            "action": action,
            "at": formatter.string(from: Date()),
            "payload": payload,
        ]
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        else {
            return
        }
        let directory = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: fileURL, options: .atomic)
    }
}
