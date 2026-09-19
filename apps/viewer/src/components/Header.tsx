import type { SimulatorDevice, ViewerStreamMode } from "@mobile-simulator/protocol";
import { shortUdid } from "../lib/format";

interface HeaderProps {
  device?: SimulatorDevice;
  streamMode: ViewerStreamMode;
  connectionLabel: string;
}

export function Header({ device, streamMode, connectionLabel }: HeaderProps) {
  const name = device?.name ?? "No device";
  const badgeClass = streamMode === "live" ? "live" : streamMode === "snapshot" ? "snapshot" : "disconnected";
  const badgeText = streamMode === "live" ? "Live" : streamMode === "snapshot" ? "Snapshot" : "Disconnected";
  const badgeLabel =
    streamMode === "live"
      ? "Live: decoded frames are being painted"
      : streamMode === "snapshot"
        ? "Snapshot: still image, not a live stream"
        : "Disconnected: no framebuffer stream";

  return (
    <header className="chrome">
      <div className="identity">
        <h1>{name}</h1>
        <p className="meta">
          {device
            ? `${shortUdid(device.udid)} · ${device.state} · ${device.runtime}`
            : "Attach an explicit UDID"}
        </p>
      </div>
      <div className="badges">
        <span className={`badge ${badgeClass}`} aria-label={badgeLabel}>
          <span className="dot" aria-hidden="true" />
          {badgeText}
        </span>
        <span className="badge" aria-live="polite">
          {connectionLabel}
        </span>
      </div>
    </header>
  );
}
