import Darwin
import Foundation

public struct ProcessResult: Sendable, Equatable {
    public var exitCode: Int32
    public var stdout: String
    public var stderr: String

    public init(exitCode: Int32, stdout: String, stderr: String) {
        self.exitCode = exitCode
        self.stdout = stdout
        self.stderr = stderr
    }

    public var succeeded: Bool { exitCode == 0 }

    public var combinedOutput: String {
        let out = stdout.trimmingCharacters(in: .whitespacesAndNewlines)
        let err = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
        if out.isEmpty { return err }
        if err.isEmpty { return out }
        return out + "\n" + err
    }
}

public struct ProcessRunner: Sendable {
    public init() {}

    public func run(
        executable: String,
        arguments: [String] = [],
        extraEnvironment: [String: String] = [:]
    ) throws -> ProcessResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments

        var environment = ProcessInfo.processInfo.environment
        for (key, value) in extraEnvironment {
            environment[key] = value
        }
        process.environment = environment

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        // Fresh /dev/null each spawn. FileHandle.nullDevice is a shared handle;
        // Foundation.Process closes it after the child exits, and the next
        // posix_spawn then fails with EBADF. Do not close parent stdin/stdout —
        // JSON-RPC and simctl both need those descriptors.
        let stdinNull = try FileHandle(forReadingFrom: URL(fileURLWithPath: "/dev/null"))
        process.standardInput = stdinNull

        Self.markExtraDescriptorsCloseOnExec()

        do {
            try process.run()
        } catch {
            try? stdinNull.close()
            throw ProcessRunnerError.couldNotLaunch(executable: executable, underlying: error.localizedDescription)
        }

        try? stdoutPipe.fileHandleForWriting.close()
        try? stderrPipe.fileHandleForWriting.close()

        process.waitUntilExit()

        let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        try? stdoutPipe.fileHandleForReading.close()
        try? stderrPipe.fileHandleForReading.close()
        try? stdinNull.close()

        return ProcessResult(
            exitCode: process.terminationStatus,
            stdout: String(data: stdoutData, encoding: .utf8) ?? "",
            stderr: String(data: stderrData, encoding: .utf8) ?? ""
        )
    }

    /// Child must not inherit the H.264 Unix socket or leftover pipes.
    /// Never touch fds 0/1/2 — those belong to RPC stdio.
    static func markExtraDescriptorsCloseOnExec() {
        let limit = getdtablesize()
        var fd: Int32 = 3
        while fd < limit {
            let flags = fcntl(fd, F_GETFD)
            if flags != -1 {
                _ = fcntl(fd, F_SETFD, flags | FD_CLOEXEC)
            }
            fd += 1
        }
    }
}

public enum ProcessRunnerError: Error, Sendable, LocalizedError {
    case couldNotLaunch(executable: String, underlying: String)

    public var errorDescription: String? {
        switch self {
        case let .couldNotLaunch(executable, underlying):
            return "Could not launch \(executable): \(underlying)"
        }
    }
}
