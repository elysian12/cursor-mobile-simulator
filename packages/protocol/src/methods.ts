import type { SimulatorDevice } from "./device.js";

/** Wire methods. Device identity is always `deviceId` (UDID). `udid` is also accepted by native. */
export const Methods = {
  simulatorList: "simulator.list",
  simulatorBoot: "simulator.boot",
  simulatorShutdown: "simulator.shutdown",
  simulatorScreenshot: "simulator.screenshot",
  simulatorTap: "simulator.tap",
  simulatorSwipe: "simulator.swipe",
  simulatorType: "simulator.type",
  simulatorPress: "simulator.press",
  simulatorHome: "simulator.home",
  simulatorUiTree: "simulator.uiTree",
  simulatorStream: "simulator.stream",
  simulatorHideHost: "simulator.hideHost",
  simulatorShowHost: "simulator.showHost",
  appInstall: "app.install",
  appLaunch: "app.launch",
  appTerminate: "app.terminate",
  appUninstall: "app.uninstall",
} as const;

export type MethodName = (typeof Methods)[keyof typeof Methods];

export interface DeviceIdParams {
  deviceId: string;
}

export interface SimulatorListParams {
  /** When true (default), only available devices. */
  available?: boolean;
  /** Default `"ios"`. Use `"all"` for watchOS / tvOS / visionOS simulators too. */
  platform?: "ios" | "all";
}

export interface SimulatorListResult {
  devices: SimulatorDevice[];
}

export interface SimulatorBootParams extends DeviceIdParams {}
export interface SimulatorBootResult {
  udid: string;
  state: "Booted";
}

export interface SimulatorShutdownParams extends DeviceIdParams {}
export interface SimulatorShutdownResult {
  udid: string;
  state: "Shutdown";
}

export interface SimulatorScreenshotParams extends DeviceIdParams {
  path?: string;
}
export interface SimulatorScreenshotResult {
  path: string;
}

export interface SimulatorTapParams extends DeviceIdParams {
  x: number;
  y: number;
}

export interface SimulatorSwipeParams extends DeviceIdParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seconds. Default 0.3 when HID exists. */
  duration?: number;
}

export interface SimulatorTypeParams extends DeviceIdParams {
  text: string;
}

export type HardwareButtonName = "home" | "lock" | "volumeUp" | "volumeDown" | "sideButton";

export interface SimulatorPressParams extends DeviceIdParams {
  button: HardwareButtonName | string;
}

export interface SimulatorHomeParams extends DeviceIdParams {}
export interface SimulatorHomeResult {
  button?: string;
}

export interface SimulatorUiTreeParams extends DeviceIdParams {}
export interface SimulatorUiTreeResult {
  tree: string;
}

export interface SimulatorStreamParams extends DeviceIdParams {
  socket?: string;
  path?: string;
}
export interface SimulatorStreamResult {
  udid: string;
  transport: string;
  format: string;
  socket?: string;
  note?: string;
}

/** Hide / show Apple Device Hub or Simulator.app. Never shuts down the guest. */
export type HostAppAction = "hidden" | "quit" | "shown" | "none";

export interface SimulatorHostParams {
  /** When true, quit Device Hub if hide leaves it running (IOSurface). Default hide-then-quit Device Hub. */
  quit?: boolean;
}

export interface SimulatorHostResult {
  action: HostAppAction | string;
  hidden: boolean;
  app?: string;
  bundleId?: string;
  note: string;
}

export interface AppInstallParams extends DeviceIdParams {
  path: string;
}
export interface AppInstallResult {
  udid: string;
  path: string;
}

export interface AppLaunchParams extends DeviceIdParams {
  bundleId: string;
}
export interface AppLaunchResult {
  udid: string;
  bundleId: string;
  pid?: number;
}

export interface AppTerminateParams extends DeviceIdParams {
  bundleId: string;
}
export interface AppTerminateResult {
  udid: string;
  bundleId: string;
}

export interface AppUninstallParams extends DeviceIdParams {
  bundleId: string;
}
export interface AppUninstallResult {
  udid: string;
  bundleId: string;
}

export interface MethodMap {
  "simulator.list": {
    params: SimulatorListParams;
    result: SimulatorListResult;
  };
  "simulator.boot": {
    params: SimulatorBootParams;
    result: SimulatorBootResult;
  };
  "simulator.shutdown": {
    params: SimulatorShutdownParams;
    result: SimulatorShutdownResult;
  };
  "simulator.screenshot": {
    params: SimulatorScreenshotParams;
    result: SimulatorScreenshotResult;
  };
  "simulator.tap": {
    params: SimulatorTapParams;
    result: Record<string, never>;
  };
  "simulator.swipe": {
    params: SimulatorSwipeParams;
    result: Record<string, never>;
  };
  "simulator.type": {
    params: SimulatorTypeParams;
    result: Record<string, never>;
  };
  "simulator.press": {
    params: SimulatorPressParams;
    result: { button: string };
  };
  "simulator.home": {
    params: SimulatorHomeParams;
    result: SimulatorHomeResult;
  };
  "simulator.uiTree": {
    params: SimulatorUiTreeParams;
    result: SimulatorUiTreeResult;
  };
  "simulator.stream": {
    params: SimulatorStreamParams;
    result: SimulatorStreamResult;
  };
  "simulator.hideHost": {
    params: SimulatorHostParams;
    result: SimulatorHostResult;
  };
  "simulator.showHost": {
    params: SimulatorHostParams;
    result: SimulatorHostResult;
  };
  "app.install": {
    params: AppInstallParams;
    result: AppInstallResult;
  };
  "app.launch": {
    params: AppLaunchParams;
    result: AppLaunchResult;
  };
  "app.terminate": {
    params: AppTerminateParams;
    result: AppTerminateResult;
  };
  "app.uninstall": {
    params: AppUninstallParams;
    result: AppUninstallResult;
  };
}
