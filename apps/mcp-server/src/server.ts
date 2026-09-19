import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHandlers, type HandlerContext } from "./handlers.js";
import { ToolName } from "./tools.js";

const UDID_DESC =
  "Explicit simulator UDID (UUID). Required. Never omit, never pass 'booted', never default to the currently booted simulator.";

const TAP_FOLLOWUP =
  " After this call, immediately take a new screenshot with simulator_screenshot and the same udid. Tap/gesture success can be a lie on Xcode 27.";

export function createMobileSimulatorServer(ctx: HandlerContext): McpServer {
  const handlers = createHandlers(ctx);
  const server = new McpServer({
    name: "mobile-simulator",
    version: "0.1.0",
  });

  server.tool(
    ToolName.simulatorList,
    "List iOS Simulators (name, UDID, runtime, state). Always pick an explicit udid from this list for every later tool. Never assume a booted device.",
    {
      available: z
        .boolean()
        .optional()
        .describe("When true (default), only available devices. Set false to include unavailable."),
      platform: z.enum(["ios", "all"]).optional().describe("Default ios. Use all for watchOS/tvOS/visionOS too."),
    },
    async (args) => handlers.simulator_list(args),
  );

  server.tool(
    ToolName.simulatorAttach,
    "Attach an exclusive MCP session to one simulator. Requires udid. Boots the device if it is not already Booted (bootedByServer=true only then). Hides Apple Device Hub / Simulator.app (host presenter only; does not shut down the guest). Shutdown-on-detach happens only if this server booted it. Fails with DEVICE_LOCKED if already attached.",
    {
      udid: z.string().describe(UDID_DESC),
      owner: z.string().optional().describe("Session owner label (default mcp)."),
    },
    async (args) => handlers.simulator_attach(args),
  );

  server.tool(
    ToolName.simulatorDetach,
    "Release the MCP session for this udid. Shuts the simulator down only if this server booted it (session.bootedByServer).",
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_detach(args),
  );

  server.tool(
    ToolName.simulatorBoot,
    "Boot a simulator by explicit udid. Requires an attached session. Does not default to a booted device.",
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_boot(args),
  );

  server.tool(
    ToolName.simulatorShutdown,
    "Shut down a simulator by explicit udid. Requires an attached session.",
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_shutdown(args),
  );

  server.tool(
    ToolName.appInstall,
    "Install a .app bundle on the attached simulator. Requires udid.",
    {
      udid: z.string().describe(UDID_DESC),
      path: z.string().describe("Filesystem path to a .app bundle."),
    },
    async (args) => handlers.app_install(args),
  );

  server.tool(
    ToolName.appLaunch,
    "Launch an installed app by bundle identifier. Requires udid.",
    {
      udid: z.string().describe(UDID_DESC),
      bundleId: z.string().describe("App bundle identifier."),
    },
    async (args) => handlers.app_launch(args),
  );

  server.tool(
    ToolName.appTerminate,
    "Terminate a running app. Requires udid.",
    {
      udid: z.string().describe(UDID_DESC),
      bundleId: z.string().describe("App bundle identifier."),
    },
    async (args) => handlers.app_terminate(args),
  );

  server.tool(
    ToolName.appUninstall,
    "Uninstall an app by bundle identifier. Requires udid.",
    {
      udid: z.string().describe(UDID_DESC),
      bundleId: z.string().describe("App bundle identifier."),
    },
    async (args) => handlers.app_uninstall(args),
  );

  server.tool(
    ToolName.simulatorTap,
    "Tap at (x, y) in device points (origin top-left). Real HID via FBSimulatorControl (SimulatorHID / DTUHID). Not faked." +
      TAP_FOLLOWUP,
    {
      udid: z.string().describe(UDID_DESC),
      x: z.number().describe("X coordinate in points."),
      y: z.number().describe("Y coordinate in points."),
    },
    async (args) => handlers.simulator_tap(args),
  );

  server.tool(
    ToolName.simulatorSwipe,
    "Swipe between two points in device points (origin top-left). Real HID via FBSimulatorControl. Not faked." +
      TAP_FOLLOWUP,
    {
      udid: z.string().describe(UDID_DESC),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      duration: z.number().optional().describe("Duration in seconds (HID)."),
    },
    async (args) => handlers.simulator_swipe(args),
  );

  server.tool(
    ToolName.simulatorType,
    "Type text via USB HID keycodes (DTUHID on Xcode 27). Real HID; not faked." +
      TAP_FOLLOWUP,
    {
      udid: z.string().describe(UDID_DESC),
      text: z.string().describe("Text to type."),
    },
    async (args) => handlers.simulator_type(args),
  );

  server.tool(
    ToolName.simulatorPress,
    "Press a hardware button (home, lock, volumeUp, volumeDown, side). Passed through as simulator.press. Real HID; not faked." +
      TAP_FOLLOWUP,
    {
      udid: z.string().describe(UDID_DESC),
      button: z.string().describe("Hardware button name, e.g. home, lock, side, siri, volume_up, volume_down."),
    },
    async (args) => handlers.simulator_press(args),
  );

  server.tool(
    ToolName.simulatorHome,
    "Press the Home button. Passed through as simulator.home (alias of simulator.press home). Real HID; not faked." +
      TAP_FOLLOWUP,
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_home(args),
  );

  server.tool(
    ToolName.simulatorScreenshot,
    "Capture a PNG via native simulator.screenshot (simctl io). Returns MCP image content plus a caption with device name and UDID. Requires attached udid.",
    {
      udid: z.string().describe(UDID_DESC),
      path: z.string().optional().describe("Optional output PNG path. Native picks a temp path if omitted."),
    },
    async (args) => handlers.simulator_screenshot(args),
  );

  server.tool(
    ToolName.simulatorUiTree,
    "Dump the accessibility / UI tree via simulator.uiTree. Honest NOT_IMPLEMENTED until SimulatorFrameworkBridge (axbridge) is shipped next to mobile-sim. This server does not fake a tree.",
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_ui_tree(args),
  );

  server.tool(
    ToolName.simulatorStatus,
    "Device record plus MCP attach session for an explicit udid. Does not default to a booted simulator.",
    { udid: z.string().describe(UDID_DESC) },
    async (args) => handlers.simulator_status(args),
  );

  server.tool(
    ToolName.doctor,
    "Preflight macOS, the mobile-sim binary, JSON-RPC, and consent (~/.mobile-simulator/permissions.json). Does not download iOS platforms. Not a Flutter tool. If PERMISSION_DENIED, run `mobile-sim grant` in a terminal.",
    {},
    async () => handlers.doctor(),
  );

  return server;
}
