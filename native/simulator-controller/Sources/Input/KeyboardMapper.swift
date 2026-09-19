import Foundation

/// USB HID Keyboard/Keypad page (0x07) usages for a US QWERTY layout.
/// Matches the keycodes SimulatorHID / DTUHID expect — not Unicode code points.
public enum KeyboardMapper: Sendable {
    public struct KeyStroke: Sendable, Equatable {
        public var keyCode: UInt32
        public var shift: Bool

        public init(keyCode: UInt32, shift: Bool = false) {
            self.keyCode = keyCode
            self.shift = shift
        }
    }

    public static let shiftKeyCode: UInt32 = 0xE1 // Left Shift

    public static func strokes(for text: String) throws -> [KeyStroke] {
        var result: [KeyStroke] = []
        result.reserveCapacity(text.count)
        for scalar in text.unicodeScalars {
            guard let stroke = stroke(for: scalar) else {
                throw InputError.sendFailed(
                    "Cannot map character \(String(describing: scalar)) (U+\(String(scalar.value, radix: 16))) to a USB HID keycode. Use ASCII / US-keyboard text."
                )
            }
            result.append(stroke)
        }
        return result
    }

    public static func stroke(for scalar: Unicode.Scalar) -> KeyStroke? {
        let value = scalar.value
        if value == 0x0A || value == 0x0D { return KeyStroke(keyCode: 0x28) } // Return
        if value == 0x09 { return KeyStroke(keyCode: 0x2B) } // Tab
        if value == 0x08 || value == 0x7F { return KeyStroke(keyCode: 0x2A) } // Backspace / DEL
        if value == 0x1B { return KeyStroke(keyCode: 0x29) } // Escape

        if (0x61...0x7A).contains(value) { // a-z
            return KeyStroke(keyCode: 0x04 + (value - 0x61))
        }
        if (0x41...0x5A).contains(value) { // A-Z
            return KeyStroke(keyCode: 0x04 + (value - 0x41), shift: true)
        }
        if (0x31...0x39).contains(value) { // 1-9
            return KeyStroke(keyCode: 0x1E + (value - 0x31))
        }
        if value == 0x30 { return KeyStroke(keyCode: 0x27) } // 0

        switch scalar {
        case " ": return KeyStroke(keyCode: 0x2C)
        case "!": return KeyStroke(keyCode: 0x1E, shift: true)
        case "@": return KeyStroke(keyCode: 0x1F, shift: true)
        case "#": return KeyStroke(keyCode: 0x20, shift: true)
        case "$": return KeyStroke(keyCode: 0x21, shift: true)
        case "%": return KeyStroke(keyCode: 0x22, shift: true)
        case "^": return KeyStroke(keyCode: 0x23, shift: true)
        case "&": return KeyStroke(keyCode: 0x24, shift: true)
        case "*": return KeyStroke(keyCode: 0x25, shift: true)
        case "(": return KeyStroke(keyCode: 0x26, shift: true)
        case ")": return KeyStroke(keyCode: 0x27, shift: true)
        case "-": return KeyStroke(keyCode: 0x2D)
        case "_": return KeyStroke(keyCode: 0x2D, shift: true)
        case "=": return KeyStroke(keyCode: 0x2E)
        case "+": return KeyStroke(keyCode: 0x2E, shift: true)
        case "[": return KeyStroke(keyCode: 0x2F)
        case "{": return KeyStroke(keyCode: 0x2F, shift: true)
        case "]": return KeyStroke(keyCode: 0x30)
        case "}": return KeyStroke(keyCode: 0x30, shift: true)
        case "\\": return KeyStroke(keyCode: 0x31)
        case "|": return KeyStroke(keyCode: 0x31, shift: true)
        case ";": return KeyStroke(keyCode: 0x33)
        case ":": return KeyStroke(keyCode: 0x33, shift: true)
        case "'": return KeyStroke(keyCode: 0x34)
        case "\"": return KeyStroke(keyCode: 0x34, shift: true)
        case "`": return KeyStroke(keyCode: 0x35)
        case "~": return KeyStroke(keyCode: 0x35, shift: true)
        case ",": return KeyStroke(keyCode: 0x36)
        case "<": return KeyStroke(keyCode: 0x36, shift: true)
        case ".": return KeyStroke(keyCode: 0x37)
        case ">": return KeyStroke(keyCode: 0x37, shift: true)
        case "/": return KeyStroke(keyCode: 0x38)
        case "?": return KeyStroke(keyCode: 0x38, shift: true)
        default: return nil
        }
    }
}
