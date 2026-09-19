import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { readFile, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  ErrorCode,
  Methods,
  encodeMediaFrame,
  type MediaFrameHeader,
  type SimulatorDevice,
  type SimulatorListResult,
  type SimulatorScreenshotResult,
  type SimulatorStreamResult,
  type SimulatorHostResult,
  type Session,
  type AgentActionMessage,
  type StreamStatusMessage,
  type HostStatusMessage,
  type WSServerMessage,
} from "@mobile-simulator/protocol";
import { asProtocolError, GRANT_HINT, ProtocolRpcError } from "./errors.js";
import { createAnnexBJpegTranscoder, type JpegTranscoder } from "./h264-jpeg.js";
import { isNearBlackLuma } from "./jpeg-luma.js";
import { viewerJpegSize } from "./live-size.js";
import { clampWatchInterval, pngSize } from "./png.js";
import type { RpcClient } from "./rpc-client.js";
import { deviceParams, requireUdid } from "./udid.js";

export type BinarySink = (bytes: Uint8Array) => void;
export type JsonSink = (message: WSServerMessage) => void;

export interface ViewerRelay {
  list(available?: boolean, platform?: "ios" | "all"): Promise<SimulatorDevice[]>;
  attach(deviceId: string): Promise<void>;
  detach(): void;
  refresh(): Promise<void>;
  setWatch(enabled: boolean, intervalMs?: number): void;
  boot(): Promise<void>;
  tap(x: number, y: number): Promise<void>;
  swipe(x1: number, y1: number, x2: number, y2: number, duration?: number): Promise<void>;
  home(): Promise<void>;
  showHost(): Promise<void>;
  snapshot(): Session | undefined;
  close(): Promise<void>;
}

const LAST_ACTION_PATH = join(homedir(), ".mobile-simulator", "last-action.json");

export function createRelay(rpc: RpcClient, json: JsonSink, binary: BinarySink): ViewerRelay {
  let session: Session | undefined;
  let device: SimulatorDevice | undefined;
  let streamMode: StreamStatusMessage["mode"] = "disconnected";
  let liveSocket: Socket | undefined;
  let jpegTranscoder: JpegTranscoder | undefined;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let actionTimer: ReturnType<typeof setInterval> | undefined;
  let lastActionAt: string | undefined;
  let watchEnabled = false;
  let watchIntervalMs = 2000;
  let snapshotInFlight = false;
  let listInFlight: Promise<SimulatorDevice[]> | undefined;
  let blackLiveStreak = 0;
  let blackFallbackArmed = false;
  const BLACK_LIVE_STREAK = 4;
  let liveFrameCount = 0;
  let liveByteTotal = 0;
  let liveWindowStarted = 0;
  let lastLiveFrameAt = 0;

  function emitStream(partial: Omit<StreamStatusMessage, "type">): void {
    streamMode = partial.mode;
    const message: StreamStatusMessage = {
      type: "stream_status",
      mode: partial.mode,
      connected: partial.connected,
    };
    if (partial.codec !== undefined) {
      message.codec = partial.codec;
    }
    if (partial.note !== undefined) {
      message.note = partial.note;
    }
    json(message);
  }

  function emitHostStatus(result: SimulatorHostResult): void {
    const message: HostStatusMessage = {
      type: "host_status",
      action: result.action,
      hidden: result.hidden,
      note: result.note,
    };
    if (result.app) {
      message.app = result.app;
    }
    json(message);
  }

  async function tryHideHost(): Promise<SimulatorHostResult> {
    try {
      const result = await rpc.call<SimulatorHostResult>(Methods.simulatorHideHost, {});
      return {
        action: result.action ?? "none",
        hidden: result.hidden !== false,
        note: result.note ?? "Apple host UI updated.",
        ...(result.app ? { app: result.app } : {}),
        ...(result.bundleId ? { bundleId: result.bundleId } : {}),
      };
    } catch (error) {
      const proto = asProtocolError(error);
      return {
        action: "none",
        hidden: false,
        note: `Could not hide Apple host UI (${proto.code}). Attach still works.`,
      };
    }
  }

  function emitError(error: unknown): void {
    const proto = asProtocolError(error);
    const grantHint = proto.code === ErrorCode.PERMISSION_DENIED;
    json({
      type: "error",
      code: proto.code,
      message: grantHint ? `${proto.message}\n\n${GRANT_HINT}` : proto.message,
      ...(grantHint ? { grantHint: true } : {}),
    });
  }

  function requireSession(): { session: Session; device: SimulatorDevice } {
    if (!session || !device) {
      throw new ProtocolRpcError({
        code: ErrorCode.NOT_ATTACHED,
        message: "Attach an explicit UDID first.",
      });
    }
    return { session, device };
  }

  async function listDevices(available = true, platform: "ios" | "all" = "ios"): Promise<SimulatorDevice[]> {
    const result = await rpc.call<SimulatorListResult>(Methods.simulatorList, { available, platform });
    return result.devices ?? [];
  }

  async function resolveDevice(udid: string): Promise<SimulatorDevice> {
    const devices = await listDevices(false, "all");
    const found = devices.find((item) => item.udid.toLowerCase() === udid.toLowerCase());
    if (!found) {
      throw new ProtocolRpcError({
        code: ErrorCode.DEVICE_NOT_FOUND,
        message: `No simulator with UDID ${udid}.`,
        data: { udid },
      });
    }
    return found;
  }

  function stopLive(): void {
    jpegTranscoder?.close();
    jpegTranscoder = undefined;
    if (liveSocket) {
      liveSocket.removeAllListeners();
      liveSocket.destroy();
      liveSocket = undefined;
    }
  }

  function stopWatch(): void {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = undefined;
    }
  }

  function stopActionWatch(): void {
    if (actionTimer) {
      clearInterval(actionTimer);
      actionTimer = undefined;
    }
  }

  function startActionWatch(): void {
    stopActionWatch();
    lastActionAt = undefined;
    void peekLastAction(true);
    actionTimer = setInterval(() => {
      void peekLastAction(false);
    }, 400);
  }

  async function peekLastAction(primeOnly: boolean): Promise<void> {
    if (!session || !device) {
      return;
    }
    try {
      const raw = await readFile(LAST_ACTION_PATH, "utf8");
      const parsed = JSON.parse(raw) as {
        udid?: string;
        action?: string;
        at?: string;
        payload?: Record<string, unknown>;
      };
      if (typeof parsed.at !== "string" || typeof parsed.action !== "string") {
        return;
      }
      if (primeOnly) {
        lastActionAt = parsed.at;
        return;
      }
      if (parsed.at === lastActionAt) {
        return;
      }
      lastActionAt = parsed.at;
      if (typeof parsed.udid === "string" && parsed.udid.toLowerCase() !== device.udid.toLowerCase()) {
        return;
      }
      const allowed: AgentActionMessage["action"][] = [
        "tap",
        "swipe",
        "type",
        "press",
        "home",
        "launch",
        "install",
        "terminate",
        "uninstall",
        "screenshot",
        "boot",
        "shutdown",
      ];
      if (!allowed.includes(parsed.action as AgentActionMessage["action"])) {
        return;
      }
      json({
        type: "agent_action",
        sessionId: session.id,
        action: parsed.action as AgentActionMessage["action"],
        payload: parsed.payload ?? { deviceId: parsed.udid },
      });
    } catch {
      // sidecar is optional
    }
  }

  function startWatchIfNeeded(): void {
    stopWatch();
    if (!watchEnabled || !session || streamMode === "live") {
      return;
    }
    watchTimer = setInterval(() => {
      void captureSnapshot().catch((error) => emitError(error));
    }, watchIntervalMs);
  }

  function sendMedia(
    deviceId: string,
    payload: Uint8Array,
    header: MediaFrameHeader,
  ): void {
    const frame = encodeMediaFrame(header, payload);
    json({
      type: "frame_meta",
      deviceId,
      format: header.format,
      timestamp: header.timestampMs,
      source: header.source,
      byteLength: payload.byteLength,
      ...(header.width && header.height ? { width: header.width, height: header.height } : {}),
    });
    binary(frame);
  }

  function sendStill(deviceId: string, png: Uint8Array, source: MediaFrameHeader["source"]): void {
    const size = pngSize(png);
    sendMedia(deviceId, png, {
      format: "png",
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      timestampMs: Date.now(),
      source,
    });
  }

  async function captureSnapshot(): Promise<void> {
    const attached = requireSession();
    if (snapshotInFlight) {
      return;
    }
    snapshotInFlight = true;
    const path = join(tmpdir(), `mobile-sim-view-${attached.device.udid}-${Date.now()}.png`);
    try {
      const result = await rpc.call<SimulatorScreenshotResult>(Methods.simulatorScreenshot, {
        ...deviceParams(attached.device.udid),
        path,
      });
      const written = result.path || path;
      const bytes = await readFile(written);
      sendStill(attached.device.udid, bytes, "snapshot");
      if (streamMode !== "live") {
        emitStream({
          mode: "snapshot",
          connected: false,
          codec: "png",
          note: "On-demand simctl screenshot. Not a live stream.",
        });
      }
      json({
        type: "agent_action",
        sessionId: attached.session.id,
        action: "screenshot",
        payload: { deviceId: attached.device.udid, path: written },
      });
      try {
        await unlink(written);
      } catch {
        // temp file cleanup is best-effort
      }
    } finally {
      snapshotInFlight = false;
    }
  }

  async function tryLiveStream(udid: string): Promise<boolean> {
    stopLive();
    // Darwin AF_UNIX sun_path is 104 bytes. Node's tmpdir() is often already ~60.
    const socketPath = `/tmp/msf-${udid.slice(0, 8)}-${Date.now().toString(36)}.sock`;
    const connecting = connectUnixRetry(socketPath, 8_000);
    try {
      const result = await rpc.call<SimulatorStreamResult>(Methods.simulatorStream, {
        ...deviceParams(udid),
        socket: socketPath,
      });
      const sock = await connecting;
      liveSocket = sock;
      let liveEmitted = false;
      blackLiveStreak = 0;
      blackFallbackArmed = false;
      const jpegSize = viewerJpegSize(device?.screen);
      const pixelSize = (): { width: number; height: number } => jpegSize;
      const emitPaintedLive = (codec: NonNullable<StreamStatusMessage["codec"]>, note: string): void => {
        if (liveEmitted) {
          return;
        }
        liveEmitted = true;
        emitStream({
          mode: "live",
          connected: true,
          codec,
          note,
        });
        stopWatch();
      };
      const sendJpeg = (jpeg: Uint8Array, luma?: number): void => {
        if (luma !== undefined && isNearBlackLuma(luma)) {
          blackLiveStreak += 1;
          if (blackLiveStreak >= BLACK_LIVE_STREAK && !blackFallbackArmed) {
            blackFallbackArmed = true;
            emitStream({
              mode: "snapshot",
              connected: false,
              codec: "png",
              note: "Live H.264 decoded to a near-black framebuffer (DeviceHub likely owns the IOSurface). Showing a simctl snapshot instead — this is not Live.",
            });
            void captureSnapshot().catch((error) => emitError(error));
            startWatchIfNeeded();
          }
          return;
        }
        blackLiveStreak = 0;
        if (blackFallbackArmed) {
          blackFallbackArmed = false;
        }
        jpegTranscoder?.stopProbe();
        const size = pixelSize();
        emitPaintedLive("jpeg", "Live JPEG decoded from H.264 Annex-B. Not a screenshot poll.");
        const now = Date.now();
        if (!liveWindowStarted) {
          liveWindowStarted = now;
        }
        liveFrameCount += 1;
        liveByteTotal += jpeg.byteLength;
        const interval = lastLiveFrameAt ? now - lastLiveFrameAt : 0;
        lastLiveFrameAt = now;
        if (liveFrameCount === 1 || liveFrameCount % 15 === 0) {
          const elapsed = Math.max(1, now - liveWindowStarted);
          const fps = (liveFrameCount * 1000) / elapsed;
          const avg = Math.round(liveByteTotal / liveFrameCount);
          process.stderr.write(
            `[viewer] live jpeg frames=${liveFrameCount} last=${jpeg.byteLength}B avg=${avg}B interval=${interval}ms ~${fps.toFixed(1)}fps ${size.width}×${size.height}\n`,
          );
        }
        sendMedia(udid, jpeg, {
          format: "jpeg",
          width: size.width,
          height: size.height,
          timestampMs: now,
          source: "stream",
        });
      };
      jpegTranscoder?.close();
      liveFrameCount = 0;
      liveByteTotal = 0;
      liveWindowStarted = 0;
      lastLiveFrameAt = 0;
      jpegTranscoder = createAnnexBJpegTranscoder(
        ({ jpeg, luma }) => sendJpeg(jpeg, luma),
        (error) => {
          process.stderr.write(`[viewer] H.264→JPEG transcode failed: ${error.message}\n`);
          jpegTranscoder?.close();
          jpegTranscoder = undefined;
        },
        { width: jpegSize.width, height: jpegSize.height },
      );
      sock.on("data", (chunk: Buffer) => {
        if (jpegTranscoder) {
          jpegTranscoder.push(chunk);
          return;
        }
        // No transcoder: forward Annex-B. Live waits until the browser paints a frame.
        const size = pixelSize();
        sendMedia(udid, new Uint8Array(chunk), {
          format: "h264_annexb",
          width: size.width,
          height: size.height,
          timestampMs: Date.now(),
          source: "stream",
        });
      });
      sock.on("close", () => {
        jpegTranscoder?.close();
        jpegTranscoder = undefined;
        if (liveSocket === sock) {
          liveSocket = undefined;
          if (session) {
            emitStream({
              mode: "snapshot",
              connected: false,
              note: "Live H.264 socket closed. Snapshot / Refresh still available.",
            });
            startWatchIfNeeded();
          }
        }
      });
      sock.on("error", () => {
        sock.destroy();
      });
      // Socket is attached. Live is reserved for a painted JPEG / decoded frame.
      emitStream({
        mode: "snapshot",
        connected: false,
        codec: jpegTranscoder ? "jpeg" : "h264_annexb",
        note: jpegTranscoder
          ? `Unix stream attached (${result.transport}). Live waits for the first decoded JPEG — not screenshot polling.`
          : `Unix stream attached (${result.transport}). H.264 is forwarded; Live waits until a frame is painted.`,
      });
      return true;
    } catch (error) {
      connecting.then((sock) => sock.destroy()).catch(() => undefined);
      const proto = asProtocolError(error);
      emitStream({
        mode: "snapshot",
        connected: false,
        codec: "png",
        note:
          proto.code === ErrorCode.NOT_ATTACHED || proto.code === ErrorCode.NOT_IMPLEMENTED
            ? "No live H.264 stream (FBSimulatorControl / SimulatorVideoStream not attached). Use Refresh for snapshots — this is not Live."
            : `Live stream unavailable (${proto.code}). Use Refresh for snapshots.`,
      });
      return false;
    }
  }

  return {
    async list(available = true, platform: "ios" | "all" = "ios"): Promise<SimulatorDevice[]> {
      if (listInFlight) {
        return listInFlight;
      }
      listInFlight = (async () => {
        try {
          const devices = await listDevices(available, platform);
          json({ type: "device_list", devices });
          return devices;
        } catch (error) {
          emitError(error);
          throw error;
        } finally {
          listInFlight = undefined;
        }
      })();
      return listInFlight;
    },

    async attach(deviceId: string): Promise<void> {
      const udid = requireUdid(deviceId);
      try {
        const found = await resolveDevice(udid);
        stopLive();
        session = {
          id: randomUUID(),
          deviceUDID: found.udid,
          createdAt: new Date().toISOString(),
          owner: "viewer",
          attached: true,
          bootedByServer: false,
        };
        device = found;
        json({ type: "device_status", device: found, sessionId: session.id });
        const host = await tryHideHost();
        emitHostStatus(host);
        startActionWatch();
        if (found.state === "Booted") {
          // Still first, then stream. A screenshot after SimulatorVideoStream
          // can steal the IOSurface and leave Live with a single stale frame.
          try {
            await captureSnapshot();
          } catch (error) {
            emitError(error);
          }
          const live = await tryLiveStream(found.udid);
          if (!live) {
            startWatchIfNeeded();
          }
        } else {
          emitStream({
            mode: "disconnected",
            connected: false,
            note: "Device is not booted. Boot it, then Refresh. Live is reserved for a real H.264 stream.",
          });
        }
        json({ type: "control_result", action: "attach", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "attach", ok: false, error: asProtocolError(error) });
      }
    },

    detach(): void {
      stopLive();
      stopWatch();
      stopActionWatch();
      session = undefined;
      device = undefined;
      emitStream({ mode: "disconnected", connected: false, note: "Detached." });
      json({ type: "control_result", action: "detach", ok: true });
    },

    async refresh(): Promise<void> {
      try {
        await captureSnapshot();
        json({ type: "control_result", action: "refresh", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "refresh", ok: false, error: asProtocolError(error) });
      }
    },

    setWatch(enabled: boolean, intervalMs?: number): void {
      watchEnabled = enabled;
      watchIntervalMs = clampWatchInterval(intervalMs);
      if (enabled && streamMode === "live") {
        json({
          type: "error",
          code: "INVALID_REQUEST",
          message: "Watch is snapshot polling for development only. It stays off while a live stream is connected.",
        });
        json({ type: "control_result", action: "watch", ok: false });
        return;
      }
      if (enabled) {
        startWatchIfNeeded();
      } else {
        stopWatch();
      }
      json({ type: "control_result", action: "watch", ok: true });
    },

    async boot(): Promise<void> {
      try {
        const attached = requireSession();
        await rpc.call(Methods.simulatorBoot, deviceParams(attached.device.udid));
        const updated = await resolveDevice(attached.device.udid);
        device = { ...updated, state: "Booted" };
        json({ type: "device_status", device, sessionId: attached.session.id });
        const host = await tryHideHost();
        emitHostStatus(host);
        json({
          type: "agent_action",
          sessionId: attached.session.id,
          action: "boot",
          payload: { deviceId: attached.device.udid },
        });
        try {
          await captureSnapshot();
        } catch (error) {
          emitError(error);
        }
        const live = await tryLiveStream(attached.device.udid);
        if (!live) {
          startWatchIfNeeded();
        }
        json({ type: "control_result", action: "boot", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "boot", ok: false, error: asProtocolError(error) });
      }
    },

    async tap(x: number, y: number): Promise<void> {
      const started = Date.now();
      try {
        const attached = requireSession();
        // HID must not wait on screenshot/list. Same RPC process is concurrent in native.
        await rpc.call(Methods.simulatorTap, { ...deviceParams(attached.device.udid), x, y });
        json({
          type: "agent_action",
          sessionId: attached.session.id,
          action: "tap",
          payload: { x, y, deviceId: attached.device.udid },
        });
        json({ type: "control_result", action: "tap", ok: true });
        process.stderr.write(`[viewer] tap ack ${Date.now() - started}ms\n`);
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "tap", ok: false, error: asProtocolError(error) });
        process.stderr.write(`[viewer] tap ack ${Date.now() - started}ms (error)\n`);
      }
    },

    async swipe(x1: number, y1: number, x2: number, y2: number, duration?: number): Promise<void> {
      try {
        const attached = requireSession();
        const params: Record<string, unknown> = {
          ...deviceParams(attached.device.udid),
          x1,
          y1,
          x2,
          y2,
        };
        if (duration !== undefined) {
          params.duration = duration;
        }
        await rpc.call(Methods.simulatorSwipe, params);
        json({
          type: "agent_action",
          sessionId: attached.session.id,
          action: "swipe",
          payload: { x1, y1, x2, y2, duration, deviceId: attached.device.udid },
        });
        json({ type: "control_result", action: "swipe", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "swipe", ok: false, error: asProtocolError(error) });
      }
    },

    async showHost(): Promise<void> {
      try {
        const result = await rpc.call<SimulatorHostResult>(Methods.simulatorShowHost, {});
        emitHostStatus({
          action: result.action ?? "shown",
          hidden: result.hidden === true,
          note: result.note ?? "Reopened Apple host UI. The simulator guest was not detached.",
          ...(result.app ? { app: result.app } : {}),
        });
        json({ type: "control_result", action: "show_host", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "show_host", ok: false, error: asProtocolError(error) });
      }
    },

    async home(): Promise<void> {
      try {
        const attached = requireSession();
        await rpc.call(Methods.simulatorHome, deviceParams(attached.device.udid));
        json({
          type: "agent_action",
          sessionId: attached.session.id,
          action: "home",
          payload: { deviceId: attached.device.udid, button: "home" },
        });
        json({ type: "control_result", action: "home", ok: true });
      } catch (error) {
        emitError(error);
        json({ type: "control_result", action: "home", ok: false, error: asProtocolError(error) });
      }
    },

    snapshot(): Session | undefined {
      return session;
    },

    async close(): Promise<void> {
      stopLive();
      stopWatch();
      stopActionWatch();
      session = undefined;
      device = undefined;
    },
  };
}

function connectUnixRetry(path: string, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let settled = false;
    const attempt = (): void => {
      if (settled) {
        return;
      }
      const sock = createConnection(path);
      const onConnect = (): void => {
        if (settled) {
          sock.destroy();
          return;
        }
        settled = true;
        sock.removeListener("error", onError);
        resolve(sock);
      };
      const onError = (): void => {
        sock.destroy();
        if (settled) {
          return;
        }
        if (Date.now() - started > timeoutMs) {
          settled = true;
          reject(new Error(`Timed out connecting to stream socket ${path}`));
          return;
        }
        setTimeout(attempt, 40);
      };
      sock.once("connect", onConnect);
      sock.once("error", onError);
    };
    attempt();
  });
}
