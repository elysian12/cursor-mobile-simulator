import ArgumentParser
import Darwin
import Foundation
import SimulatorController

/// A disconnected Unix stream socket must not kill `mobile-sim rpc` (SIGPIPE).
enum ProcessSignals {
    static let ignoreBrokenPipe: Void = {
        signal(SIGPIPE, SIG_IGN)
    }()
}

@main
struct MobileSim: AsyncParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "mobile-sim",
        abstract: "Control iOS Simulators by explicit UDID.",
        discussion: """
        Native owner of simulator state. Always pass a device UDID — never 'booted'.
        Input uses in-process SimulatorHID (facebook/idb). Coordinates are device points, origin top-left.
        """,
        version: "0.2.0",
        subcommands: [
            ListCommand.self,
            BootCommand.self,
            ShutdownCommand.self,
            InstallCommand.self,
            LaunchCommand.self,
            TerminateCommand.self,
            UninstallCommand.self,
            ScreenshotCommand.self,
            TapCommand.self,
            SwipeCommand.self,
            TypeCommand.self,
            PressCommand.self,
            HomeCommand.self,
            StreamCommand.self,
            UITreeCommand.self,
            DoctorCommand.self,
            RPCCommand.self,
            GrantCommand.self,
            RevokeCommand.self,
        ]
    )
}

enum CLIJSON {
    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    static func printValue<T: Encodable>(_ value: T) throws {
        let data = try encoder.encode(value)
        if let text = String(data: data, encoding: .utf8) {
            print(text)
        }
    }
}

func makeController() -> HybridController {
    _ = ProcessSignals.ignoreBrokenPipe
    return HybridController()
}

func die(_ error: Error) throws -> Never {
    let simulatorError: SimulatorError
    if let error = error as? SimulatorError {
        simulatorError = error
    } else {
        simulatorError = .internalError(error.localizedDescription)
    }
    FileHandle.standardError.write(
        Data((simulatorError.localizedDescription + "\n").utf8)
    )
    throw ExitCode(simulatorError.exitCode)
}

func dieJSON(_ error: Error) throws -> Never {
    let simulatorError: SimulatorError
    if let error = error as? SimulatorError {
        simulatorError = error
    } else {
        simulatorError = .internalError(error.localizedDescription)
    }
    try CLIJSON.printValue(["error": WireError(simulatorError)])
    throw ExitCode(simulatorError.exitCode)
}

struct DeviceListOutput: Encodable {
    var devices: [SimulatorDevice]
}

struct DeviceActionOutput: Encodable {
    var udid: String
    var state: String
}

struct AppActionOutput: Encodable {
    var udid: String
    var bundleId: String
    var pid: Int?
}

struct ScreenshotOutput: Encodable {
    var path: String
}

struct PathOutput: Encodable {
    var path: String
}

struct GestureOutput: Encodable {
    var udid: String
    var action: String
    var x: Double?
    var y: Double?
}

struct PressOutput: Encodable {
    var udid: String
    var button: String
}
