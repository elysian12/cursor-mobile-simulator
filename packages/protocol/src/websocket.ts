import type { ProtocolError } from "./errors.js";
import type { SimulatorDevice } from "./device.js";
import type { MediaCodecName, MediaFrameSource } from "./frames.js";
import type { HostAppAction } from "./methods.js";

/**
 * Viewer / agent WebSocket **text** messages. Media is never inlined here —
 * stills and H.264 Annex-B travel as binary frames (`encodeMediaFrame`).
 */
export type AgentActionName =
  | "tap"
  | "swipe"
  | "type"
  | "press"
  | "home"
  | "launch"
  | "install"
  | "terminate"
  | "uninstall"
  | "screenshot"
  | "boot"
  | "shutdown";

export interface DeviceStatusMessage {
  type: "device_status";
  device: SimulatorDevice;
  sessionId?: string;
}

export interface AgentActionMessage {
  type: "agent_action";
  sessionId: string;
  action: AgentActionName;
  payload: Record<string, unknown>;
}

export type ViewerStreamMode = "live" | "snapshot" | "disconnected";
export type GatewayConnectionState = "connected" | "connecting" | "disconnected" | "error";

export interface ViewerHelloMessage {
  type: "viewer_hello";
}

export interface ViewerListMessage {
  type: "viewer_list";
  available?: boolean;
  platform?: "ios" | "all";
}

export interface ViewerAttachMessage {
  type: "viewer_attach";
  /** Explicit simulator UDID. `udid` is also accepted by the gateway. */
  deviceId: string;
}

export interface ViewerDetachMessage {
  type: "viewer_detach";
}

export interface ViewerRefreshMessage {
  type: "viewer_refresh";
}

export interface ViewerWatchMessage {
  type: "viewer_watch";
  enabled: boolean;
  /** Milliseconds. Gateway clamps to ≥1000. */
  intervalMs?: number;
}

export interface ViewerBootMessage {
  type: "viewer_boot";
}

export interface ViewerShowHostMessage {
  type: "viewer_show_host";
}

export interface ControlTapMessage {
  type: "control_tap";
  /** Device points, origin top-left. */
  x: number;
  y: number;
}

export interface ControlSwipeMessage {
  type: "control_swipe";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seconds. */
  duration?: number;
}

export interface ControlHomeMessage {
  type: "control_home";
}

export interface DeviceListMessage {
  type: "device_list";
  devices: SimulatorDevice[];
}

export interface StreamStatusMessage {
  type: "stream_status";
  mode: ViewerStreamMode;
  connected: boolean;
  codec?: MediaCodecName;
  note?: string;
}

export interface ConnectionStateMessage {
  type: "connection_state";
  state: GatewayConnectionState;
  message?: string;
}

export interface ControlResultMessage {
  type: "control_result";
  action: "tap" | "swipe" | "home" | "boot" | "refresh" | "watch" | "attach" | "detach" | "show_host";
  ok: boolean;
  error?: ProtocolError;
}

export interface HostStatusMessage {
  type: "host_status";
  action: HostAppAction | string;
  hidden: boolean;
  app?: string;
  note: string;
}

export interface ViewerErrorMessage {
  type: "error";
  code: string;
  message: string;
  /** When true, UI should tell the user to run `mobile-sim grant`. */
  grantHint?: boolean;
}

/** Optional text hint that a binary media frame follows on the same socket. */
export interface FrameMetaMessage {
  type: "frame_meta";
  deviceId: string;
  format: MediaCodecName;
  width?: number;
  height?: number;
  timestamp: number;
  source: MediaFrameSource;
  byteLength: number;
}

export type WSClientMessage =
  | ViewerHelloMessage
  | ViewerListMessage
  | ViewerAttachMessage
  | ViewerDetachMessage
  | ViewerRefreshMessage
  | ViewerWatchMessage
  | ViewerBootMessage
  | ViewerShowHostMessage
  | ControlTapMessage
  | ControlSwipeMessage
  | ControlHomeMessage;

export type WSServerMessage =
  | DeviceStatusMessage
  | AgentActionMessage
  | DeviceListMessage
  | StreamStatusMessage
  | ConnectionStateMessage
  | ControlResultMessage
  | HostStatusMessage
  | ViewerErrorMessage
  | FrameMetaMessage;

export type WSMessage = WSClientMessage | WSServerMessage;

const AGENT_ACTIONS = new Set<AgentActionName>([
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
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDevice(value: unknown): value is SimulatorDevice {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.udid === "string" &&
    typeof value.name === "string" &&
    typeof value.runtime === "string" &&
    typeof value.state === "string"
  );
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function optionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

/**
 * Parse a WebSocket **text** frame. Returns `undefined` for invalid JSON,
 * unknown `type`, or messages that fail a structural check.
 * Does not accept media payloads (those are binary `MSF1` frames).
 */
export function parseWSMessage(raw: string): WSMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return undefined;
  }
  switch (parsed.type) {
    case "device_status": {
      if (!isDevice(parsed.device) || !optionalString(parsed.sessionId)) {
        return undefined;
      }
      const message: DeviceStatusMessage = {
        type: "device_status",
        device: parsed.device,
      };
      if (typeof parsed.sessionId === "string") {
        message.sessionId = parsed.sessionId;
      }
      return message;
    }
    case "agent_action": {
      if (
        typeof parsed.sessionId !== "string" ||
        typeof parsed.action !== "string" ||
        !AGENT_ACTIONS.has(parsed.action as AgentActionName) ||
        !isRecord(parsed.payload)
      ) {
        return undefined;
      }
      return {
        type: "agent_action",
        sessionId: parsed.sessionId,
        action: parsed.action as AgentActionName,
        payload: parsed.payload,
      };
    }
    case "viewer_hello":
      return { type: "viewer_hello" };
    case "viewer_list": {
      const message: ViewerListMessage = { type: "viewer_list" };
      if (parsed.available !== undefined) {
        if (typeof parsed.available !== "boolean") {
          return undefined;
        }
        message.available = parsed.available;
      }
      if (parsed.platform !== undefined) {
        if (parsed.platform !== "ios" && parsed.platform !== "all") {
          return undefined;
        }
        message.platform = parsed.platform;
      }
      return message;
    }
    case "viewer_attach": {
      const deviceId =
        typeof parsed.deviceId === "string"
          ? parsed.deviceId
          : typeof parsed.udid === "string"
            ? parsed.udid
            : undefined;
      if (!deviceId) {
        return undefined;
      }
      return { type: "viewer_attach", deviceId };
    }
    case "viewer_detach":
      return { type: "viewer_detach" };
    case "viewer_refresh":
      return { type: "viewer_refresh" };
    case "viewer_watch": {
      if (typeof parsed.enabled !== "boolean" || !optionalNumber(parsed.intervalMs)) {
        return undefined;
      }
      const message: ViewerWatchMessage = { type: "viewer_watch", enabled: parsed.enabled };
      if (typeof parsed.intervalMs === "number") {
        message.intervalMs = parsed.intervalMs;
      }
      return message;
    }
    case "viewer_boot":
      return { type: "viewer_boot" };
    case "viewer_show_host":
      return { type: "viewer_show_host" };
    case "control_tap": {
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
        return undefined;
      }
      if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) {
        return undefined;
      }
      return { type: "control_tap", x: parsed.x, y: parsed.y };
    }
    case "control_swipe": {
      if (
        typeof parsed.x1 !== "number" ||
        typeof parsed.y1 !== "number" ||
        typeof parsed.x2 !== "number" ||
        typeof parsed.y2 !== "number"
      ) {
        return undefined;
      }
      if (
        !Number.isFinite(parsed.x1) ||
        !Number.isFinite(parsed.y1) ||
        !Number.isFinite(parsed.x2) ||
        !Number.isFinite(parsed.y2)
      ) {
        return undefined;
      }
      if (!optionalNumber(parsed.duration)) {
        return undefined;
      }
      const message: ControlSwipeMessage = {
        type: "control_swipe",
        x1: parsed.x1,
        y1: parsed.y1,
        x2: parsed.x2,
        y2: parsed.y2,
      };
      if (typeof parsed.duration === "number") {
        message.duration = parsed.duration;
      }
      return message;
    }
    case "control_home":
      return { type: "control_home" };
    case "device_list": {
      if (!Array.isArray(parsed.devices) || !parsed.devices.every(isDevice)) {
        return undefined;
      }
      return { type: "device_list", devices: parsed.devices };
    }
    case "stream_status": {
      if (
        (parsed.mode !== "live" && parsed.mode !== "snapshot" && parsed.mode !== "disconnected") ||
        typeof parsed.connected !== "boolean"
      ) {
        return undefined;
      }
      if (
        parsed.codec !== undefined &&
        parsed.codec !== "jpeg" &&
        parsed.codec !== "png" &&
        parsed.codec !== "h264_annexb"
      ) {
        return undefined;
      }
      if (!optionalString(parsed.note)) {
        return undefined;
      }
      const message: StreamStatusMessage = {
        type: "stream_status",
        mode: parsed.mode,
        connected: parsed.connected,
      };
      if (parsed.codec === "jpeg" || parsed.codec === "png" || parsed.codec === "h264_annexb") {
        message.codec = parsed.codec;
      }
      if (typeof parsed.note === "string") {
        message.note = parsed.note;
      }
      return message;
    }
    case "connection_state": {
      if (
        parsed.state !== "connected" &&
        parsed.state !== "connecting" &&
        parsed.state !== "disconnected" &&
        parsed.state !== "error"
      ) {
        return undefined;
      }
      if (!optionalString(parsed.message)) {
        return undefined;
      }
      const message: ConnectionStateMessage = { type: "connection_state", state: parsed.state };
      if (typeof parsed.message === "string") {
        message.message = parsed.message;
      }
      return message;
    }
    case "control_result": {
      const actions = new Set(["tap", "swipe", "home", "boot", "refresh", "watch", "attach", "detach", "show_host"]);
      if (typeof parsed.action !== "string" || !actions.has(parsed.action) || typeof parsed.ok !== "boolean") {
        return undefined;
      }
      const message: ControlResultMessage = {
        type: "control_result",
        action: parsed.action as ControlResultMessage["action"],
        ok: parsed.ok,
      };
      if (parsed.error !== undefined) {
        if (!isRecord(parsed.error) || typeof parsed.error.code !== "string" || typeof parsed.error.message !== "string") {
          return undefined;
        }
        const error: ProtocolError = {
          code: parsed.error.code,
          message: parsed.error.message,
        };
        if (isRecord(parsed.error.data)) {
          error.data = parsed.error.data;
        }
        message.error = error;
      }
      return message;
    }
    case "host_status": {
      if (typeof parsed.action !== "string" || typeof parsed.hidden !== "boolean" || typeof parsed.note !== "string") {
        return undefined;
      }
      if (!optionalString(parsed.app)) {
        return undefined;
      }
      const message: HostStatusMessage = {
        type: "host_status",
        action: parsed.action,
        hidden: parsed.hidden,
        note: parsed.note,
      };
      if (typeof parsed.app === "string") {
        message.app = parsed.app;
      }
      return message;
    }
    case "error": {
      if (typeof parsed.code !== "string" || typeof parsed.message !== "string") {
        return undefined;
      }
      if (!optionalBoolean(parsed.grantHint)) {
        return undefined;
      }
      const message: ViewerErrorMessage = {
        type: "error",
        code: parsed.code,
        message: parsed.message,
      };
      if (typeof parsed.grantHint === "boolean") {
        message.grantHint = parsed.grantHint;
      }
      return message;
    }
    case "frame_meta": {
      if (
        typeof parsed.deviceId !== "string" ||
        (parsed.format !== "jpeg" && parsed.format !== "png" && parsed.format !== "h264_annexb") ||
        typeof parsed.timestamp !== "number" ||
        (parsed.source !== "stream" && parsed.source !== "snapshot") ||
        typeof parsed.byteLength !== "number"
      ) {
        return undefined;
      }
      if (!optionalNumber(parsed.width) || !optionalNumber(parsed.height)) {
        return undefined;
      }
      const message: FrameMetaMessage = {
        type: "frame_meta",
        deviceId: parsed.deviceId,
        format: parsed.format,
        timestamp: parsed.timestamp,
        source: parsed.source,
        byteLength: parsed.byteLength,
      };
      if (typeof parsed.width === "number") {
        message.width = parsed.width;
      }
      if (typeof parsed.height === "number") {
        message.height = parsed.height;
      }
      return message;
    }
    default:
      return undefined;
  }
}
