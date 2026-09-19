# mobile-simulator-mcp

Cursor / Claude Desktop MCP server for the **iOS Simulator**. It is a protocol adapter: every Apple-facing call goes to the native CLI over JSON-RPC (`mobile-sim rpc` on stdio). This package never calls CoreSimulator or `xcrun simctl`.

macOS + Xcode + a built `mobile-sim` binary are required.

## Prerequisites

1. **macOS** (the server exits on any other `process.platform`)
2. **Xcode 26+** with the iOS Simulator platform installed by you (this server does **not** run `xcodebuild -downloadPlatform`)
3. A release build of the native CLI:

```bash
# from the repo root
npm run build:native
# binary: native/simulator-controller/.build/release/mobile-sim
```

4. Consent for unattended RPC (native reads `~/.mobile-simulator/permissions.json`):

```bash
mobile-sim grant
```

Consent is global. Device selection is always an explicit `udid` on each tool — never `booted`. Revoke with `mobile-sim revoke`. The MCP server will not write the permissions file for you.

## Build and run

```bash
# from the repo root
npm install
npm run build -w @mobile-simulator/protocol
npm run build -w mobile-simulator-mcp

# stdio MCP server (Cursor spawns this)
MOBILE_SIMULATOR_BIN=native/simulator-controller/.build/release/mobile-sim \
  node apps/mcp-server/dist/index.js
```

Tests (Swift RPC is mocked):

```bash
npm test -w mobile-simulator-mcp
```

## Point Cursor at this server

Add a stdio server in **`~/.cursor/mcp.json`** (user-level, once per Mac — not a project file in every iOS app). Example using the local binary — also in [`.cursor/mcp.json.example`](../../.cursor/mcp.json.example). `npx -y mobile-simulator-mcp` is the intended command and is **not published yet**. The Add to Cursor deeplink is in the [root README](../../README.md).

```json
{
  "mcpServers": {
    "mobile-simulator": {
      "command": "node",
      "args": [
        "/ABS/PATH/mobile-simulator/apps/mcp-server/dist/index.js"
      ],
      "env": {
        "MOBILE_SIMULATOR_BIN": "/ABS/PATH/mobile-simulator/native/simulator-controller/.build/release/mobile-sim"
      }
    }
  }
}
```

If `MOBILE_SIMULATOR_BIN` is unset, the server looks for a sibling `mobile-sim`, then walks up for `native/simulator-controller/.build/release/mobile-sim`.

Debug-only (do not use in the production path): `MOBILE_SIMULATOR_SKIP_CONSENT=1` passes `--no-consent` to `mobile-sim rpc`.

## Agent workflow

1. `doctor` — preflight macOS, binary, RPC, consent
2. `simulator_list` — copy an explicit UDID
3. `simulator_attach` with that `udid` (boots if needed; exclusive lock)
4. Device-scoped tools, always with the same `udid`
5. After every tap / swipe / type / press / home: **`simulator_screenshot` again**. Tap success can be a lie on Xcode 27.
6. `simulator_detach` — shuts the simulator down **only if this server booted it** (`bootedByServer`)

## Tools

| Tool | Native RPC | Live today? |
| --- | --- | --- |
| `simulator_list` | `simulator.list` | Yes |
| `simulator_attach` | `simulator.list` + optional `simulator.boot` + `simulator.hideHost` | Yes (session is MCP-side; hides Device Hub, does not shut down the guest) |
| `simulator_detach` | optional `simulator.shutdown` | Yes (session is MCP-side) |
| `simulator_boot` | `simulator.boot` | Yes (requires attach) |
| `simulator_shutdown` | `simulator.shutdown` | Yes (requires attach) |
| `app_install` | `app.install` | Yes |
| `app_launch` | `app.launch` | Yes |
| `app_terminate` | `app.terminate` | Yes |
| `app_uninstall` | `app.uninstall` | Yes |
| `simulator_screenshot` | `simulator.screenshot` | Yes — MCP **image** + caption (`name` + UDID) |
| `simulator_status` | `simulator.list` + session | Yes |
| `doctor` | `simulator.list` + local checks | Yes |
| `simulator_tap` | `simulator.tap` | Yes — in-process FBSimulatorControl HID (re-screenshot to verify) |
| `simulator_swipe` | `simulator.swipe` | Yes — real HID |
| `simulator_type` | `simulator.type` | Yes — real HID (DTUHID on Xcode 27) |
| `simulator_press` | `simulator.press` | Yes — `home`, `lock`, `volumeUp`, `volumeDown`, `side` |
| `simulator_home` | `simulator.home` | Yes — alias of `simulator.press` home |
| `simulator_ui_tree` | `simulator.uiTree` | Honest `NOT_IMPLEMENTED` until axbridge ships. No fake tree. |

Gestures are **not faked**. `PERMISSION_DENIED` is returned as that code plus `mobile-sim grant` instructions.

## Open the viewer

This MCP server does not embed a pane. To watch the same UDID, run the separate React viewer:

```bash
export MOBILE_SIMULATOR_BIN=/ABS/PATH/mobile-simulator/native/simulator-controller/.build/release/mobile-sim
npm run dev -w @mobile-simulator/viewer
# http://127.0.0.1:8787
```

See [apps/viewer/README.md](../viewer/README.md).

## Product rules

- `udid` is required on every device-scoped tool after list/attach. There is no “the booted simulator.”
- Attach locks a UDID (`DEVICE_LOCKED` on a second attach).
- Shutdown-on-detach only when `bootedByServer` is true.
- Node talks to Swift only via `mobile-sim rpc`.
