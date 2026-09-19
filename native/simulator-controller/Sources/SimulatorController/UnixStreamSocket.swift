import Darwin
import Foundation

/// AF_UNIX stream listener. Viewer / RPC attach here so H.264 never shares stdout with JSON-RPC.
public enum UnixStreamSocket {
    public static func listen(at path: String, backlog: Int32 = 1) throws -> Int32 {
        signal(SIGPIPE, SIG_IGN)
        let expanded = (path as NSString).expandingTildeInPath
        guard !expanded.isEmpty else {
            throw SimulatorError.invalidRequest("Unix socket path is empty.")
        }

        unlink(expanded)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else {
            throw SimulatorError.internalError("socket(AF_UNIX) failed: \(errnoString())")
        }
        _ = fcntl(fd, F_SETFD, FD_CLOEXEC)

        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)
        let maxPath = MemoryLayout.size(ofValue: addr.sun_path)
        let pathBytes = Array(expanded.utf8CString)
        guard pathBytes.count <= maxPath else {
            Darwin.close(fd)
            throw SimulatorError.invalidRequest("Unix socket path exceeds \(maxPath) bytes.")
        }
        withUnsafeMutablePointer(to: &addr.sun_path) { tuple in
            tuple.withMemoryRebound(to: CChar.self, capacity: maxPath) { dest in
                expanded.withCString { src in
                    _ = strncpy(dest, src, maxPath - 1)
                }
            }
        }
        addr.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)

        let bindResult = withUnsafePointer(to: &addr) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sockAddr in
                bind(fd, sockAddr, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bindResult == 0 else {
            Darwin.close(fd)
            throw SimulatorError.internalError("bind(\(expanded)) failed: \(errnoString())")
        }
        guard Darwin.listen(fd, backlog) == 0 else {
            Darwin.close(fd)
            unlink(expanded)
            throw SimulatorError.internalError("listen(\(expanded)) failed: \(errnoString())")
        }
        chmod(expanded, 0o600)
        return fd
    }

    public static func accept(_ listenFd: Int32) throws -> Int32 {
        let client = Darwin.accept(listenFd, nil, nil)
        guard client >= 0 else {
            throw SimulatorError.internalError("accept() failed: \(errnoString())")
        }
        _ = fcntl(client, F_SETFD, FD_CLOEXEC)
        return client
    }

    public static func closeListen(_ fd: Int32, path: String?) {
        Darwin.close(fd)
        if let path {
            unlink((path as NSString).expandingTildeInPath)
        }
    }

    private static func errnoString() -> String {
        String(cString: strerror(errno))
    }
}
