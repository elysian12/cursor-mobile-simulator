import Foundation
import SimulatorController

public enum RPCID: Sendable, Equatable {
    case string(String)
    case number(Double)
}

extension RPCID: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Int.self) {
            self = .number(Double(value))
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "RPC id must be string or number")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value):
            try container.encode(value)
        case let .number(value):
            if value.rounded() == value, let int = Int(exactly: value) {
                try container.encode(int)
            } else {
                try container.encode(value)
            }
        }
    }
}

/// Mirrors `packages/protocol` `RPCRequest`.
public struct RPCRequest: Sendable, Codable {
    public var jsonrpc: String?
    public var id: RPCID?
    public var method: String
    public var params: JSONValue?

    public init(jsonrpc: String? = "2.0", id: RPCID? = nil, method: String, params: JSONValue? = nil) {
        self.jsonrpc = jsonrpc
        self.id = id
        self.method = method
        self.params = params
    }
}

public struct RPCResponse: Sendable, Encodable {
    public var jsonrpc: String
    public var id: RPCID?
    public var result: JSONValue?
    public var error: WireError?

    public init(jsonrpc: String = "2.0", id: RPCID?, result: JSONValue?, error: WireError?) {
        self.jsonrpc = jsonrpc
        self.id = id
        self.result = result
        self.error = error
    }

    public static func success(id: RPCID?, result: JSONValue) -> RPCResponse {
        RPCResponse(id: id, result: result, error: nil)
    }

    public static func failure(id: RPCID?, error: SimulatorError) -> RPCResponse {
        RPCResponse(id: id, result: nil, error: WireError(error))
    }

    private enum CodingKeys: String, CodingKey {
        case jsonrpc, id, result, error
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(jsonrpc, forKey: .jsonrpc)
        if let id {
            try container.encode(id, forKey: .id)
        } else {
            try container.encodeNil(forKey: .id)
        }
        if let error {
            try container.encode(error, forKey: .error)
        } else {
            try container.encode(result ?? .object([:]), forKey: .result)
        }
    }
}

public enum RPCCodec {
    public static func decodeRequest(_ data: Data) throws -> RPCRequest {
        try JSONDecoder().decode(RPCRequest.self, from: data)
    }

    public static func encodeResponse(_ response: RPCResponse) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        var data = try encoder.encode(response)
        if !data.hasSuffix(UInt8(ascii: "\n")) {
            data.append(UInt8(ascii: "\n"))
        }
        return data
    }
}

private extension Data {
    func hasSuffix(_ byte: UInt8) -> Bool {
        last == byte
    }
}
