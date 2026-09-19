import Foundation
import Input
import RPC
import SimulatorController
import Testing

actor MockSimulatorController: SimulatorController {
    var devices: [SimulatorDevice]
    var taps: [(String, Double, Double)] = []
    var lastType: String?
    var lastPress: HardwareButton?
    var hideHostResult = HostAppActionResult(
        action: "none",
        hidden: true,
        note: "Apple host UI is not running. Attach still works with an already-booted simulator."
    )
    var hideHostCalls = 0
    var showHostCalls = 0

    init(devices: [SimulatorDevice]) {
        self.devices = devices
    }

    func listDevices(availableOnly _: Bool, iosOnly _: Bool) async throws -> [SimulatorDevice] {
        devices
    }

    func boot(udid: String) async throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        guard var device = devices.first(where: { $0.udid == id }) else {
            throw SimulatorError.deviceNotFound(id)
        }
        device.state = .booted
        return device
    }

    func shutdown(udid: String) async throws -> SimulatorDevice {
        let id = try DeviceID.parse(udid)
        guard var device = devices.first(where: { $0.udid == id }) else {
            throw SimulatorError.deviceNotFound(id)
        }
        device.state = .shutdown
        return device
    }

    func install(udid _: String, appPath _: String) async throws {}
    func launch(udid _: String, bundleId _: String) async throws -> Int? { 42 }
    func terminate(udid _: String, bundleId _: String) async throws {}
    func uninstall(udid _: String, bundleId _: String) async throws {}
    func screenshot(udid _: String, outputPath: String) async throws -> String { outputPath }

    func tap(udid: String, x: Double, y: Double) async throws {
        taps.append((udid, x, y))
        throw SimulatorError.notImplemented(
            feature: "simulator.tap",
            message: "HID helper not available"
        )
    }

    func swipe(udid: String, x1: Double, y1: Double, x2: Double, y2: Double, duration: Double?) async throws {
        throw SimulatorError.notImplemented(feature: "simulator.swipe", message: "HID helper not available")
    }

    func typeText(udid: String, text: String) async throws {
        lastType = text
        throw SimulatorError.notImplemented(feature: "simulator.type", message: "HID helper not available")
    }

    func press(udid _: String, button: HardwareButton) async throws {
        lastPress = button
    }

    func uiTree(udid _: String) async throws -> String {
        throw SimulatorError.notImplemented(feature: "simulator.uiTree", message: "axbridge not shipped")
    }

    func startStream(udid _: String, socketPath _: String?) async throws -> StreamSession {
        throw SimulatorError.notAttached("stream not available in tests")
    }

    func setHideHostResult(_ result: HostAppActionResult) {
        hideHostResult = result
    }

    func hideHost() async throws -> HostAppActionResult {
        hideHostCalls += 1
        return hideHostResult
    }

    func showHost() async throws -> HostAppActionResult {
        showHostCalls += 1
        return HostAppActionResult(
            action: "shown",
            hidden: false,
            app: "Device Hub",
            bundleId: HostAppController.deviceHubBundleId,
            note: "Reopened Device Hub. The simulator guest was not detached."
        )
    }
}

struct RPCTests {
    private let sample = SimulatorDevice(
        udid: "939B604A-4B42-4B0C-B164-CAFAB320C123",
        name: "iPhone 17 Pro",
        runtime: "iOS 26.5",
        state: .shutdown
    )

    @Test func listSuccess() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: """
        {"id":"123","method":"simulator.list","params":{}}
        """)
        #expect(response.error == nil)
        guard case let .object(result) = response.result, let devices = result["devices"] else {
            Issue.record("expected devices array")
            return
        }
        guard case let .array(items) = devices else {
            Issue.record("devices should be an array")
            return
        }
        #expect(items.count == 1)
    }

    @Test func tapReturnsNotImplemented() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: """
        {"id":"123","method":"simulator.tap","params":{"deviceId":"939B604A-4B42-4B0C-B164-CAFAB320C123","x":200,"y":500}}
        """)
        #expect(response.error?.code == "NOT_IMPLEMENTED")
        #expect(response.error?.message.contains("HID") == true)
    }

    @Test func rejectsBootedAlias() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: """
        {"id":1,"method":"simulator.boot","params":{"deviceId":"booted"}}
        """)
        #expect(response.error?.code == "INVALID_UDID")
    }

    @Test func permissionDeniedWithoutConsent() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let store = PermissionStore(fileURL: URL(fileURLWithPath: "/tmp/mobile-sim-rpc-missing.json"))
        try? store.revoke()
        let handler = RPCHandler(controller: controller, permissions: store, requireConsent: true)
        let response = await handler.handle(line: #"{"id":"1","method":"simulator.list"}"#)
        #expect(response.error?.code == "PERMISSION_DENIED")
    }

    @Test func homeDispatchesToPressHome() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: """
        {"id":"1","method":"simulator.home","params":{"deviceId":"939B604A-4B42-4B0C-B164-CAFAB320C123"}}
        """)
        #expect(response.error == nil)
        #expect(await controller.lastPress == .home)
        guard case let .object(result) = response.result else {
            Issue.record("expected home result object")
            return
        }
        #expect(result["button"] == .string("home"))
    }

    @Test func hideHostDispatchesWithoutDeviceId() async throws {
        let controller = MockSimulatorController(devices: [sample])
        await controller.setHideHostResult(
            HostAppActionResult(
                action: "hidden",
                hidden: true,
                app: "Device Hub",
                bundleId: HostAppController.deviceHubBundleId,
                note: "Apple Device Hub hidden — control this pane"
            )
        )
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: #"{"id":"1","method":"simulator.hideHost","params":{}}"#)
        #expect(response.error == nil)
        #expect(await controller.hideHostCalls == 1)
        guard case let .object(result) = response.result else {
            Issue.record("expected hideHost result object")
            return
        }
        #expect(result["action"] == .string("hidden"))
        #expect(result["hidden"] == .bool(true))
        #expect(result["app"] == .string("Device Hub"))
        #expect(result["bundleId"] == .string("com.apple.dt.Devices"))
    }

    @Test func showHostDispatches() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: #"{"id":"2","method":"simulator.showHost"}"#)
        #expect(response.error == nil)
        #expect(await controller.showHostCalls == 1)
        guard case let .object(result) = response.result else {
            Issue.record("expected showHost result object")
            return
        }
        #expect(result["action"] == .string("shown"))
        #expect(result["hidden"] == .bool(false))
    }

    @Test func unknownMethod() async throws {
        let controller = MockSimulatorController(devices: [sample])
        let handler = RPCHandler(controller: controller, requireConsent: false)
        let response = await handler.handle(line: #"{"id":"1","method":"simulator.explode"}"#)
        #expect(response.error?.code == "INVALID_REQUEST")
    }

    @Test func encodesRoundTrip() throws {
        let request = try RPCCodec.decodeRequest(Data(#"{"id":"123","method":"simulator.tap","params":{"deviceId":"abc","x":1,"y":2}}"#.utf8))
        #expect(request.method == "simulator.tap")
        #expect(request.params?.number("x") == 1)
        let response = RPCResponse.success(id: .string("123"), result: .object(["ok": .bool(true)]))
        let data = try RPCCodec.encodeResponse(response)
        let text = try #require(String(data: data, encoding: .utf8))
        #expect(text.contains("\"id\":\"123\""))
        #expect(text.hasSuffix("\n"))
    }
}

struct PermissionTests {
    @Test func grantAndRevokeRoundTrip() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("mobile-sim-perm-\(UUID().uuidString).json")
        let store = PermissionStore(fileURL: url)
        #expect(store.isGranted == false)
        try store.grant()
        #expect(store.isGranted)
        let loaded = try #require(store.load())
        #expect(loaded.version == 1)
        #expect(loaded.allowSimulatorControl)
        try store.revoke()
        #expect(store.isGranted == false)
    }
}

struct InputTests {
    @Test func unimplementedInjectorDoesNotFakeSuccess() async {
        let injector = UnimplementedInputInjector()
        await #expect(throws: InputError.self) {
            try await injector.tap(udid: "939B604A-4B42-4B0C-B164-CAFAB320C123", x: 1, y: 2)
        }
    }

    @Test func unavailableSenderDoesNotFakeSuccess() async {
        let sender = UnavailableHIDSender()
        #expect(sender.isAvailable == false)
        await #expect(throws: InputError.self) {
            try await sender.send(udid: "939B604A-4B42-4B0C-B164-CAFAB320C123", events: HIDEventMapper.tap(x: 1, y: 2))
        }
    }
}
