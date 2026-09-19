# Architecture

Three layers, one owner of Apple’s simulator stack.

## 1. Native Swift (`native/simulator-controller`)

Public binary: `mobile-sim`.

This layer **owns simulator state**:

- Resolves Xcode (`DEVELOPER_DIR`, `xcode-select -p`, `/Applications/Xcode.app` — not only `/var/db/xcode_select_link`)
- Talks to devices by **explicit UDID**
- Lifecycle and apps via `xcrun simctl` (list, boot, shutdown, install, launch, terminate, uninstall, screenshot)
- JSON-RPC on stdin/stdout so a future Node MCP can attach without importing CoreSimulator
- Input behind `InputInjecting` / `SimHID` — **FBSimulatorControl first** (`SimulatorHID` + `SimulatorHIDEvent`, Indigo / DTUHID). simctl is never used for tap. If HID does not send, the command fails (`NOT_ATTACHED`). No AppleScript / GUI clicking.
- Screenshot: `simctl io screenshot` (reliable still). Live frames: `SimulatorVideoStream` H.264 Annex-B when FBSC is linked — not BGRA, not screenshot polling.

Modules: `SimDiscovery`, `SimLifecycle`, `SimApps`, `SimHID`, `SimCapture`. Production facade: `HybridController`.

Build FBSC from the pinned facebook/idb SHA: [native.md](native.md).

## 2. Node MCP (`apps/mcp-server`)

`mobile-simulator-mcp` exposes Cursor / Claude Desktop tools. It:

- Spawns `mobile-sim rpc` and speaks the shared protocol in `packages/protocol`
- Never calls `xcrun simctl`, CoreSimulator, or private Apple frameworks itself
- Requires an explicit `udid` on every device-scoped tool and an attach session for control
- Passes tap/swipe/type/press/home/ui-tree through RPC (does not fake HID)

See [mcp.md](mcp.md) and [apps/mcp-server/README.md](../apps/mcp-server/README.md).

## 3. React viewer (`apps/viewer`)

Standalone Vite + React app on `http://127.0.0.1:8787` (`MOBILE_SIMULATOR_VIEWER_PORT`). A small Node gateway serves the UI, speaks JSON-RPC to `mobile-sim rpc`, and relays:

- **Text JSON** control: `device_status`, `agent_action`, `control_tap` / `control_swipe`, stream status, `host_status` (Device Hub hide/show)
- **Binary** media: `MSF1` frames (PNG stills or H.264 Annex-B). Images are never inlined in JSON.

**Live** is only shown after the first H.264 Annex-B bytes arrive on the `simulator.stream` Unix socket. Otherwise the badge is **Snapshot** (on-demand `simulator.screenshot`) or **Disconnected**. A slow Watch checkbox (≥1s) is snapshots, not live.

See [apps/viewer/README.md](../apps/viewer/README.md).

## Shared protocol (`packages/protocol`)

TypeScript types plus a JSON schema. Swift models are documented as mirrors (same field names and error codes).

- Devices: `SimulatorDevice { udid, name, runtime, state, screen? }` (points, origin top-left)
- RPC: request / result / error (`DEVICE_NOT_FOUND`, `DEVICE_NOT_BOOTED`, `PERMISSION_DENIED`, `NOT_ATTACHED`, `APP_NOT_FOUND`, `NOT_IMPLEMENTED`, …)
- Methods: `simulator.*`, `app.*`
- Session (later): `id`, `deviceUDID`, `createdAt`, `owner`, `attached`, `bootedByServer`
- WS: `device_status`, `agent_action`, plus viewer control / `stream_status` / `frame_meta` (media is binary `MSF1`, not JSON)

## Consent

`~/.mobile-simulator/permissions.json` is required for RPC/MCP. The human-driven CLI does not need it.

## Why a native owner

Node-only simctl wrappers blur the boundary with Apple’s device set, default to “whichever simulator is booted,” and cannot host HID or frame streaming safely. Keeping Swift in front of CoreSimulator lets MCP stay a protocol adapter.
