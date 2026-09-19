import { useCallback, useRef, type PointerEvent, type Ref } from "react";
import type { ScreenInfo } from "@mobile-simulator/protocol";
import { DRAG_THRESHOLD_PX, pointerOnElementToDevicePoints, roundPoint } from "../lib/coords";

interface FramebufferProps {
  imageUrl?: string;
  canvasRef: Ref<HTMLCanvasElement>;
  showCanvas: boolean;
  deviceName: string;
  screen?: ScreenInfo;
  enabled: boolean;
  emptyTitle: string;
  emptyBody: string;
  onTap: (x: number, y: number) => void;
  onSwipe: (x1: number, y1: number, x2: number, y2: number, duration: number) => void;
}

export function Framebuffer({
  imageUrl,
  canvasRef,
  showCanvas,
  deviceName,
  screen,
  enabled,
  emptyTitle,
  emptyBody,
  onTap,
  onSwipe,
}: FramebufferProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; t: number; dragged: boolean } | null>(null);

  const pointFromEvent = useCallback(
    (event: PointerEvent): { x: number; y: number } | null => {
      const media = surfaceRef.current?.querySelector("img, canvas:not([hidden])");
      const rect = (media instanceof HTMLElement ? media : surfaceRef.current)?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        return null;
      }
      const space = screen ?? inferSpace(media);
      if (!space) {
        return null;
      }
      return roundPoint(pointerOnElementToDevicePoints(event.clientX, event.clientY, rect, space));
    },
    [screen],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!enabled) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (!point) {
      return;
    }
    gesture.current = { x: event.clientX, y: event.clientY, t: performance.now(), dragged: false };
    (event.currentTarget as HTMLDivElement).dataset.startX = String(point.x);
    (event.currentTarget as HTMLDivElement).dataset.startY = String(point.y);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current;
    if (!g) {
      return;
    }
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      g.dragged = true;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !enabled) {
      return;
    }
    const end = pointFromEvent(event);
    const startX = Number(event.currentTarget.dataset.startX);
    const startY = Number(event.currentTarget.dataset.startY);
    if (!end || !Number.isFinite(startX) || !Number.isFinite(startY)) {
      return;
    }
    if (g.dragged) {
      const duration = Math.min(1, Math.max(0.1, (performance.now() - g.t) / 1000));
      onSwipe(startX, startY, end.x, end.y, duration);
      return;
    }
    onTap(startX, startY);
  };

  return (
    <div
      className="framebuffer"
      ref={surfaceRef}
      role="img"
      aria-label={imageUrl || showCanvas ? `Framebuffer of ${deviceName}` : "No framebuffer"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        gesture.current = null;
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" hidden={!showCanvas} />
      {!showCanvas && imageUrl ? (
        <img src={imageUrl} alt={`Simulator framebuffer for ${deviceName}`} draggable={false} />
      ) : null}
      {!imageUrl && !showCanvas ? (
        <div className="empty">
          <div>
            <strong>{emptyTitle}</strong>
            {emptyBody}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function inferSpace(media: Element | null | undefined): Pick<ScreenInfo, "width" | "height"> | undefined {
  if (media instanceof HTMLImageElement && media.naturalWidth > 0) {
    return { width: media.naturalWidth, height: media.naturalHeight };
  }
  if (media instanceof HTMLCanvasElement && media.width > 0) {
    return { width: media.width, height: media.height };
  }
  return undefined;
}
