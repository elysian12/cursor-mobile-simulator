import Foundation
import SimulatorController
import Testing

/// Live tap + screenshot on a real simulator. Off unless MOBILE_SIM_LIVE=1
/// (or `scripts/test-hid-live.sh`). Boots iPhone SE when possible, shuts it
/// down only if this process booted it.
struct LiveHIDTests {
    @Test func liveTapAndScreenshot() async throws {
        guard ProcessInfo.processInfo.environment["MOBILE_SIM_LIVE"] == "1" else {
            return
        }

        let controller = HybridController()
        let devices = try await controller.listDevices(availableOnly: true, iosOnly: true)
        guard !devices.isEmpty else {
            Issue.record("No iOS Simulators available")
            return
        }

        let preferred = devices.first { $0.name.contains("SE") }
            ?? devices.first { $0.state.isBooted }
            ?? devices.first
        let target = try #require(preferred)
        let alreadyBooted = target.state.isBooted
        var bootedByTest = false

        if !alreadyBooted {
            _ = try await controller.boot(udid: target.udid)
            bootedByTest = true
        }

        defer {
            if bootedByTest {
                Task {
                    _ = try? await controller.shutdown(udid: target.udid)
                }
            }
        }

        let tmp = FileManager.default.temporaryDirectory
        let before = tmp.appendingPathComponent("mobile-sim-live-before.png").path
        let after = tmp.appendingPathComponent("mobile-sim-live-after.png").path

        let writtenBefore = try await controller.screenshot(udid: target.udid, outputPath: before)
        #expect(FileManager.default.fileExists(atPath: writtenBefore))

        let screen = try await controller.listDevices(availableOnly: true, iosOnly: true)
            .first { $0.udid == target.udid }?.screen
        let x = (screen?.width ?? 200) / 2
        let y = (screen?.height ?? 400) / 2

        do {
            try await controller.tap(udid: target.udid, x: x, y: y)
        } catch let error as SimulatorError {
            if error.code == .notAttached {
                Issue.record(
                    "HID attach failed (expected if FBSC is not linked): \(error.message)"
                )
            } else {
                throw error
            }
        }

        let writtenAfter = try await controller.screenshot(udid: target.udid, outputPath: after)
        #expect(FileManager.default.fileExists(atPath: writtenAfter))

        if bootedByTest {
            _ = try await controller.shutdown(udid: target.udid)
            bootedByTest = false
        }
    }
}
