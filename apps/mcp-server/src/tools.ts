import { Methods } from "@mobile-simulator/protocol";

/** V1 MCP tool names from the product spec. Do not rename. */
export const ToolName = {
  simulatorList: "simulator_list",
  simulatorBoot: "simulator_boot",
  simulatorShutdown: "simulator_shutdown",
  simulatorAttach: "simulator_attach",
  simulatorDetach: "simulator_detach",
  appInstall: "app_install",
  appLaunch: "app_launch",
  appTerminate: "app_terminate",
  appUninstall: "app_uninstall",
  simulatorTap: "simulator_tap",
  simulatorSwipe: "simulator_swipe",
  simulatorType: "simulator_type",
  simulatorPress: "simulator_press",
  simulatorHome: "simulator_home",
  simulatorScreenshot: "simulator_screenshot",
  simulatorUiTree: "simulator_ui_tree",
  simulatorStatus: "simulator_status",
  doctor: "doctor",
} as const;

export type ToolName = (typeof ToolName)[keyof typeof ToolName];

/**
 * Direct JSON-RPC method for each passthrough tool.
 * attach / detach / status / doctor are MCP-composed (still talk to Swift only via RPC).
 */
export const TOOL_RPC_METHOD = {
  [ToolName.simulatorList]: Methods.simulatorList,
  [ToolName.simulatorBoot]: Methods.simulatorBoot,
  [ToolName.simulatorShutdown]: Methods.simulatorShutdown,
  [ToolName.appInstall]: Methods.appInstall,
  [ToolName.appLaunch]: Methods.appLaunch,
  [ToolName.appTerminate]: Methods.appTerminate,
  [ToolName.appUninstall]: Methods.appUninstall,
  [ToolName.simulatorTap]: Methods.simulatorTap,
  [ToolName.simulatorSwipe]: Methods.simulatorSwipe,
  [ToolName.simulatorType]: Methods.simulatorType,
  [ToolName.simulatorPress]: Methods.simulatorPress,
  [ToolName.simulatorHome]: Methods.simulatorHome,
  [ToolName.simulatorScreenshot]: Methods.simulatorScreenshot,
  [ToolName.simulatorUiTree]: Methods.simulatorUiTree,
} as const;

export const PASSTHROUGH_TOOLS = Object.keys(TOOL_RPC_METHOD) as Array<keyof typeof TOOL_RPC_METHOD>;

export const DEVICE_SCOPED_TOOLS = [
  ToolName.simulatorBoot,
  ToolName.simulatorShutdown,
  ToolName.simulatorAttach,
  ToolName.simulatorDetach,
  ToolName.appInstall,
  ToolName.appLaunch,
  ToolName.appTerminate,
  ToolName.appUninstall,
  ToolName.simulatorTap,
  ToolName.simulatorSwipe,
  ToolName.simulatorType,
  ToolName.simulatorPress,
  ToolName.simulatorHome,
  ToolName.simulatorScreenshot,
  ToolName.simulatorUiTree,
  ToolName.simulatorStatus,
] as const;

/** Tools that require an attached session for the given udid. */
export const ATTACH_REQUIRED_TOOLS = [
  ToolName.simulatorBoot,
  ToolName.simulatorShutdown,
  ToolName.appInstall,
  ToolName.appLaunch,
  ToolName.appTerminate,
  ToolName.appUninstall,
  ToolName.simulatorTap,
  ToolName.simulatorSwipe,
  ToolName.simulatorType,
  ToolName.simulatorPress,
  ToolName.simulatorHome,
  ToolName.simulatorScreenshot,
  ToolName.simulatorUiTree,
] as const;
