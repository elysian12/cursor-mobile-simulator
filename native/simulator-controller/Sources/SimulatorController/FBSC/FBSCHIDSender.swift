#if MOBILE_SIM_HAS_FBSC
import Darwin
import FBControlCore
import FBSimulatorControl
import Foundation
import Input

/// In-process facebook/idb HID. Does not wrap the Python CLI or idb_companion.
final class FBSCHIDSender: HIDSending, @unchecked Sendable {
    private let lock = NSLock()
    private var bootstrap: SimulatorControlBootstrap?
    private var sessions: [String: SimulatorHID] = [:]

    public init() {}

    public var isAvailable: Bool { true }
    public var backendName: String { "FBSimulatorControl" }

    public func attach(udid: String) async throws -> HIDAttachInfo {
        let simulator = try resolve(udid: udid)
        _ = try await session(udid: udid, simulator: simulator)
        return attachInfo(from: simulator)
    }

    public func send(udid: String, events: [MappedHIDEvent]) async throws -> HIDAttachInfo {
        let simulator = try resolve(udid: udid)
        let hid: SimulatorHID
        do {
            hid = try await session(udid: udid, simulator: simulator)
        } catch {
            throw InputError.notAttached(
                "simulator.hid",
                message: """
                HID attach failed for \(udid): \(error.localizedDescription)

                On Xcode 27, dtuhidd is required for keyboard and is preferred for touch. \
                Close DeviceHub.app (exclusive framebuffer / display races) and boot headless. \
                Do not treat this as a successful tap.
                """
            )
        }
        do {
            let event = try Self.composite(events)
            try await hid.send(event: event, logger: simulator.logger)
        } catch let error as InputError {
            await evict(udid: udid)
            throw error
        } catch {
            await evict(udid: udid)
            throw InputError.sendFailed(
                "HID send failed for \(udid): \(error.localizedDescription). Event was not delivered."
            )
        }
        return attachInfo(from: simulator)
    }

    private func session(udid: String, simulator: Simulator) async throws -> SimulatorHID {
        if let existing = cached(udid) {
            return existing
        }
        let hid = try await SimulatorHID(for: simulator)
        let kept = store(udid, hid)
        if kept !== hid {
            await hid.close()
        }
        return kept
    }

    private func evict(udid: String) async {
        if let hid = take(udid) {
            await hid.close()
        }
    }

    private func cached(_ udid: String) -> SimulatorHID? {
        lock.lock()
        defer { lock.unlock() }
        return sessions[udid]
    }

    private func store(_ udid: String, _ hid: SimulatorHID) -> SimulatorHID {
        lock.lock()
        defer { lock.unlock() }
        if let existing = sessions[udid] {
            return existing
        }
        sessions[udid] = hid
        return hid
    }

    private func take(_ udid: String) -> SimulatorHID? {
        lock.lock()
        defer { lock.unlock() }
        return sessions.removeValue(forKey: udid)
    }

    private func resolve(udid: String) throws -> Simulator {
        let set = try deviceSet()
        guard let simulator = set.simulator(withUDID: udid) else {
            throw InputError.notAttached(
                "simulator.hid",
                message: "FBSimulatorControl has no simulator \(udid) in the default device set."
            )
        }
        return simulator
    }

    private func deviceSet() throws -> SimulatorSet {
        lock.lock()
        defer { lock.unlock() }
        if let bootstrap {
            return bootstrap.set
        }
        do {
            let configuration = SimulatorControlConfiguration(deviceSetPath: nil, logger: nil)
            let created = try SimulatorControlBootstrap.withConfiguration(configuration)
            bootstrap = created
            return created.set
        } catch {
            throw InputError.notAttached(
                "simulator.hid",
                message: """
                Could not bootstrap FBSimulatorControl: \(error.localizedDescription). \
                Private CoreSimulator frameworks must load (do not enable Library Validation).
                """
            )
        }
    }

    private func attachInfo(from simulator: Simulator) -> HIDAttachInfo {
        let screen = simulator.screenInfo
        let scale = Double(screen?.scale ?? 0)
        let widthPixels = Double(screen?.widthPixels ?? 0)
        let heightPixels = Double(screen?.heightPixels ?? 0)
        let widthPoints = scale > 0 ? widthPixels / scale : nil
        let heightPoints = scale > 0 ? heightPixels / scale : nil
        return HIDAttachInfo(
            transport: "FBSimulatorControl/SimulatorHID",
            screenWidthPoints: widthPoints,
            screenHeightPoints: heightPoints,
            scale: scale > 0 ? scale : nil
        )
    }

    static func composite(_ events: [MappedHIDEvent]) throws -> SimulatorHIDEvent {
        SimulatorHIDEvent.composite(try events.map(toFBSC))
    }

    static func toFBSC(_ event: MappedHIDEvent) throws -> SimulatorHIDEvent {
        switch event {
        case let .touchDown(x, y):
            return .touch(direction: .down, x: x, y: y)
        case let .touchUp(x, y):
            return .touch(direction: .up, x: x, y: y)
        case let .delay(duration):
            return .delay(duration)
        case let .keyDown(code):
            return .keyboard(direction: .down, keyCode: code)
        case let .keyUp(code):
            return .keyboard(direction: .up, keyCode: code)
        case let .buttonDown(button):
            return .button(direction: .down, button: fbButton(button))
        case let .buttonUp(button):
            return .button(direction: .up, button: fbButton(button))
        }
    }

    static func fbButton(_ button: HardwareButton) -> SimulatorHIDButton {
        switch button {
        case .home: return .homeButton
        case .lock: return .lock
        case .volumeUp: return .volumeUp
        case .volumeDown: return .volumeDown
        case .sideButton: return .sideButton
        }
    }
}

enum FBSCStream {
    private static let retain = StreamRetain()

    static func start(udid: String, socketPath: String?) async throws -> StreamSession {
        let configuration = SimulatorControlConfiguration(deviceSetPath: nil, logger: nil)
        let bootstrap = try SimulatorControlBootstrap.withConfiguration(configuration)
        guard let simulator = bootstrap.set.simulator(withUDID: udid) else {
            throw SimulatorError.deviceNotFound(udid)
        }

        let format = VideoStreamFormat.compressedVideo(withCodec: .h264, transport: .annexB)
        // Viewer pane is ~2× logical points. Full 3× (1206×2622) is wasted encode.
        let streamConfig = VideoStreamConfiguration(
            format: format,
            framesPerSecond: 15,
            rateControl: .automatic,
            scaleFactor: 2.0 / 3.0,
            keyFrameRate: 4
        )

        // Bind the Unix socket *before* framebuffer attach so the viewer can
        // connect while IOSurface is still coming up. Never write Annex-B to
        // stdout when a socket is requested — stdout is JSON-RPC for MCP/viewer.
        var listenFd: Int32?
        if let socketPath, !socketPath.isEmpty {
            listenFd = try UnixStreamSocket.listen(at: socketPath)
        }

        let framebuffer: Framebuffer
        do {
            framebuffer = try await simulator.lifecycle.connectToFramebuffer()
        } catch {
            if let listenFd {
                UnixStreamSocket.closeListen(listenFd, path: socketPath)
            }
            throw SimulatorError.notAttached(
                """
                Could not attach SimulatorVideoStream / IOSurface for \(udid): \(error.localizedDescription)

                DeviceHub can hold the exclusive framebuffer on Xcode 27. Close DeviceHub.app \
                and boot headless. Still screenshots via simctl remain available. \
                This is not a screenshot-poll live stream.
                """
            )
        }

        // `SimulatorVideoStream.start` awaits the first IOSurface. DeviceHub can
        // withhold that forever, so we must not await it on the CLI/RPC path.
        // Frames that do arrive are H.264 Annex-B — never a screenshot poll.
        let dest: String
        let logger = simulator.logger
        if let socketPath, !socketPath.isEmpty, let listenFd {
            dest = socketPath
            retain.add(
                Task.detached {
                    do {
                        let client = try UnixStreamSocket.accept(listenFd)
                        Darwin.close(listenFd)
                        // Never let the stream occupy stdin/stdout/stderr.
                        // posix_spawn of xcrun needs those fds intact for the RPC process.
                        if client < 3 {
                            Darwin.close(client)
                            throw SimulatorError.internalError(
                                "stream socket reused a stdio descriptor; refusing to close it."
                            )
                        }
                        let consumer = FileWriter.syncWriter(
                            withFileDescriptor: client,
                            closeOnEndOfFile: true
                        )
                        let stream = try await SimulatorVideoStream.start(
                            framebuffer: framebuffer,
                            configuration: streamConfig,
                            to: consumer,
                            logger: logger
                        )
                        FBSCStream.retain.add(stream)
                    } catch {
                        UnixStreamSocket.closeListen(listenFd, path: socketPath)
                        FileHandle.standardError.write(
                            Data(
                                """
                                NOT_ATTACHED: SimulatorVideoStream H.264 Annex-B failed: \
                                \(error.localizedDescription). Close DeviceHub if it owns the IOSurface. \
                                Screenshot still works. No screenshot polling.

                                """.utf8
                            )
                        )
                    }
                }
            )
        } else {
            dest = "stdout"
            let consumer = FileWriter.syncWriter(withFileDescriptor: STDOUT_FILENO, closeOnEndOfFile: false)
            retain.add(
                Task.detached {
                    do {
                        let stream = try await SimulatorVideoStream.start(
                            framebuffer: framebuffer,
                            configuration: streamConfig,
                            to: consumer,
                            logger: logger
                        )
                        FBSCStream.retain.add(stream)
                    } catch {
                        FileHandle.standardError.write(
                            Data(
                                """
                                NOT_ATTACHED: SimulatorVideoStream H.264 Annex-B failed: \
                                \(error.localizedDescription). Close DeviceHub if it owns the IOSurface. \
                                Screenshot still works. No screenshot polling.

                                """.utf8
                            )
                        )
                    }
                }
            )
        }

        return StreamSession(
            udid: udid,
            transport: socketPath?.isEmpty == false ? "unix" : "stdout",
            format: "h264_annexb",
            socketPath: socketPath,
            note: """
            Started H.264 Annex-B toward \(dest). Frames arrive only if the IOSurface is free. \
            DeviceHub can yield zero frames — use on-demand screenshot, do not poll. Interrupt to stop.
            """
        )
    }
}

private final class StreamRetain: @unchecked Sendable {
    private var streams: [Any] = []
    func add(_ stream: Any) { streams.append(stream) }
}
#endif
