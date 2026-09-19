import Foundation

#if canImport(AppKit)
import AppKit
#endif

/// Result of hiding or reopening Apple’s simulator *presenter* (Device Hub / Simulator.app).
/// Never implies a CoreSimulator / `simctl shutdown`. The guest can stay Booted.
public struct HostAppActionResult: Sendable, Equatable {
    public var action: String
    public var hidden: Bool
    public var app: String?
    public var bundleId: String?
    public var note: String

    public init(
        action: String,
        hidden: Bool,
        app: String? = nil,
        bundleId: String? = nil,
        note: String
    ) {
        self.action = action
        self.hidden = hidden
        self.app = app
        self.bundleId = bundleId
        self.note = note
    }
}

public struct HostAppProcess: Sendable, Equatable {
    public var pid: Int32
    public var bundleIdentifier: String
    public var localizedName: String

    public init(pid: Int32, bundleIdentifier: String, localizedName: String) {
        self.pid = pid
        self.bundleIdentifier = bundleIdentifier
        self.localizedName = localizedName
    }
}

/// Process-level hide / terminate / open. No GUI automation (no clicks, no AppleScript).
public protocol HostAppRuntime: Sendable {
    func runningHostApps() -> [HostAppProcess]
    func hide(pid: Int32) -> Bool
    func isHidden(pid: Int32) -> Bool
    func unhide(pid: Int32) -> Bool
    func terminate(pid: Int32) -> Bool
    func open(named name: String) -> Bool
}

/// Hide vs quit (Xcode 27):
/// - Hide Device Hub.app / Simulator.app with `NSRunningApplication.hide()`.
/// - Do **not** `terminate()` Device Hub. On this Xcode 27 host, quitting
///   DeviceHub.app also shuts down the CoreSimulator guest. Hide keeps the
///   window out of the way; the guest stays Booted.
/// - If a hidden Device Hub still owns the IOSurface, the viewer falls back
///   to Snapshot (simctl PNG). Never `simctl shutdown` as part of hide.
public struct HostAppController: Sendable {
    public static let deviceHubBundleId = "com.apple.dt.Devices"
    public static let simulatorBundleId = "com.apple.iphonesimulator"
    public static let deviceHubName = "Device Hub"
    public static let deviceHubOpenNames = ["Device Hub", "DeviceHub"]
    public static let simulatorName = "Simulator"
    public static let deviceHubAppPath = "/Applications/Xcode.app/Contents/Applications/DeviceHub.app"

    private let runtime: any HostAppRuntime

    public init(runtime: any HostAppRuntime = AppKitHostAppRuntime()) {
        self.runtime = runtime
    }

    public static func isHostBundle(_ bundleId: String) -> Bool {
        bundleId == deviceHubBundleId || bundleId == simulatorBundleId
    }

    public static func displayName(for bundleId: String) -> String {
        if bundleId == deviceHubBundleId {
            return deviceHubName
        }
        if bundleId == simulatorBundleId {
            return simulatorName
        }
        return bundleId
    }

    public func hideHost() -> HostAppActionResult {
        let apps = prioritized(runtime.runningHostApps())
        if apps.isEmpty {
            return HostAppActionResult(
                action: "none",
                hidden: true,
                note: "Apple host UI is not running. Attach still works with an already-booted simulator."
            )
        }

        var lastName = Self.displayName(for: apps[0].bundleIdentifier)
        var lastBundle = apps[0].bundleIdentifier

        for app in apps {
            lastName = Self.displayName(for: app.bundleIdentifier)
            lastBundle = app.bundleIdentifier
            let hid = runtime.hide(pid: app.pid)
            // hide() from a CLI often returns false; isHidden can lag a tick.
            let nowHidden = hid || waitUntilHidden(pid: app.pid)
            if nowHidden {
                let label = app.bundleIdentifier == Self.deviceHubBundleId ? "Device Hub" : "Simulator"
                return HostAppActionResult(
                    action: "hidden",
                    hidden: true,
                    app: lastName,
                    bundleId: lastBundle,
                    note: "Apple \(label) hidden — control this pane"
                )
            }
        }

        return HostAppActionResult(
            action: "none",
            hidden: false,
            app: lastName,
            bundleId: lastBundle,
            note: "Could not hide \(lastName). Attach still works; the Apple host window may stay visible."
        )
    }

    public func showHost() -> HostAppActionResult {
        let running = runtime.runningHostApps()
        if let hub = running.first(where: { $0.bundleIdentifier == Self.deviceHubBundleId }) {
            if runtime.unhide(pid: hub.pid) {
                return shown(app: Self.deviceHubName, bundleId: Self.deviceHubBundleId)
            }
        }
        if let sim = running.first(where: { $0.bundleIdentifier == Self.simulatorBundleId }) {
            if runtime.unhide(pid: sim.pid) {
                return shown(app: Self.simulatorName, bundleId: Self.simulatorBundleId)
            }
        }
        for name in Self.deviceHubOpenNames {
            if runtime.open(named: name) {
                return shown(app: Self.deviceHubName, bundleId: Self.deviceHubBundleId)
            }
        }
        if runtime.open(named: Self.deviceHubAppPath) {
            return shown(app: Self.deviceHubName, bundleId: Self.deviceHubBundleId)
        }
        if runtime.open(named: Self.simulatorName) {
            return shown(app: Self.simulatorName, bundleId: Self.simulatorBundleId)
        }
        return HostAppActionResult(
            action: "none",
            hidden: running.isEmpty,
            note: "Could not reopen Device Hub or Simulator. Try `open -a \"Device Hub\"` or `open -a DeviceHub`."
        )
    }

    private func shown(app: String, bundleId: String) -> HostAppActionResult {
        HostAppActionResult(
            action: "shown",
            hidden: false,
            app: app,
            bundleId: bundleId,
            note: "Reopened \(app). The simulator guest was not detached."
        )
    }

    private func waitUntilHidden(pid: Int32, timeout: TimeInterval = 0.8) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            if runtime.isHidden(pid: pid) {
                return true
            }
            Thread.sleep(forTimeInterval: 0.05)
        } while Date() < deadline
        return runtime.isHidden(pid: pid)
    }

    private func prioritized(_ apps: [HostAppProcess]) -> [HostAppProcess] {
        apps.sorted { lhs, rhs in
            if lhs.bundleIdentifier == Self.deviceHubBundleId { return true }
            if rhs.bundleIdentifier == Self.deviceHubBundleId { return false }
            return lhs.bundleIdentifier < rhs.bundleIdentifier
        }
    }
}

public struct AppKitHostAppRuntime: HostAppRuntime {
    public init() {}

    public func runningHostApps() -> [HostAppProcess] {
        #if canImport(AppKit)
        NSWorkspace.shared.runningApplications.compactMap { app in
            guard let bundleId = app.bundleIdentifier, HostAppController.isHostBundle(bundleId) else {
                return nil
            }
            return HostAppProcess(
                pid: app.processIdentifier,
                bundleIdentifier: bundleId,
                localizedName: app.localizedName ?? HostAppController.displayName(for: bundleId)
            )
        }
        #else
        []
        #endif
    }

    public func hide(pid: Int32) -> Bool {
        #if canImport(AppKit)
        NSRunningApplication(processIdentifier: pid)?.hide() ?? false
        #else
        false
        #endif
    }

    public func isHidden(pid: Int32) -> Bool {
        #if canImport(AppKit)
        NSRunningApplication(processIdentifier: pid)?.isHidden ?? false
        #else
        false
        #endif
    }

    public func unhide(pid: Int32) -> Bool {
        #if canImport(AppKit)
        guard let app = NSRunningApplication(processIdentifier: pid) else {
            return false
        }
        let revealed = app.unhide()
        return app.activate() || revealed
        #else
        false
        #endif
    }

    public func terminate(pid: Int32) -> Bool {
        #if canImport(AppKit)
        NSRunningApplication(processIdentifier: pid)?.terminate() ?? false
        #else
        false
        #endif
    }

    public func open(named name: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        if name.hasPrefix("/") {
            process.arguments = [name]
        } else {
            process.arguments = ["-a", name]
        }
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}
