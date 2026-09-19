import Foundation
import SimulatorController
import Testing

final class MockHostAppRuntime: HostAppRuntime, @unchecked Sendable {
    var apps: [HostAppProcess]
    var hideCalls: [Int32] = []
    var unhideCalls: [Int32] = []
    var terminateCalls: [Int32] = []
    var openCalls: [String] = []
    var hideSucceeds = true
    /// When false, hide leaves the process in `apps` (Device Hub still holding IOSurface).
    var hideRemoves = true
    /// After hide(), report the process as hidden even if hide() returned false.
    var reportsHiddenAfterHide = false
    var unhideSucceeds = true
    var terminateSucceeds = true
    var openSucceeds = true

    init(apps: [HostAppProcess] = []) {
        self.apps = apps
    }

    func runningHostApps() -> [HostAppProcess] {
        apps
    }

    func hide(pid: Int32) -> Bool {
        hideCalls.append(pid)
        if hideSucceeds && hideRemoves {
            apps.removeAll { $0.pid == pid }
        }
        return hideSucceeds
    }

    func isHidden(pid: Int32) -> Bool {
        if reportsHiddenAfterHide && hideCalls.contains(pid) {
            return true
        }
        return hideSucceeds && hideRemoves && !apps.contains { $0.pid == pid }
    }

    func unhide(pid: Int32) -> Bool {
        unhideCalls.append(pid)
        return unhideSucceeds
    }

    func terminate(pid: Int32) -> Bool {
        terminateCalls.append(pid)
        if terminateSucceeds {
            apps.removeAll { $0.pid == pid }
        }
        return terminateSucceeds
    }

    func open(named name: String) -> Bool {
        openCalls.append(name)
        return openSucceeds
    }
}

struct HostAppControllerTests {
    private let hub = HostAppProcess(
        pid: 101,
        bundleIdentifier: HostAppController.deviceHubBundleId,
        localizedName: "Device Hub"
    )
    private let simulator = HostAppProcess(
        pid: 202,
        bundleIdentifier: HostAppController.simulatorBundleId,
        localizedName: "Simulator"
    )

    @Test func hideWhenNoHostAppStillSucceeds() {
        let runtime = MockHostAppRuntime(apps: [])
        let result = HostAppController(runtime: runtime).hideHost()
        #expect(result.action == "none")
        #expect(result.hidden == true)
        #expect(result.note.contains("not running"))
        #expect(runtime.hideCalls.isEmpty)
        #expect(runtime.terminateCalls.isEmpty)
    }

    @Test func hideDeviceHubWhenHideRemovesWindow() {
        let runtime = MockHostAppRuntime(apps: [hub])
        let result = HostAppController(runtime: runtime).hideHost()
        #expect(result.action == "hidden")
        #expect(result.hidden == true)
        #expect(result.app == "Device Hub")
        #expect(result.note.contains("hidden"))
        #expect(runtime.hideCalls == [101])
        #expect(runtime.terminateCalls.isEmpty)
    }

    @Test func hideSucceedsWhenApiReturnsFalseButAppIsHidden() {
        let runtime = MockHostAppRuntime(apps: [hub])
        runtime.hideSucceeds = false
        runtime.reportsHiddenAfterHide = true
        let result = HostAppController(runtime: runtime).hideHost()
        #expect(result.action == "hidden")
        #expect(result.hidden == true)
        #expect(runtime.terminateCalls.isEmpty)
    }

    @Test func hideDoesNotQuitDeviceHubEvenIfProcessStaysRunning() {
        let runtime = MockHostAppRuntime(apps: [hub])
        runtime.hideRemoves = false
        let result = HostAppController(runtime: runtime).hideHost()
        #expect(result.action == "hidden")
        #expect(result.hidden == true)
        #expect(result.app == "Device Hub")
        #expect(result.note.contains("hidden"))
        #expect(runtime.hideCalls == [101])
        #expect(runtime.terminateCalls.isEmpty)
    }

    @Test func hideSimulatorAppWithoutQuit() {
        let runtime = MockHostAppRuntime(apps: [simulator])
        runtime.hideRemoves = false
        let result = HostAppController(runtime: runtime).hideHost()
        #expect(result.action == "hidden")
        #expect(result.app == "Simulator")
        #expect(runtime.hideCalls == [202])
        #expect(runtime.terminateCalls.isEmpty)
    }

    @Test func prefersDeviceHubOverSimulator() {
        let runtime = MockHostAppRuntime(apps: [simulator, hub])
        _ = HostAppController(runtime: runtime).hideHost()
        #expect(runtime.hideCalls.first == 101)
    }

    @Test func showUnhidesRunningDeviceHub() {
        let runtime = MockHostAppRuntime(apps: [hub])
        let result = HostAppController(runtime: runtime).showHost()
        #expect(result.action == "shown")
        #expect(result.hidden == false)
        #expect(result.app == "Device Hub")
        #expect(runtime.unhideCalls == [101])
        #expect(runtime.openCalls.isEmpty)
    }

    @Test func showOpensDeviceHubWhenNotRunning() {
        let runtime = MockHostAppRuntime(apps: [])
        let result = HostAppController(runtime: runtime).showHost()
        #expect(result.action == "shown")
        #expect(runtime.openCalls == ["Device Hub"])
        #expect(result.note.contains("not detached"))
    }

    @Test func showFallsBackToSimulator() {
        let selective = FailingThenOpenRuntime()
        let result = HostAppController(runtime: selective).showHost()
        #expect(result.action == "shown")
        #expect(result.app == "Simulator")
        #expect(selective.openCalls.contains("Device Hub"))
        #expect(selective.openCalls.contains("Simulator"))
        #expect(selective.openCalls.last == "Simulator")
    }
}

final class FailingThenOpenRuntime: HostAppRuntime, @unchecked Sendable {
    var openCalls: [String] = []

    func runningHostApps() -> [HostAppProcess] { [] }
    func hide(pid _: Int32) -> Bool { false }
    func isHidden(pid _: Int32) -> Bool { false }
    func unhide(pid _: Int32) -> Bool { false }
    func terminate(pid _: Int32) -> Bool { false }
    func open(named name: String) -> Bool {
        openCalls.append(name)
        return name == "Simulator"
    }
}
