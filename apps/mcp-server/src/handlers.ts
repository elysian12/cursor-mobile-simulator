import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ErrorCode,
  Methods,
  type SimulatorDevice,
  type SimulatorHostResult,
  type SimulatorListResult,
  type SimulatorScreenshotResult,
  type SimulatorSession,
} from "@mobile-simulator/protocol";
import { formatToolError, GRANT_INSTRUCTIONS, jsonText, protocolError } from "./errors.js";
import { deviceParams, requireUdid } from "./udid.js";
import type { RpcClient } from "./rpc-client.js";
import type { SessionStore } from "./session-store.js";
import { locateMobileSimBinary } from "./locate-binary.js";
import { isMacOS } from "./platform.js";

export interface HandlerContext {
  rpc: RpcClient;
  sessions: SessionStore;
  binaryPath?: string;
  platform?: NodeJS.Platform;
  readFile?: (path: string) => Promise<Buffer>;
  now?: () => Date;
  randomId?: () => string;
  env?: NodeJS.ProcessEnv;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type ToolResult = {
  content: ContentBlock[];
  isError?: boolean;
};

export function createHandlers(ctx: HandlerContext) {
  const rpc = ctx.rpc;
  const sessions = ctx.sessions;
  const readPng = ctx.readFile ?? ((path: string) => readFile(path));
  const now = ctx.now ?? (() => new Date());
  const randomId = ctx.randomId ?? (() => randomUUID());
  const platform = ctx.platform ?? process.platform;

  async function listDevices(params: {
    available?: boolean;
    platform?: "ios" | "all";
  }): Promise<SimulatorDevice[]> {
    const result = await rpc.call<SimulatorListResult>(Methods.simulatorList, {
      available: params.available ?? true,
      platform: params.platform ?? "ios",
    });
    return result.devices ?? [];
  }

  async function requireDevice(udid: string): Promise<SimulatorDevice> {
    const devices = await listDevices({ available: false, platform: "all" });
    const device = devices.find((item) => item.udid.toLowerCase() === udid.toLowerCase());
    if (!device) {
      throw protocolError(
        ErrorCode.DEVICE_NOT_FOUND,
        `No simulator with UDID ${udid}. Run simulator_list and pass an explicit UDID.`,
        { udid },
      );
    }
    return device;
  }

  async function wrap(fn: () => Promise<ToolResult>): Promise<ToolResult> {
    try {
      return await fn();
    } catch (error) {
      return formatToolError(error);
    }
  }

  return {
    async simulator_list(args: {
      available?: boolean | undefined;
      platform?: "ios" | "all" | undefined;
    }): Promise<ToolResult> {
      return wrap(async () => {
        const devices = await listDevices({
          ...(args.available !== undefined ? { available: args.available } : {}),
          ...(args.platform !== undefined ? { platform: args.platform } : {}),
        });
        return jsonText({
          devices,
          note: "Pick an explicit udid. Never assume a booted simulator. Next: simulator_attach { udid }.",
        });
      });
    },

    async simulator_attach(args: { udid?: string | undefined; owner?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        const device = await requireDevice(udid);
        let bootedByServer = false;
        if (device.state !== "Booted") {
          await rpc.call(Methods.simulatorBoot, deviceParams(udid));
          bootedByServer = true;
        }
        const session: SimulatorSession = {
          id: randomId(),
          deviceUDID: device.udid,
          createdAt: now().toISOString(),
          owner: args.owner?.trim() || "mcp",
          attached: true,
          bootedByServer,
        };
        sessions.attach(session);
        let host: SimulatorHostResult = {
          action: "none",
          hidden: true,
          note: "Apple host UI is not running. Attach still works with an already-booted simulator.",
        };
        try {
          host = await rpc.call<SimulatorHostResult>(Methods.simulatorHideHost, {});
        } catch {
          host = {
            action: "none",
            hidden: false,
            note: "Could not hide Apple host UI. Attach still works; the guest was not shut down.",
          };
        }
        return jsonText({
          session,
          device: { ...device, state: "Booted" },
          host,
        });
      });
    },

    async simulator_detach(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        const session = sessions.requireAttached(udid);
        if (session.bootedByServer) {
          await rpc.call(Methods.simulatorShutdown, deviceParams(udid));
        }
        const released = sessions.detach(udid);
        return jsonText({
          session: released,
          shutdownOnDetach: session.bootedByServer,
        });
      });
    },

    async simulator_boot(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const result = await rpc.call(Methods.simulatorBoot, deviceParams(udid));
        return jsonText(result);
      });
    },

    async simulator_shutdown(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const result = await rpc.call(Methods.simulatorShutdown, deviceParams(udid));
        return jsonText(result);
      });
    },

    async app_install(args: { udid?: string | undefined; path?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        if (!args.path?.trim()) {
          throw protocolError(ErrorCode.INVALID_REQUEST, "path is required (a .app bundle).");
        }
        const result = await rpc.call(Methods.appInstall, { ...deviceParams(udid), path: args.path });
        return jsonText(result);
      });
    },

    async app_launch(args: { udid?: string | undefined; bundleId?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const bundleId = requireBundleId(args.bundleId);
        const result = await rpc.call(Methods.appLaunch, { ...deviceParams(udid), bundleId });
        return jsonText(result);
      });
    },

    async app_terminate(args: { udid?: string | undefined; bundleId?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const bundleId = requireBundleId(args.bundleId);
        const result = await rpc.call(Methods.appTerminate, { ...deviceParams(udid), bundleId });
        return jsonText(result);
      });
    },

    async app_uninstall(args: { udid?: string | undefined; bundleId?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const bundleId = requireBundleId(args.bundleId);
        const result = await rpc.call(Methods.appUninstall, { ...deviceParams(udid), bundleId });
        return jsonText(result);
      });
    },

    async simulator_tap(args: {
      udid?: string | undefined;
      x?: number | undefined;
      y?: number | undefined;
    }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const { x, y } = requirePoint(args.x, args.y);
        const result = await rpc.call(Methods.simulatorTap, { ...deviceParams(udid), x, y });
        return jsonText({
          result,
          warning:
            "HID tap was sent. On Xcode 27, immediately call simulator_screenshot with this same udid and verify the UI changed. This server does not fake gestures.",
        });
      });
    },

    async simulator_swipe(args: {
      udid?: string | undefined;
      x1?: number | undefined;
      y1?: number | undefined;
      x2?: number | undefined;
      y2?: number | undefined;
      duration?: number | undefined;
    }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const x1 = requireNumber(args.x1, "x1");
        const y1 = requireNumber(args.y1, "y1");
        const x2 = requireNumber(args.x2, "x2");
        const y2 = requireNumber(args.y2, "y2");
        const params: Record<string, unknown> = { ...deviceParams(udid), x1, y1, x2, y2 };
        if (args.duration !== undefined) {
          params.duration = args.duration;
        }
        const result = await rpc.call(Methods.simulatorSwipe, params);
        return jsonText({
          result,
          warning:
            "Re-screenshot after swipe. Gesture RPC may return success without the HID landing. This server does not fake swipes.",
        });
      });
    },

    async simulator_type(args: { udid?: string | undefined; text?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        if (args.text === undefined) {
          throw protocolError(ErrorCode.INVALID_REQUEST, "text is required.");
        }
        const result = await rpc.call(Methods.simulatorType, { ...deviceParams(udid), text: args.text });
        return jsonText({
          result,
          warning: "Re-screenshot after typing. This server does not fake keyboard input.",
        });
      });
    },

    async simulator_press(args: { udid?: string | undefined; button?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        if (!args.button?.trim()) {
          throw protocolError(ErrorCode.INVALID_REQUEST, "button is required (e.g. home, lock, side, siri).");
        }
        const result = await rpc.call(Methods.simulatorPress, {
          ...deviceParams(udid),
          button: args.button,
        });
        return jsonText({
          result,
          warning: "Re-screenshot after press. Hardware buttons pass through to native RPC; they are not faked.",
        });
      });
    },

    async simulator_home(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const result = await rpc.call(Methods.simulatorHome, deviceParams(udid));
        return jsonText({
          result,
          warning: "Re-screenshot after Home. HID was sent; this server does not fake the button press.",
        });
      });
    },

    async simulator_screenshot(args: { udid?: string | undefined; path?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const params: Record<string, unknown> = { ...deviceParams(udid) };
        if (args.path?.trim()) {
          params.path = args.path;
        }
        const result = await rpc.call<SimulatorScreenshotResult>(Methods.simulatorScreenshot, params);
        if (!result.path) {
          throw protocolError(ErrorCode.INTERNAL_ERROR, "simulator.screenshot returned no path.");
        }
        const bytes = await readPng(result.path);
        let name = udid;
        try {
          const device = await requireDevice(udid);
          name = device.name;
        } catch {
          const session = sessions.getAttached(udid);
          if (session) {
            name = session.deviceUDID;
          }
        }
        const caption = `Screenshot of ${name} (${udid})`;
        return {
          content: [
            { type: "image", data: bytes.toString("base64"), mimeType: "image/png" },
            { type: "text", text: `${caption}\npath: ${result.path}` },
          ],
        };
      });
    },

    async simulator_ui_tree(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        sessions.requireAttached(udid);
        const result = await rpc.call(Methods.simulatorUiTree, deviceParams(udid));
        return jsonText(result);
      });
    },

    async simulator_status(args: { udid?: string | undefined }): Promise<ToolResult> {
      return wrap(async () => {
        const udid = requireUdid(args.udid);
        const device = await requireDevice(udid);
        const session = sessions.getAttached(udid);
        return jsonText({
          device,
          session: session ?? null,
          attached: session !== undefined,
        });
      });
    },

    async doctor(): Promise<ToolResult> {
      return wrap(async () => {
        const checks: Array<{ name: string; ok: boolean; detail: string; remedy?: string }> = [];
        const macos = isMacOS(platform);
        checks.push({
          name: "macOS",
          ok: macos,
          detail: macos ? `platform=${platform}` : `Need darwin, got ${platform}`,
          ...(!macos
            ? { remedy: "Run this MCP server on a Mac with Xcode 26+ and a built mobile-sim." }
            : {}),
        });

        let binaryPath = ctx.binaryPath;
        let binaryOk = false;
        if (binaryPath) {
          binaryOk = true;
        } else {
          try {
            binaryPath = locateMobileSimBinary({
              ...(ctx.env !== undefined ? { env: ctx.env } : {}),
            });
            binaryOk = true;
          } catch (error) {
            binaryPath = undefined;
            checks.push({
              name: "mobile-sim binary",
              ok: false,
              detail: error instanceof Error ? error.message : String(error),
              remedy: "npm run build:native, then set MOBILE_SIMULATOR_BIN.",
            });
          }
        }
        if (binaryOk) {
          checks.push({
            name: "mobile-sim binary",
            ok: true,
            detail: binaryPath ?? "provided",
          });
        }

        let rpcOk = false;
        let deviceCount: number | undefined;
        let consentGranted: boolean | undefined;
        try {
          const devices = await listDevices({ available: true, platform: "ios" });
          rpcOk = true;
          consentGranted = true;
          deviceCount = devices.length;
          checks.push({
            name: "JSON-RPC simulator.list",
            ok: true,
            detail: `${devices.length} iOS simulator(s). Node did not call simctl.`,
          });
          checks.push({
            name: "consent",
            ok: true,
            detail: "RPC accepted the request (permissions.json granted or debug skip-consent).",
          });
        } catch (error) {
          const isDenied = error instanceof Object && "code" in error && error.code === ErrorCode.PERMISSION_DENIED;
          consentGranted = isDenied ? false : undefined;
          checks.push({
            name: "JSON-RPC simulator.list",
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            ...(isDenied ? { remedy: "Run `mobile-sim grant` then retry doctor." } : {}),
          });
          checks.push({
            name: "consent",
            ok: !isDenied,
            detail: isDenied
              ? GRANT_INSTRUCTIONS
              : "Could not confirm consent (RPC failed before or without PERMISSION_DENIED).",
          });
        }

        checks.push({
          name: "HID / ui-tree",
          ok: true,
          detail:
            "simulator_tap/swipe/type/press/home pass through RPC to in-process FBSimulatorControl HID. " +
            "simulator_ui_tree calls simulator.uiTree and stays NOT_IMPLEMENTED until axbridge ships. " +
            "This server will not fake those results.",
        });
        checks.push({
          name: "iOS platforms",
          ok: true,
          detail: "This server does not download iOS platforms. Install runtimes from Xcode → Settings → Platforms.",
        });

        const ok = checks.every((check) => check.ok);
        return jsonText({
          ok,
          checks,
          binaryPath: binaryPath ?? null,
          rpcOk,
          consentGranted: consentGranted ?? null,
          deviceCount: deviceCount ?? null,
          grant: "mobile-sim grant",
        });
      });
    },
  };
}

export type ToolHandlers = ReturnType<typeof createHandlers>;

function requireBundleId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw protocolError(ErrorCode.INVALID_REQUEST, "bundleId is required.");
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw protocolError(ErrorCode.INVALID_REQUEST, `${field} is required and must be a number.`);
  }
  return value;
}

function requirePoint(x: unknown, y: unknown): { x: number; y: number } {
  return { x: requireNumber(x, "x"), y: requireNumber(y, "y") };
}
