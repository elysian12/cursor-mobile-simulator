import Darwin
import Foundation
import SimulatorController
import Testing

struct UnixStreamSocketTests {
    @Test func listenAcceptWriteRoundTrip() throws {
        let path = "/tmp/ms-\(UUID().uuidString.prefix(8)).sock"
        let listenFd = try UnixStreamSocket.listen(at: path)
        defer { UnixStreamSocket.closeListen(listenFd, path: path) }

        let payload = Data("annex-b".utf8)
        let group = DispatchGroup()
        group.enter()
        let received = ReceivedCount()
        DispatchQueue.global().async {
            let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
            var addr = sockaddr_un()
            addr.sun_family = sa_family_t(AF_UNIX)
            path.withCString { src in
                withUnsafeMutablePointer(to: &addr.sun_path) { tuple in
                    tuple.withMemoryRebound(to: CChar.self, capacity: 104) { dest in
                        _ = strncpy(dest, src, 103)
                    }
                }
            }
            addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
            _ = withUnsafePointer(to: &addr) { pointer in
                pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockAddr in
                    Darwin.connect(fd, sockAddr, socklen_t(MemoryLayout<sockaddr_un>.size))
                }
            }
            var buffer = [UInt8](repeating: 0, count: 32)
            received.value = Darwin.read(fd, &buffer, buffer.count)
            Darwin.close(fd)
            group.leave()
        }

        let server = try UnixStreamSocket.accept(listenFd)
        let written = payload.withUnsafeBytes { Darwin.write(server, $0.baseAddress, payload.count) }
        #expect(written == payload.count)
        Darwin.close(server)
        #expect(group.wait(timeout: .now() + 2) == .success)
        #expect(received.value == payload.count)
    }
}

private final class ReceivedCount: @unchecked Sendable {
    var value = 0
}

struct AgentActionLogTests {
    @Test func recordWritesJSONSidecar() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("mobile-sim-action-\(UUID().uuidString).json")
        AgentActionLog.record(
            udid: "939B604A-4B42-4B0C-B164-CAFAB320C123",
            action: "tap",
            payload: ["x": 10, "y": 20],
            fileURL: url
        )
        let data = try Data(contentsOf: url)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(object?["action"] as? String == "tap")
        #expect(object?["udid"] as? String == "939B604A-4B42-4B0C-B164-CAFAB320C123")
        try? FileManager.default.removeItem(at: url)
    }
}
