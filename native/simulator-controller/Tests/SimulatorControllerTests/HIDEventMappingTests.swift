import Foundation
import Input
import Testing

struct HIDEventMappingTests {
    @Test func tapIsDownThenUp() {
        let events = HIDEventMapper.tap(x: 120, y: 340)
        #expect(events == [
            .touchDown(x: 120, y: 340),
            .touchUp(x: 120, y: 340),
        ])
    }

    @Test func swipeInterpolatesAndEndsWithUp() {
        let events = HIDEventMapper.swipe(x1: 0, y1: 0, x2: 30, y2: 0, duration: 0.3, delta: 10)
        #expect(events.first == .touchDown(x: 0, y: 0))
        guard case let .touchUp(x, y) = events.last else {
            Issue.record("swipe must end with touch-up (never silent success)")
            return
        }
        #expect(x == 30)
        #expect(y == 0)
        #expect(events.contains { if case .delay = $0 { return true } else { return false } })
        #expect(events.filter { if case .touchDown = $0 { return true } else { return false } }.count >= 2)
    }

    @Test func pressIsDownThenUp() {
        #expect(HIDEventMapper.press(.home) == [.buttonDown(.home), .buttonUp(.home)])
        #expect(HIDEventMapper.press(.lock) == [.buttonDown(.lock), .buttonUp(.lock)])
        #expect(HIDEventMapper.press(.volumeUp) == [.buttonDown(.volumeUp), .buttonUp(.volumeUp)])
        #expect(HIDEventMapper.press(.volumeDown) == [.buttonDown(.volumeDown), .buttonUp(.volumeDown)])
    }

    @Test func typeHelloUsesHIDUsagesNotUnicode() throws {
        let events = try HIDEventMapper.typeText("Hi")
        // H = 0x0B shift, i = 0x0C
        #expect(events == [
            .keyDown(KeyboardMapper.shiftKeyCode),
            .keyDown(0x0B),
            .keyUp(0x0B),
            .keyUp(KeyboardMapper.shiftKeyCode),
            .keyDown(0x0C),
            .keyUp(0x0C),
        ])
    }

    @Test func typeRejectsUnmappedCharacters() {
        #expect(throws: InputError.self) {
            _ = try HIDEventMapper.typeText("🙂")
        }
    }

    @Test func hardwareButtonCLINames() {
        #expect(HardwareButton(cli: "home") == .home)
        #expect(HardwareButton(cli: "volume_up") == .volumeUp)
        #expect(HardwareButton(cli: "volumeDown") == .volumeDown)
        #expect(HardwareButton(cli: "LOCK") == .lock)
        #expect(HardwareButton(cli: "explode") == nil)
    }

    @Test func keyboardDigitsAndSymbols() {
        #expect(KeyboardMapper.stroke(for: "1") == .init(keyCode: 0x1E))
        #expect(KeyboardMapper.stroke(for: "0") == .init(keyCode: 0x27))
        #expect(KeyboardMapper.stroke(for: "!") == .init(keyCode: 0x1E, shift: true))
        #expect(KeyboardMapper.stroke(for: " ") == .init(keyCode: 0x2C))
        #expect(KeyboardMapper.stroke(for: "\n") == .init(keyCode: 0x28))
    }
}
