import Foundation

/// Transport-agnostic HID primitives. Mirrors facebook/idb `SimulatorHIDEvent` factories
/// (tap / swipe / type / button) so we can unit-test mapping without linking FBSC.
public enum MappedHIDEvent: Sendable, Equatable {
    case touchDown(x: Double, y: Double)
    case touchUp(x: Double, y: Double)
    case delay(TimeInterval)
    case keyDown(UInt32)
    case keyUp(UInt32)
    case buttonDown(HardwareButton)
    case buttonUp(HardwareButton)
}

public enum HIDEventMapper {
    /// Default interpolation step, in device points. Matches idb `defaultSwipeDelta`.
    public static let defaultSwipeDelta: Double = 10.0

    public static func tap(x: Double, y: Double) -> [MappedHIDEvent] {
        [
            .touchDown(x: x, y: y),
            .touchUp(x: x, y: y),
        ]
    }

    public static func tap(x: Double, y: Double, hold: TimeInterval) -> [MappedHIDEvent] {
        [
            .touchDown(x: x, y: y),
            .delay(hold),
            .touchUp(x: x, y: y),
        ]
    }

    /// Swipe in device points, origin top-left. Interpolated like idb `SimulatorHIDEvent.swipe`.
    public static func swipe(
        x1: Double,
        y1: Double,
        x2: Double,
        y2: Double,
        duration: TimeInterval,
        delta: Double = defaultSwipeDelta
    ) -> [MappedHIDEvent] {
        let distance = hypot(x2 - x1, y2 - y1)
        let effectiveDelta = delta > 0 ? delta : defaultSwipeDelta
        let steps = max(1, Int(distance / effectiveDelta))
        let dx = (x2 - x1) / Double(steps)
        let dy = (y2 - y1) / Double(steps)
        let stepDelay = duration / Double(steps + 2)

        var events: [MappedHIDEvent] = []
        for i in 0...steps {
            events.append(.touchDown(x: x1 + dx * Double(i), y: y1 + dy * Double(i)))
            events.append(.delay(stepDelay))
        }
        // Extra touch-down at the end avoids inertial scroll on arm simulators (idb recipe).
        events.append(.touchDown(x: x2, y: y2))
        events.append(.delay(stepDelay))
        events.append(.touchUp(x: x2, y: y2))
        return events
    }

    public static func typeText(_ text: String) throws -> [MappedHIDEvent] {
        let strokes = try KeyboardMapper.strokes(for: text)
        var events: [MappedHIDEvent] = []
        events.reserveCapacity(strokes.count * 4)
        for stroke in strokes {
            if stroke.shift {
                events.append(.keyDown(KeyboardMapper.shiftKeyCode))
            }
            events.append(.keyDown(stroke.keyCode))
            events.append(.keyUp(stroke.keyCode))
            if stroke.shift {
                events.append(.keyUp(KeyboardMapper.shiftKeyCode))
            }
        }
        return events
    }

    public static func press(_ button: HardwareButton) -> [MappedHIDEvent] {
        [
            .buttonDown(button),
            .buttonUp(button),
        ]
    }
}
