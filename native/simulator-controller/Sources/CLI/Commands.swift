import ArgumentParser
import Foundation
import Input
import RPC
import SimulatorController

struct ListCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "list",
        abstract: "List iOS Simulators (name, UDID, state)."
    )

    @Flag(name: .long, help: "Machine-readable JSON.")
    var json = false

    @Flag(name: .long, help: "Include unavailable devices.")
    var includeUnavailable = false

    @Flag(name: .long, help: "Include watchOS / tvOS / visionOS simulators.")
    var all = false

    func run() async throws {
        do {
            let devices = try await makeController().listDevices(
                availableOnly: !includeUnavailable,
                iosOnly: !all
            )
            if json {
                try CLIJSON.printValue(DeviceListOutput(devices: devices))
                return
            }
            if devices.isEmpty {
                print("No iOS Simulators found. Run `mobile-sim doctor`.")
                return
            }
            let nameWidth = max(4, devices.map(\.name.count).max() ?? 4)
            let runtimeWidth = max(7, devices.map(\.runtime.count).max() ?? 7)
            let udidWidth = 36
            print(
                pad("Name", nameWidth) + "  " +
                pad("UDID", udidWidth) + "  " +
                pad("Runtime", runtimeWidth) + "  " +
                "State"
            )
            for device in devices {
                print(
                    pad(device.name, nameWidth) + "  " +
                    pad(device.udid, udidWidth) + "  " +
                    pad(device.runtime, runtimeWidth) + "  " +
                    device.state.rawValue +
                    screenSuffix(device)
                )
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }

    private func pad(_ text: String, _ width: Int) -> String {
        if text.count >= width { return text }
        return text + String(repeating: " ", count: width - text.count)
    }

    private func screenSuffix(_ device: SimulatorDevice) -> String {
        guard let screen = device.screen else { return "" }
        return "  \(Int(screen.width))x\(Int(screen.height))@\(screen.scale.formatted()) \(screen.origin)"
    }
}

struct BootCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "boot",
        abstract: "Boot a simulator by UDID and wait until it is ready."
    )

    @Argument(help: "Simulator UDID (UUID). Never 'booted'.")
    var udid: String

    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let device = try await makeController().boot(udid: udid)
            if json {
                try CLIJSON.printValue(DeviceActionOutput(udid: device.udid, state: device.state.rawValue))
            } else {
                print("Booted \(device.name) (\(device.udid))")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct ShutdownCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "shutdown",
        abstract: "Shut down a simulator by UDID."
    )

    @Argument(help: "Simulator UDID (UUID).")
    var udid: String

    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let device = try await makeController().shutdown(udid: udid)
            if json {
                try CLIJSON.printValue(DeviceActionOutput(udid: device.udid, state: device.state.rawValue))
            } else {
                print("Shutdown \(device.name) (\(device.udid))")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct InstallCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "install",
        abstract: "Install a .app bundle on a booted simulator."
    )

    @Argument(help: "Simulator UDID.")
    var udid: String

    @Argument(help: "Path to a .app bundle.")
    var path: String

    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().install(udid: udid, appPath: path)
            if json {
                try CLIJSON.printValue(PathOutput(path: path))
            } else {
                print("Installed \(path) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct LaunchCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "launch",
        abstract: "Launch an installed app by bundle identifier."
    )

    @Argument var udid: String
    @Argument var bundleId: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let pid = try await makeController().launch(udid: udid, bundleId: bundleId)
            if json {
                try CLIJSON.printValue(AppActionOutput(udid: udid, bundleId: bundleId, pid: pid))
            } else if let pid {
                print("Launched \(bundleId) on \(udid) (pid \(pid))")
            } else {
                print("Launched \(bundleId) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct TerminateCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "terminate",
        abstract: "Terminate a running app."
    )

    @Argument var udid: String
    @Argument var bundleId: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().terminate(udid: udid, bundleId: bundleId)
            if json {
                try CLIJSON.printValue(AppActionOutput(udid: udid, bundleId: bundleId, pid: nil))
            } else {
                print("Terminated \(bundleId) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct UninstallCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "uninstall",
        abstract: "Uninstall an app by bundle identifier."
    )

    @Argument var udid: String
    @Argument var bundleId: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().uninstall(udid: udid, bundleId: bundleId)
            if json {
                try CLIJSON.printValue(AppActionOutput(udid: udid, bundleId: bundleId, pid: nil))
            } else {
                print("Uninstalled \(bundleId) from \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct ScreenshotCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "screenshot",
        abstract: "Capture a single PNG via simctl io screenshot."
    )

    @Argument var udid: String

    @Argument(help: "Output PNG path. Defaults to screenshot.png.")
    var output: String?

    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let path = output ?? "screenshot.png"
            let written = try await makeController().screenshot(udid: udid, outputPath: path)
            if json {
                try CLIJSON.printValue(ScreenshotOutput(path: written))
            } else {
                print(written)
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct TapCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "tap",
        abstract: "Tap at device-point (x, y), origin top-left. Real HID only."
    )

    @Argument var udid: String
    @Argument var x: Double
    @Argument var y: Double
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().tap(udid: udid, x: x, y: y)
            if json {
                try CLIJSON.printValue(GestureOutput(udid: udid, action: "tap", x: x, y: y))
            } else {
                print("Tapped (\(x), \(y)) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct SwipeCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "swipe",
        abstract: "Swipe between device points, origin top-left. Real HID only."
    )

    @Argument var udid: String
    @Argument var x1: Double
    @Argument var y1: Double
    @Argument var x2: Double
    @Argument var y2: Double
    @Argument(help: "Duration in seconds (reserved for HID).")
    var duration: Double?
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().swipe(
                udid: udid,
                x1: x1,
                y1: y1,
                x2: x2,
                y2: y2,
                duration: duration
            )
            if json {
                try CLIJSON.printValue(GestureOutput(udid: udid, action: "swipe", x: x2, y: y2))
            } else {
                print("Swiped (\(x1), \(y1)) → (\(x2), \(y2)) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct TypeCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "type",
        abstract: "Type text via USB HID keycodes. Real HID only."
    )

    @Argument var udid: String
    @Argument var text: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().typeText(udid: udid, text: text)
            if json {
                try CLIJSON.printValue(GestureOutput(udid: udid, action: "type"))
            } else {
                print("Typed \(text.count) character(s) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct DoctorCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "doctor",
        abstract: "Check macOS, Xcode, iPhoneSimulator.platform, and simctl."
    )

    @Flag(name: .long)
    var json = false

    func run() async throws {
        let report = Doctor().run()
        if json {
            try CLIJSON.printValue(report)
        } else {
            print(DoctorFormatting.text(report))
        }
        if !report.ok {
            throw ExitCode(1)
        }
    }
}

struct RPCCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "rpc",
        abstract: "JSON-RPC on stdin/stdout (newline-delimited). Requires consent."
    )

    @Flag(name: .long, help: "Skip ~/.mobile-simulator/permissions.json (debug only).")
    var noConsent = false

    func run() async throws {
        let handler = RPCHandler(
            controller: makeController(),
            permissions: .live,
            requireConsent: !noConsent
        )
        try await JSONRPCServer(handler: handler).run()
    }
}

struct GrantCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "grant",
        abstract: "Write ~/.mobile-simulator/permissions.json for RPC/MCP."
    )

    func run() throws {
        try PermissionStore.live.grant()
        print("Granted simulator control.")
        print("Wrote \(PermissionStore.defaultFileURL.path)")
    }
}

struct RevokeCommand: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "revoke",
        abstract: "Remove the consent file."
    )

    func run() throws {
        try PermissionStore.live.revoke()
        print("Revoked simulator control consent.")
    }
}

struct PressCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "press",
        abstract: "Press home, lock, volumeUp, or volumeDown via HID."
    )

    @Argument var udid: String
    @Argument(help: "home | lock | volumeUp | volumeDown")
    var button: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        guard let parsed = HardwareButton(cli: button) else {
            let error = SimulatorError.invalidRequest(
                "Unknown button '\(button)'. Use home, lock, volumeUp, or volumeDown."
            )
            if json { try dieJSON(error) } else { try die(error) }
        }
        do {
            try await makeController().press(udid: udid, button: parsed)
            if json {
                try CLIJSON.printValue(PressOutput(udid: udid, button: parsed.cliName))
            } else {
                print("Pressed \(parsed.cliName) on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct HomeCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "home",
        abstract: "Press the Home button (alias of press home)."
    )

    @Argument var udid: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            try await makeController().press(udid: udid, button: .home)
            if json {
                try CLIJSON.printValue(PressOutput(udid: udid, button: "home"))
            } else {
                print("Pressed home on \(udid)")
            }
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct StreamCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "stream",
        abstract: "H.264 Annex-B via SimulatorVideoStream. Not screenshot polling."
    )

    @Argument var udid: String
    @Option(name: .long, help: "Unix socket path. Default: stdout.")
    var socket: String?
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let session = try await makeController().startStream(udid: udid, socketPath: socket)
            // H.264 Annex-B uses stdout when no socket is given; keep metadata off that bitstream.
            let meta = FileHandle.standardError
            if json {
                let data = try CLIJSON.encoder.encode(session)
                meta.write(data)
                meta.write(Data("\n".utf8))
            } else {
                var text = "Streaming \(session.format) via \(session.transport) to \(session.socketPath ?? "stdout")\n"
                if let note = session.note { text += note + "\n" }
                meta.write(Data(text.utf8))
            }
            // Keep the process alive while the in-process stream runs.
            try await Task.sleep(nanoseconds: UInt64.max / 2)
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}

struct UITreeCommand: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "uitree",
        abstract: "Dump the AX tree (requires SimulatorFrameworkBridge / axbridge)."
    )

    @Argument var udid: String
    @Flag(name: .long)
    var json = false

    func run() async throws {
        do {
            let tree = try await makeController().uiTree(udid: udid)
            print(tree)
        } catch {
            if json { try dieJSON(error) } else { try die(error) }
        }
    }
}
