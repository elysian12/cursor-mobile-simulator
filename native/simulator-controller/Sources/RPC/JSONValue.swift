import Foundation

public enum JSONValue: Sendable, Equatable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
}

extension JSONValue: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Int.self) {
            self = .number(Double(value))
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .object(value):
            try container.encode(value)
        case let .array(value):
            try container.encode(value)
        case let .string(value):
            try container.encode(value)
        case let .number(value):
            if value.rounded() == value, let int = Int(exactly: value) {
                try container.encode(int)
            } else {
                try container.encode(value)
            }
        case let .bool(value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

public extension JSONValue {
    var object: [String: JSONValue]? {
        if case let .object(value) = self { return value }
        return nil
    }

    func string(_ key: String) -> String? {
        guard let value = object?[key] else { return nil }
        if case let .string(text) = value { return text }
        return nil
    }

    func number(_ key: String) -> Double? {
        guard let value = object?[key] else { return nil }
        switch value {
        case let .number(number):
            return number
        case let .string(text):
            return Double(text)
        default:
            return nil
        }
    }

    func bool(_ key: String) -> Bool? {
        guard let value = object?[key] else { return nil }
        if case let .bool(flag) = value { return flag }
        return nil
    }

    func firstString(keys: [String]) -> String? {
        for key in keys {
            if let value = string(key), !value.isEmpty {
                return value
            }
        }
        return nil
    }
}
