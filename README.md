# mobile-simulator

A **Claude-style live iOS Simulator** stack for [Cursor](https://cursor.com): a native Swift owner of Apple’s simulator, a Node MCP server (`mobile-simulator-mcp`), and a React live viewer.

This is a reusable **Swift + MCP + viewer** platform, not a thin `simctl` wrapper. The public CLI is `mobile-sim`. The npm package name stays **`mobile-simulator-mcp`**.

**macOS + Xcode 26 or later only.** Verified on Xcode 27. Android, Flutter, and physical devices are out of scope.

**Do not sign a real Apple ID** into a simulator an agent can control. Treat those devices as disposable.

## Requirements

| | |
| --- | --- |
| OS | macOS 15+ (Apple Silicon or Intel) |
| Xcode | **26.x or later** (this tree is verified on **Xcode 27**) |
| Platforms | Xcode **iOS Simulator** (`iPhoneSimulator.platform`) plus at least one runtime + device |
| Node | 18+ |
| Homebrew tools | [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`xcodegen`) and **ffmpeg** (viewer live frames) |

`mobile-sim` will **not** run `xcodebuild -downloadPlatform` for you. Install runtimes from Xcode → Settings → Platforms (or run `xcodebuild -downloadPlatform iOS` after you confirm you want that download).

## Install and build

```bash
git clone https://github.com/<you>/mobile-simulator.git
cd mobile-simulator
npm install

brew install xcodegen ffmpeg   # once

npm run build:idb              # clones + builds pinned facebook/idb (see vendor/IDB_PIN)
npm run build:native           # swift build -c release
npm run build:mcp              # protocol + mobile-simulator-mcp
```

`scripts/build-idb.sh` clones facebook/idb at the pinned SHA into `vendor/facebook-idb/` (gitignored). Do not commit that clone or its `Build/` products.

Without idb products, `list` / `boot` / `screenshot` still work; tap / swipe / type / press / stream fail loudly (`NOT_ATTACHED`). Success is never faked.

The release binary is:

```
native/simulator-controller/.build/release/mobile-sim
```

Grant unattended control, then use MCP and/or the viewer:

```bash
# put mobile-sim on PATH, or call it via the path above
mobile-sim grant               # writes ~/.mobile-simulator/permissions.json

# Cursor MCP (stdio) — copy .cursor/mcp.json.example and replace placeholders
npm run build:mcp

# Live viewer (default http://127.0.0.1:8787)
export MOBILE_SIMULATOR_BIN="$PWD/native/simulator-controller/.build/release/mobile-sim"
npm run dev:viewer
```

`npx -y mobile-simulator-mcp` is not published yet. Point Cursor at the local `node …/dist/index.js` command.

### Cursor MCP example

Copy [`.cursor/mcp.json.example`](.cursor/mcp.json.example) into `~/.cursor/mcp.json` or a project `.cursor/mcp.json`. Replace `/ABS/PATH/mobile-simulator` with this repo:

```json
{
  "mcpServers": {
    "mobile-simulator": {
      "command": "node",
      "args": ["/ABS/PATH/mobile-simulator/apps/mcp-server/dist/index.js"],
      "env": {
        "MOBILE_SIMULATOR_BIN": "/ABS/PATH/mobile-simulator/native/simulator-controller/.build/release/mobile-sim"
      }
    }
  }
}
```

Do not commit a personal `.cursor/mcp.json` with machine paths. The example file is the documented template.

See [apps/mcp-server/README.md](apps/mcp-server/README.md).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  React viewer  apps/viewer     live frames, session UI      │
│  http://127.0.0.1:8787                                      │
├─────────────────────────────────────────────────────────────┤
│  Node MCP  mobile-simulator-mcp  Cursor tools               │
│  talks JSON-RPC stdio to native — never CoreSimulator       │
├─────────────────────────────────────────────────────────────┤
│  native Swift  mobile-sim                                   │
│  owns UDIDs, boot/shutdown, install/launch, screenshots     │
│  HID: SimulatorHID in-process (facebook/idb). simctl        │
│  fallback only for list/boot/apps/screenshot.               │
└─────────────────────────────────────────────────────────────┘
```

- **Swift owns Apple.** Even when the controller shells out to `xcrun simctl`, Node must not call CoreSimulator.
- **UDIDs are always explicit.** There is no “the currently booted simulator.” The string `booted` is rejected.
- **Input is HID.** `SimHID` sends `SimulatorHIDEvent` through FBSimulatorControl (Indigo / DTUHID). Tap is never reported as success if HID did not send. The CLI will not click Simulator.app or drive AppleScript.
- **Coordinates** are device points, origin top-left. `list` / `boot` include `screen` when size is known.

See [docs/architecture.md](docs/architecture.md) and [docs/native.md](docs/native.md) (facebook/idb pin, DTUHID, Device Hub).

### How this differs from simctl-wrapper MCPs

Most “iOS Simulator MCP” servers are thin Node wrappers around `xcrun simctl`. They often default to `booted`, mix tool-calling with Apple’s device set, and cannot grow into a reliable HID + frame-stream platform.

This project keeps a **native owner** in front of Apple’s stack, a **shared protocol** for MCP and the viewer, a **consent file** before unattended control, and HID / streaming that does not go through GUI automation.

## Consent

Unattended control (JSON-RPC / MCP / viewer gateway) requires:

```
~/.mobile-simulator/permissions.json
```

Create it with `mobile-sim grant`. Revoke with `mobile-sim revoke`. Interactive CLI use from your own terminal does **not** require this file. RPC mode does.

Example file:

```json
{
  "version": 1,
  "allowSimulatorControl": true,
  "grantedAt": "2026-09-19T00:00:00.000Z"
}
```

Do not commit this file. It is per-machine and lives in your home directory.

## Xcode 27 / Device Hub

Pin facebook/idb at `vendor/IDB_PIN` (`92cc718f`) so DTUHID is live. Claude’s pane fails on this Xcode; this stack prefers DTUHID and fails if HID does not send.

**Hide Device Hub on attach. Do not quit it.** Viewer / MCP attach calls `simulator.hideHost` (`NSRunningApplication.hide()`). Quitting Device Hub on Xcode 27 can shut down the guest simulator. Hide the window; the sim stays Booted. `simulator.showHost` reopens `open -a "Device Hub"` without detaching.

Device Hub can hold the exclusive IOSurface. HID still works; live H.264 may yield black / zero frames until the surface is released — the viewer stays on **Snapshot** in that case. Never `simctl shutdown` as part of hide.

## Commands

```bash
mobile-sim doctor
mobile-sim list
mobile-sim boot <UDID>
mobile-sim shutdown <UDID>
mobile-sim install <UDID> <path.app>
mobile-sim launch <UDID> <bundleId>
mobile-sim terminate <UDID> <bundleId>
mobile-sim uninstall <UDID> <bundleId>
mobile-sim screenshot <UDID> [out.png]
mobile-sim tap <UDID> <x> <y>          # device points, origin top-left
mobile-sim swipe <UDID> x1 y1 x2 y2 [duration]
mobile-sim type <UDID> <text>
mobile-sim press <UDID> home|lock|volumeUp|volumeDown
mobile-sim home <UDID>
mobile-sim stream <UDID> [--socket PATH]   # H.264 Annex-B; not screenshot poll
mobile-sim uitree <UDID>                   # NOT_IMPLEMENTED until axbridge ships
mobile-sim rpc                         # JSON-RPC on stdin/stdout
mobile-sim grant                       # write consent file
mobile-sim revoke
```

Add `--json` to `list`, `doctor`, and most mutating commands for machine-readable output.

## Live viewer

Separate React app (not an in-Cursor pane). Gateway default: **http://127.0.0.1:8787**. Needs **ffmpeg** on `PATH` (or `FFMPEG_PATH`) to transcode Annex-B to JPEG.

```bash
export MOBILE_SIMULATOR_BIN="$PWD/native/simulator-controller/.build/release/mobile-sim"
npm run dev:viewer
```

**Live** is shown only after the first non-black H.264 bytes arrive. **Snapshot** is an on-demand `simulator.screenshot` — never a screenshot poll labeled Live. See [apps/viewer/README.md](apps/viewer/README.md).

## Repo layout

| Path | Status |
| --- | --- |
| `native/simulator-controller` | SwiftPM CLI + JSON-RPC (`mobile-sim`) |
| `packages/protocol` | Shared TypeScript types + JSON schema |
| `apps/mcp-server` | MCP server (`mobile-simulator-mcp`) |
| `apps/viewer` | React + Vite viewer + WS gateway |
| `vendor/IDB_PIN` | facebook/idb SHA (clone is gitignored) |
| `docs/` | Architecture and native notes |

## License

[MIT](LICENSE). facebook/idb (FBControlCore / FBSimulatorControl), built from source when you run `build:idb`, is also MIT — see [NOTICE](NOTICE).
