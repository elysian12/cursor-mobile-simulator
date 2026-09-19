import Foundation
import Input
import SimulatorController

public struct RPCHandler: Sendable {
    private let controller: any SimulatorController
    private let permissions: PermissionStore
    private let requireConsent: Bool

    public init(
        controller: any SimulatorController,
        permissions: PermissionStore = .live,
        requireConsent: Bool = true
    ) {
        self.controller = controller
        self.permissions = permissions
        self.requireConsent = requireConsent
    }

    public func handle(line: String) async -> RPCResponse {
        let data = Data(line.utf8)
        let request: RPCRequest
        do {
            request = try RPCCodec.decodeRequest(data)
        } catch {
            return .failure(
                id: nil,
                error: .invalidRequest("Could not parse JSON-RPC request: \(error.localizedDescription)")
            )
        }
        return await handle(request)
    }

    public func handle(_ request: RPCRequest) async -> RPCResponse {
        if requireConsent {
            do {
                try permissions.requireGranted()
            } catch let error as SimulatorError {
                return .failure(id: request.id, error: error)
            } catch {
                return .failure(id: request.id, error: .permissionDenied())
            }
        }

        do {
            let result = try await dispatch(request)
            return .success(id: request.id, result: result)
        } catch let error as SimulatorError {
            return .failure(id: request.id, error: error)
        } catch {
            return .failure(id: request.id, error: .internalError(error.localizedDescription))
        }
    }

    private func dispatch(_ request: RPCRequest) async throws -> JSONValue {
        let params = request.params ?? .object([:])
        switch request.method {
        case "simulator.list":
            let availableOnly = params.bool("available") ?? true
            let platform = params.string("platform") ?? "ios"
            let devices = try await controller.listDevices(
                availableOnly: availableOnly,
                iosOnly: platform != "all"
            )
            return .object(["devices": .array(devices.map(encode(device:)))])

        case "simulator.boot":
            let device = try await controller.boot(udid: try deviceId(params))
            return encodeAction(device: device, state: "Booted")

        case "simulator.shutdown":
            let device = try await controller.shutdown(udid: try deviceId(params))
            return .object(["udid": .string(device.udid), "state": .string("Shutdown")])

        case "simulator.screenshot":
            let udid = try deviceId(params)
            let path = params.string("path") ?? defaultScreenshotPath(udid: udid)
            let written = try await controller.screenshot(udid: udid, outputPath: path)
            return .object(["path": .string(written)])

        case "simulator.tap":
            try await controller.tap(
                udid: try deviceId(params),
                x: try number(params, "x"),
                y: try number(params, "y")
            )
            return .object([:])

        case "simulator.swipe":
            try await controller.swipe(
                udid: try deviceId(params),
                x1: try number(params, "x1"),
                y1: try number(params, "y1"),
                x2: try number(params, "x2"),
                y2: try number(params, "y2"),
                duration: params.number("duration")
            )
            return .object([:])

        case "simulator.type":
            guard let text = params.string("text") else {
                throw SimulatorError.invalidRequest("params.text is required for simulator.type")
            }
            try await controller.typeText(udid: try deviceId(params), text: text)
            return .object([:])

        case "simulator.press":
            guard let raw = params.string("button") ?? params.string("key") else {
                throw SimulatorError.invalidRequest("params.button is required for simulator.press (home|lock|volumeUp|volumeDown)")
            }
            guard let button = HardwareButton(cli: raw) else {
                throw SimulatorError.invalidRequest("Unknown button '\(raw)'. Use home, lock, volumeUp, or volumeDown.")
            }
            try await controller.press(udid: try deviceId(params), button: button)
            return .object(["button": .string(button.cliName)])

        case "simulator.home":
            try await controller.press(udid: try deviceId(params), button: .home)
            return .object(["button": .string("home")])

        case "simulator.uiTree":
            let tree = try await controller.uiTree(udid: try deviceId(params))
            return .object(["tree": .string(tree)])

        case "simulator.stream":
            let session = try await controller.startStream(
                udid: try deviceId(params),
                socketPath: params.string("socket") ?? params.string("path")
            )
            var result: [String: JSONValue] = [
                "udid": .string(session.udid),
                "transport": .string(session.transport),
                "format": .string(session.format),
            ]
            if let socket = session.socketPath {
                result["socket"] = .string(socket)
            }
            if let note = session.note {
                result["note"] = .string(note)
            }
            return .object(result)

        case "simulator.hideHost":
            return encode(host: try await controller.hideHost())

        case "simulator.showHost":
            return encode(host: try await controller.showHost())

        case "app.install":
            guard let path = params.string("path") else {
                throw SimulatorError.invalidRequest("params.path is required for app.install")
            }
            let udid = try deviceId(params)
            try await controller.install(udid: udid, appPath: path)
            return .object(["udid": .string(udid), "path": .string(path)])

        case "app.launch":
            let udid = try deviceId(params)
            let bundleId = try bundleId(params)
            let pid = try await controller.launch(udid: udid, bundleId: bundleId)
            var result: [String: JSONValue] = [
                "udid": .string(udid),
                "bundleId": .string(bundleId),
            ]
            if let pid {
                result["pid"] = .number(Double(pid))
            }
            return .object(result)

        case "app.terminate":
            let udid = try deviceId(params)
            let bundleId = try bundleId(params)
            try await controller.terminate(udid: udid, bundleId: bundleId)
            return .object(["udid": .string(udid), "bundleId": .string(bundleId)])

        case "app.uninstall":
            let udid = try deviceId(params)
            let bundleId = try bundleId(params)
            try await controller.uninstall(udid: udid, bundleId: bundleId)
            return .object(["udid": .string(udid), "bundleId": .string(bundleId)])

        default:
            throw SimulatorError.invalidRequest(
                "Unknown method '\(request.method)'. See packages/protocol Methods."
            )
        }
    }

    private func deviceId(_ params: JSONValue) throws -> String {
        guard let value = params.firstString(keys: ["deviceId", "udid"]) else {
            throw SimulatorError.invalidRequest("params.deviceId is required (explicit UDID).")
        }
        return try DeviceID.parse(value)
    }

    private func bundleId(_ params: JSONValue) throws -> String {
        guard let value = params.string("bundleId"), !value.isEmpty else {
            throw SimulatorError.invalidRequest("params.bundleId is required.")
        }
        return value
    }

    private func number(_ params: JSONValue, _ key: String) throws -> Double {
        guard let value = params.number(key) else {
            throw SimulatorError.invalidRequest("params.\(key) is required and must be a number.")
        }
        return value
    }

    private func encode(device: SimulatorDevice) -> JSONValue {
        var object: [String: JSONValue] = [
            "udid": .string(device.udid),
            "name": .string(device.name),
            "runtime": .string(device.runtime),
            "state": .string(device.state.rawValue),
        ]
        if let deviceType = device.deviceType {
            object["deviceType"] = .string(deviceType)
        }
        if let screen = device.screen {
            object["screen"] = .object([
                "width": .number(screen.width),
                "height": .number(screen.height),
                "scale": .number(screen.scale),
                "origin": .string(screen.origin),
            ])
        }
        return .object(object)
    }

    private func encode(host: HostAppActionResult) -> JSONValue {
        var object: [String: JSONValue] = [
            "action": .string(host.action),
            "hidden": .bool(host.hidden),
            "note": .string(host.note),
        ]
        if let app = host.app {
            object["app"] = .string(app)
        }
        if let bundleId = host.bundleId {
            object["bundleId"] = .string(bundleId)
        }
        return .object(object)
    }

    private func encodeAction(device: SimulatorDevice, state: String) -> JSONValue {
        var object: [String: JSONValue] = [
            "udid": .string(device.udid),
            "state": .string(state),
        ]
        if let screen = device.screen {
            object["screen"] = .object([
                "width": .number(screen.width),
                "height": .number(screen.height),
                "scale": .number(screen.scale),
                "origin": .string(screen.origin),
            ])
        }
        return .object(object)
    }

    private func defaultScreenshotPath(udid: String) -> String {
        let stamp = Int(Date().timeIntervalSince1970)
        return FileManager.default.temporaryDirectory
            .appendingPathComponent("mobile-sim-\(udid)-\(stamp).png")
            .path
    }
}

public struct JSONRPCServer: Sendable {
    private let handler: RPCHandler

    public init(handler: RPCHandler) {
        self.handler = handler
    }

    public func run(output: FileHandle = .standardOutput) async throws {
        while let line = readLine(strippingNewline: true) {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            let response = await handler.handle(line: trimmed)
            let data = try RPCCodec.encodeResponse(response)
            try output.write(contentsOf: data)
        }
    }
}
