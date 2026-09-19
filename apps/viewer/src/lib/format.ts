import type { AgentActionMessage, SimulatorDevice } from "@mobile-simulator/protocol";

export function formatAgentLine(action: AgentActionMessage | undefined, attached: boolean): string {
  if (!action) {
    return attached ? "Agent: Controlling simulator" : "Agent: idle";
  }
  const p = action.payload;
  if (action.action === "tap" && typeof p.x === "number" && typeof p.y === "number") {
    return `Agent: tap (${fmt(p.x)}, ${fmt(p.y)})`;
  }
  if (
    action.action === "swipe" &&
    typeof p.x1 === "number" &&
    typeof p.y1 === "number" &&
    typeof p.x2 === "number" &&
    typeof p.y2 === "number"
  ) {
    return `Agent: swipe (${fmt(p.x1)}, ${fmt(p.y1)}) → (${fmt(p.x2)}, ${fmt(p.y2)})`;
  }
  return `Agent: ${action.action}`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function shortUdid(udid: string): string {
  if (udid.length <= 13) {
    return udid;
  }
  return `${udid.slice(0, 8)}…${udid.slice(-4)}`;
}

export function formatHostStatus(hidden: boolean, note?: string, attached?: boolean): string | undefined {
  if (!attached && !hidden) {
    return undefined;
  }
  if (note && note.trim().length > 0) {
    return note;
  }
  if (hidden) {
    return "Apple Device Hub hidden — control this pane";
  }
  return undefined;
}

export function deviceAspect(device: SimulatorDevice | undefined): string {
  const screen = device?.screen;
  if (screen && screen.width > 0 && screen.height > 0) {
    return `${screen.width} / ${screen.height}`;
  }
  return "9 / 19.5";
}
