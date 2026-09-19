# Simulator viewer

Separate React + TypeScript app (Vite) that shows a simulator framebuffer and sends tap/swipe back through `mobile-sim rpc`. This is **not** an in-Cursor pane.

Default URL: [http://127.0.0.1:8787](http://127.0.0.1:8787)  
Port override: `MOBILE_SIMULATOR_VIEWER_PORT`.

## How to run

From the repo root:

Needs **ffmpeg** on `PATH` (or `FFMPEG_PATH`) so the gateway can transcode H.264 Annex-B to JPEG (`brew install ffmpeg`).

```bash
npm install
npm run build:native          # mobile-sim
mobile-sim grant              # ~/.mobile-simulator/permissions.json

# optional, if the binary is not on the default release path
export MOBILE_SIMULATOR_BIN="$PWD/native/simulator-controller/.build/release/mobile-sim"

npm run dev -w @mobile-simulator/viewer
```

The gateway prints the URL, for example:

```
mobile-simulator viewer  http://127.0.0.1:8787
```

Production:

```bash
npm run build -w @mobile-simulator/viewer
NODE_ENV=production npm start -w @mobile-simulator/viewer
```

`MOBILE_SIMULATOR_SKIP_CONSENT=1` passes `--no-consent` to `mobile-sim rpc` (debug only).

If you see `PERMISSION_DENIED`, run `mobile-sim grant` in a terminal. The viewer will not write the consent file.

## Live vs Snapshot

| Badge | Meaning |
| --- | --- |
| **Live** | A Unix-socket `simulator.stream` delivered a *non-black* painted JPEG (H.264 Annex-B via `SimulatorVideoStream`). Not a screenshot poll. Near-black DeviceHub IOSurface frames stay Snapshot. |
| **Snapshot** | Still PNG from on-demand `simulator.screenshot`. Not a live path. |
| **Disconnected** | No device, no stream, or the device is not booted. |

Watch mode (off by default, interval ≥1s) is labeled **“Watch (snapshots, not live)”**. It is a slow snapshot loop for development. It is never shown as Live.

The gateway asks native for `simulator.stream` with a **Unix socket** path. H.264 never shares stdout with JSON-RPC. Incoming Annex-B is transcoded to JPEG and sent as binary **MSF1** (`jpeg`). Control is WebSocket **text JSON** (`device_status`, `agent_action`, `control_tap`, …). Large images are never inlined in JSON. If decoded frames are near-black (DeviceHub IOSurface), the gateway keeps **Snapshot** and serves a simctl PNG instead of Live + black.

MCP/CLI HID on the same UDID writes `~/.mobile-simulator/last-action.json`; the viewer overlays `Agent: tap (x, y)` when that file updates.

## Controls

1. Device picker is filled from `simulator.list`.
2. Attach an **explicit UDID** (never `booted`). Attach hides Apple Device Hub / Simulator.app so you control the device in this pane. Status: **Apple Device Hub hidden — control this pane**. Device Hub is hidden, not quit — quitting it on Xcode 27 also shuts down the guest.
3. **Show Device Hub** reopens `open -a "Device Hub"` without detaching. Detach leaves the sim Booted and can leave Device Hub hidden.
4. Click **Refresh snapshot** for a still. Boot if the device is shut down.
5. Pointer down → tap; drag → swipe. Coordinates are **device points**, origin top-left, converted from the displayed box using the reported `screen` space.
6. If tap/swipe returns `NOT_IMPLEMENTED` or `NOT_ATTACHED`, the UI shows that error. Gestures are not faked.

The viewer shares the device with MCP by talking to the same native RPC. Agent overlay: `Agent: tap (x, y)` after a control event.

## Tests

```bash
npm test -w @mobile-simulator/viewer
```

Unit tests cover CSS pixel → device-point mapping, WebSocket text parsing, and binary frame encode/decode.
