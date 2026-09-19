#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";
import { parseWSMessage, type WSServerMessage } from "@mobile-simulator/protocol";
import { GRANT_HINT } from "./errors.js";
import { locateMobileSimBinary } from "./locate-binary.js";
import { createRelay, type ViewerRelay } from "./relay.js";
import { NativeRpcClient } from "./rpc-client.js";

export const VIEWER_PORT_ENV = "MOBILE_SIMULATOR_VIEWER_PORT";
const DEFAULT_PORT = 8787;
const HOST = "127.0.0.1";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = existsSync(resolve(here, "../package.json")) ? resolve(here, "..") : resolve(here, "../..");

function viewerPort(): number {
  const raw = process.env[VIEWER_PORT_ENV];
  if (!raw) {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`${VIEWER_PORT_ENV} must be an integer port, got '${raw}'.`);
  }
  return parsed;
}

function sendJson(ws: WebSocket, message: WSServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendBinary(ws: WebSocket, bytes: Uint8Array): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(bytes);
  }
}

async function main(): Promise<void> {
  const port = viewerPort();
  const isDev = process.env.NODE_ENV !== "production";

  let rpc: NativeRpcClient | undefined;
  let binaryPath: string | undefined;
  let rpcError: string | undefined;
  try {
    binaryPath = locateMobileSimBinary();
    rpc = NativeRpcClient.spawn({ bin: binaryPath });
  } catch (error) {
    rpcError = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[viewer] ${rpcError}\n`);
  }

  const clients = new Set<WebSocket>();

  const broadcastJson = (message: WSServerMessage): void => {
    for (const client of clients) {
      sendJson(client, message);
    }
  };
  const broadcastBinary = (bytes: Uint8Array): void => {
    for (const client of clients) {
      sendBinary(client, bytes);
    }
  };

  const relay: ViewerRelay | undefined = rpc
    ? createRelay(rpc, broadcastJson, broadcastBinary)
    : undefined;

  const server = createServer((req, res) => {
    void handleHttp(req, res, {
      isDev,
      binaryPath,
      rpcError,
      port,
    });
  });

  let viteMiddleware: ((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void) | undefined;
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      configFile: resolve(packageRoot, "vite.config.ts"),
      root: packageRoot,
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    viteMiddleware = vite.middlewares;
  }

  async function handleHttp(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: { isDev: boolean; binaryPath?: string | undefined; rpcError?: string | undefined; port: number },
  ): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: !ctx.rpcError,
          port: ctx.port,
          binaryPath: ctx.binaryPath ?? null,
          rpc: ctx.rpcError ? "unavailable" : "ready",
          error: ctx.rpcError ?? null,
        }),
      );
      return;
    }

    if (ctx.isDev && viteMiddleware) {
      viteMiddleware(req, res, (err) => {
        if (err) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end(err instanceof Error ? err.message : String(err));
        }
      });
      return;
    }

    await serveStatic(req, res);
  }

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    if (url.pathname !== "/ws") {
      // Vite HMR uses other upgrade paths on the same HTTP server. Do not destroy them.
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    sendJson(ws, {
      type: "connection_state",
      state: rpcError ? "error" : "connected",
      message: rpcError ?? `Gateway on http://${HOST}:${port}`,
    });
    if (rpcError) {
      sendJson(ws, {
        type: "error",
        code: "INTERNAL_ERROR",
        message: rpcError,
      });
    } else if (relay) {
      // viewer_hello also lists; one in-flight list is enough (see relay.list).
      void relay.list(true, "ios").catch(() => undefined);
    }

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        sendJson(ws, {
          type: "error",
          code: "INVALID_REQUEST",
          message: "Browser should send control as JSON text. Binary frames are server → client media only.",
        });
        return;
      }
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const message = parseWSMessage(raw);
      if (!message) {
        sendJson(ws, {
          type: "error",
          code: "INVALID_REQUEST",
          message: "Unrecognized or invalid control JSON.",
        });
        return;
      }
      if (!relay) {
        sendJson(ws, {
          type: "error",
          code: "INTERNAL_ERROR",
          message: rpcError ?? "mobile-sim rpc is not running.",
        });
        return;
      }
      void handleClientMessage(relay, message).catch((error) => {
        sendJson(ws, {
          type: "error",
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    });

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    process.stdout.write(`mobile-simulator viewer  ${url}\n`);
    process.stdout.write(`  WebSocket control+media  ws://${HOST}:${port}/ws\n`);
    process.stdout.write(`  Frames are binary (MSF1). Control is text JSON. Live ≠ snapshot.\n`);
    if (binaryPath) {
      process.stdout.write(`  mobile-sim  ${binaryPath}\n`);
    }
    if (rpcError) {
      process.stdout.write(`  RPC unavailable: ${rpcError}\n`);
    }
    process.stdout.write(`  Consent: if PERMISSION_DENIED, run  mobile-sim grant\n`);
  });

  const shutdown = async (): Promise<void> => {
    for (const client of clients) {
      client.close();
    }
    await relay?.close();
    await rpc?.close();
    server.close();
  };
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}

async function handleClientMessage(
  relay: ViewerRelay,
  message: ReturnType<typeof parseWSMessage>,
): Promise<void> {
  if (!message) {
    return;
  }
  switch (message.type) {
    case "viewer_hello":
    case "viewer_list":
      await relay.list(message.type === "viewer_list" ? message.available : true, message.type === "viewer_list" ? message.platform : "ios");
      return;
    case "viewer_attach":
      await relay.attach(message.deviceId);
      return;
    case "viewer_detach":
      relay.detach();
      return;
    case "viewer_refresh":
      await relay.refresh();
      return;
    case "viewer_watch":
      relay.setWatch(message.enabled, message.intervalMs);
      return;
    case "viewer_boot":
      await relay.boot();
      return;
    case "control_tap":
      await relay.tap(message.x, message.y);
      return;
    case "control_swipe":
      await relay.swipe(message.x1, message.y1, message.x2, message.y2, message.duration);
      return;
    case "control_home":
      await relay.home();
      return;
    case "viewer_show_host":
      await relay.showHost();
      return;
    default:
      return;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const clientDir = resolve(packageRoot, "dist/client");
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const requested = decodeURIComponent(url.pathname);
  const safe = requested === "/" ? "/index.html" : requested;
  const filePath = resolve(clientDir, `.${safe}`);
  if (!filePath.startsWith(clientDir)) {
    res.writeHead(403).end();
    return;
  }
  const fallback = resolve(clientDir, "index.html");
  const target = existsSync(filePath) && statSync(filePath).isFile() ? filePath : fallback;
  if (!existsSync(target)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Viewer client is not built. Run `npm run build -w @mobile-simulator/viewer` or `npm run dev`.");
    return;
  }
  const ext = target.slice(target.lastIndexOf("."));
  res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
  if (target.endsWith(".html")) {
    res.end(await readFile(target));
    return;
  }
  createReadStream(target).pipe(res);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  if (String(error).includes("PERMISSION_DENIED")) {
    process.stderr.write(`${GRANT_HINT}\n`);
  }
  process.exit(1);
});
