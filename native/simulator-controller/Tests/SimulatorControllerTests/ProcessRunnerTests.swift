import CoreSimulator
import Darwin
import Foundation
import SimulatorController
import Testing

@Suite struct ProcessRunnerTests {
    @Test func repeatedSpawnsKeepWorkingAfterClosedDevNull() throws {
        let exclusive = try FileHandle(forReadingFrom: URL(fileURLWithPath: "/dev/null"))
        try exclusive.close()

        let runner = ProcessRunner()
        for _ in 0..<16 {
            let result = try runner.run(executable: "/bin/echo", arguments: ["rpc-stdio"])
            #expect(result.exitCode == 0)
            #expect(result.stdout.contains("rpc-stdio"))
        }

        #expect(fcntl(STDIN_FILENO, F_GETFD) != -1)
        #expect(fcntl(STDOUT_FILENO, F_GETFD) != -1)
        #expect(fcntl(STDERR_FILENO, F_GETFD) != -1)
    }

    @Test func childDoesNotInheritExtraDescriptors() throws {
        var fds: [Int32] = [0, 0]
        #expect(pipe(&fds) == 0)
        defer {
            Darwin.close(fds[0])
            Darwin.close(fds[1])
        }
        let token = Array("SECRET".utf8)
        _ = token.withUnsafeBytes { raw in
            Darwin.write(fds[1], raw.baseAddress, token.count)
        }

        let result = try ProcessRunner().run(
            executable: "/bin/bash",
            arguments: ["-c", "dd if=/dev/fd/\(fds[0]) bs=6 count=1 2>/dev/null || true"]
        )
        #expect(!result.stdout.contains("SECRET"))
        #expect(fcntl(STDIN_FILENO, F_GETFD) != -1)
        #expect(fcntl(STDOUT_FILENO, F_GETFD) != -1)
    }

    @Test func spawnAfterUnixSocketCycleDoesNotEBADF() throws {
        let path = "/tmp/ms-ebadf-\(UUID().uuidString.prefix(8)).sock"
        let listenFd = try UnixStreamSocket.listen(at: path)
        let client = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
        #expect(client >= 0)
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
        let connected = withUnsafePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockAddr in
                Darwin.connect(client, sockAddr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        #expect(connected == 0)
        let server = try UnixStreamSocket.accept(listenFd)
        UnixStreamSocket.closeListen(listenFd, path: path)
        Darwin.close(server)
        Darwin.close(client)

        let result = try ProcessRunner().run(executable: "/usr/bin/true")
        #expect(result.exitCode == 0)
        #expect(fcntl(STDIN_FILENO, F_GETFD) != -1)
        #expect(fcntl(STDOUT_FILENO, F_GETFD) != -1)
    }
}
