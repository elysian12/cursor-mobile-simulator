import { useEffect, useMemo, useRef, useState } from "react";
import {
  decodeMediaFrame,
  parseWSMessage,
  type AgentActionMessage,
  type GatewayConnectionState,
  type SimulatorDevice,
  type ViewerStreamMode,
} from "@mobile-simulator/protocol";
import { Framebuffer } from "./components/Framebuffer";
import { Header } from "./components/Header";
import { Toolbar } from "./components/Toolbar";
import { deviceAspect, formatAgentLine, formatHostStatus } from "./lib/format";
import { createH264Decoder } from "./lib/h264";
import { sendJson, viewerWebSocketUrl } from "./lib/ws-client";

interface Banner {
  kind: "error" | "warn";
  code: string;
  message: string;
}

export function App() {
  const [connection, setConnection] = useState<GatewayConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("Connecting to gateway…");
  const [devices, setDevices] = useState<SimulatorDevice[]>([]);
  const [device, setDevice] = useState<SimulatorDevice | undefined>();
  const [selectedId, setSelectedId] = useState("");
  const [udidDraft, setUdidDraft] = useState("");
  const [streamMode, setStreamMode] = useState<ViewerStreamMode>("disconnected");
  const [streamNote, setStreamNote] = useState<string | undefined>();
  const [agent, setAgent] = useState<AgentActionMessage | undefined>();
  const [banner, setBanner] = useState<Banner | undefined>();
  const [watch, setWatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [livePainted, setLivePainted] = useState(false);
  const [useCanvas, setUseCanvas] = useState(false);
  const [hostHidden, setHostHidden] = useState(false);
  const [hostNote, setHostNote] = useState<string | undefined>();

  const wsRef = useRef<WebSocket | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageUrlRef = useRef<string | undefined>();
  const livePaintedRef = useRef(false);
  const paintSeqRef = useRef(0);
  const decoderRef = useRef<ReturnType<typeof createH264Decoder>>();

  const attached = Boolean(device);
  const hostLine = formatHostStatus(hostHidden, hostNote, attached);
  const badgeMode: ViewerStreamMode = livePainted ? "live" : streamMode === "live" ? "snapshot" : streamMode;
  const connectionLabel =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting"
        : connection === "error"
          ? "Error"
          : "Disconnected";

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = (): void => {
      setConnection("connecting");
      const ws = new WebSocket(viewerWebSocketUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;
      ws.onopen = () => {
        if (closed) {
          return;
        }
        setConnection("connected");
        sendJson(ws, { type: "viewer_hello" });
      };
      ws.onclose = () => {
        if (closed) {
          return;
        }
        setConnection("disconnected");
        setConnectionMessage("Gateway socket closed. Reconnecting…");
        retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => {
        setConnection("error");
      };
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") {
          handleBinary(event.data);
          return;
        }
        const message = parseWSMessage(event.data);
        if (!message) {
          return;
        }
        switch (message.type) {
          case "connection_state":
            setConnection(message.state);
            if (message.message) {
              setConnectionMessage(message.message);
            }
            break;
          case "device_list":
            setDevices(message.devices);
            break;
          case "device_status":
            setDevice(message.device);
            setSelectedId(message.device.udid);
            setUdidDraft(message.device.udid);
            setBusy(false);
            break;
          case "stream_status":
            setStreamMode(message.mode);
            setStreamNote(message.note);
            if (message.mode !== "live") {
              livePaintedRef.current = false;
              setLivePainted(false);
              // Keep a snapshot <img> visible. Only hide the live canvas when
              // we already have a still — otherwise this blanks a painted frame.
              if (imageUrlRef.current) {
                setUseCanvas(false);
              }
            }
            break;
          case "agent_action":
            setAgent(message);
            break;
          case "host_status":
            setHostHidden(message.hidden);
            setHostNote(message.note);
            break;
          case "control_result":
            setBusy(false);
            if (message.action === "watch") {
              /* checkbox is optimistic; server may reject while live */
            }
            break;
          case "error":
            setBusy(false);
            setBanner({
              kind: message.grantHint ? "warn" : "error",
              code: message.code,
              message: message.message,
            });
            break;
          default:
            break;
        }
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) {
        clearTimeout(retry);
      }
      wsRef.current?.close();
      decoderRef.current?.close();
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = undefined;
      }
    };
  }, []);

  const paintBlobUrl = (blob: Blob, isLiveJpeg: boolean): void => {
    const url = URL.createObjectURL(blob);
    const previous = imageUrlRef.current;
    imageUrlRef.current = url;
    setImageUrl(url);
    livePaintedRef.current = isLiveJpeg;
    setLivePainted(isLiveJpeg);
    setUseCanvas(false);
    if (previous) {
      requestAnimationFrame(() => URL.revokeObjectURL(previous));
    }
  };

  const handleBinary = (data: ArrayBuffer): void => {
    const decoded = decodeMediaFrame(data);
    if (!decoded) {
      return;
    }
    if (decoded.header.format === "png" || decoded.header.format === "jpeg") {
      const isLiveJpeg = decoded.header.format === "jpeg" && decoded.header.source === "stream";
      const mime = decoded.header.format === "png" ? "image/png" : "image/jpeg";
      const bytes = new Uint8Array(decoded.payload.byteLength);
      bytes.set(decoded.payload);
      const blob = new Blob([bytes], { type: mime });
      // Stills stay on <img> so a later stream_status=snapshot cannot blank the bezel.
      if (!isLiveJpeg) {
        paintBlobUrl(blob, false);
        return;
      }
      const seq = ++paintSeqRef.current;
      if (typeof createImageBitmap === "function") {
        void createImageBitmap(blob)
          .then((bitmap) => {
            if (seq !== paintSeqRef.current) {
              bitmap.close();
              return;
            }
            const canvas = canvasRef.current;
            if (!canvas) {
              bitmap.close();
              paintBlobUrl(blob, true);
              return;
            }
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
            }
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(bitmap, 0, 0);
            bitmap.close();
            livePaintedRef.current = true;
            setLivePainted(true);
            setUseCanvas(true);
          })
          .catch(() => {
            if (seq === paintSeqRef.current) {
              paintBlobUrl(blob, true);
            }
          });
        return;
      }
      paintBlobUrl(blob, true);
      return;
    }
    if (decoded.header.format === "h264_annexb") {
      if (!decoderRef.current) {
        decoderRef.current = createH264Decoder(
          (frame) => {
            const canvas = canvasRef.current;
            if (!canvas) {
              frame.close();
              return;
            }
            if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
              canvas.width = frame.displayWidth;
              canvas.height = frame.displayHeight;
            }
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(frame, 0, 0);
            frame.close();
            livePaintedRef.current = true;
            setLivePainted(true);
            setUseCanvas(true);
          },
          () => {
            /* decode failed — keep Snapshot until a frame is painted */
          },
        );
      }
      decoderRef.current?.push(decoded.payload);
    }
  };

  const attachTo = (udid: string): void => {
    setBusy(true);
    setBanner(undefined);
    sendJson(wsRef.current, { type: "viewer_attach", deviceId: udid.trim() });
  };

  const aspect = useMemo(() => deviceAspect(device), [device]);

  return (
    <div className="app">
      <a className="skip" href="#framebuffer">
        Skip to framebuffer
      </a>
      <Header device={device} streamMode={badgeMode} connectionLabel={connectionLabel} />
      <Toolbar
        devices={devices}
        selectedId={selectedId}
        udidDraft={udidDraft}
        attached={attached}
        canBoot={attached && device?.state !== "Booted"}
        canHome={attached && connection === "connected"}
        busy={busy}
        watch={watch}
        onSelect={(udid) => {
          setSelectedId(udid);
          setUdidDraft(udid);
        }}
        onUdidDraft={setUdidDraft}
        onAttach={() => attachTo(udidDraft)}
        onRefresh={() => {
          setBusy(true);
          sendJson(wsRef.current, { type: "viewer_refresh" });
        }}
        onBoot={() => {
          setBusy(true);
          sendJson(wsRef.current, { type: "viewer_boot" });
        }}
        onHome={() => {
          setBusy(true);
          setBanner(undefined);
          sendJson(wsRef.current, { type: "control_home" });
        }}
        onShowHost={() => {
          setBusy(true);
          sendJson(wsRef.current, { type: "viewer_show_host" });
        }}
        onWatch={(enabled) => {
          setWatch(enabled);
          sendJson(wsRef.current, { type: "viewer_watch", enabled, intervalMs: 1000 });
        }}
      />
      {hostLine ? (
        <div className="host-status" role="status">
          {hostLine}
        </div>
      ) : null}
      {banner ? (
        <div className={`banner ${banner.kind}`} role="alert">
          <div>
            <strong>{banner.code}</strong>
            <p>
              {banner.message.split("\n").map((line, index) => (
                <span key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}
      <main id="framebuffer" className="stage" style={{ ["--device-aspect" as string]: aspect }}>
        <div className="bezel">
          <Framebuffer
            imageUrl={useCanvas ? undefined : imageUrl}
            canvasRef={canvasRef}
            showCanvas={useCanvas}
            deviceName={device?.name ?? "simulator"}
            screen={device?.screen}
            enabled={attached && (Boolean(imageUrl) || useCanvas)}
            emptyTitle={attached ? "No frame yet" : "No device attached"}
            emptyBody={
              attached
                ? "Use Refresh snapshot. Live is only shown after a decoded frame is painted."
                : "Pick a device from simulator.list and Attach."
            }
            onTap={(x, y) => sendJson(wsRef.current, { type: "control_tap", x, y })}
            onSwipe={(x1, y1, x2, y2, duration) =>
              sendJson(wsRef.current, { type: "control_swipe", x1, y1, x2, y2, duration })
            }
          />
        </div>
      </main>
      <footer className="footer">
        <div>
          <div className="agent" aria-live="polite">
            {formatAgentLine(agent, attached)}
          </div>
          <div className="hint">
            {device && !device.screen
              ? "Screen metadata missing — pointer mapping falls back to image pixels, not CSS pixels."
              : (streamNote ??
                (connection === "connected"
                  ? connectionMessage
                  : "Pointer tap/swipe uses device points (top-left). Gestures are not faked if HID is missing."))}
          </div>
        </div>
      </footer>
    </div>
  );
}
