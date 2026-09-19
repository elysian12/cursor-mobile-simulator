/**
 * Mirrors native `SimulatorDevice` (Sources/SimulatorController/Models.swift).
 */
export type SimulatorDeviceState =
  | "Creating"
  | "Booting"
  | "Booted"
  | "Shutting Down"
  | "Shutdown"
  | "Unknown";

/** Device points, origin top-left. */
export interface ScreenInfo {
  width: number;
  height: number;
  scale: number;
  origin: "topLeft" | string;
}

export interface SimulatorDevice {
  /** Always an explicit simulator UDID. Never `"booted"`. */
  udid: string;
  name: string;
  /** Display runtime, e.g. `"iOS 26.5"`. */
  runtime: string;
  state: SimulatorDeviceState;
  deviceType?: string;
  screen?: ScreenInfo;
}

export type SimulatorPlatform = "ios" | "watchos" | "tvos" | "xros" | "unknown";
