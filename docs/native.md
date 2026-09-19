# Native HID + FBSimulatorControl

Hybrid stack: **FBSimulatorControl first**, `simctl` fallback only for list / boot / shutdown / apps / still screenshots.

## What is linked

facebook/idb Swift frameworks **in-process**:

- `FBControlCore`
- `FBSimulatorControl`

Pinned SHA: see [`vendor/IDB_PIN`](../vendor/IDB_PIN) (`92cc718f` — Xcode 27 DTUHID liveness).

This is **not** a wrapper of the idb Python CLI and **not** `idb_companion` gRPC.

Input path: `SimulatorHID` + `SimulatorHIDEvent` (Indigo / DTUHID).  
Screenshot: `simctl io screenshot` (no CoreImage, no `FBSurfaceImageGenerator` as default).  
Live stream (when frameworks are linked): `SimulatorVideoStream` H.264 Annex-B. Not BGRA, not screenshot polling.

## Build FBSC

```bash
# once: XcodeGen
brew install xcodegen

# clone + generate + build frameworks (gitignored under vendor/facebook-idb)
bash scripts/build-idb.sh

# then rebuild mobile-sim so Package.swift sees the frameworks
npm run build:native
```

The clone is **not** a git submodule. `vendor/IDB_PIN` is the only committed pin. Do not upload the facebook/idb tree or its `Build/` products.

`Package.swift` sets `MOBILE_SIM_HAS_FBSC` when either product exists:

- `vendor/facebook-idb/Build/Products/{Release,Debug}/libFBSimulatorControl.a` (current idb; static lib)
- or `FBSimulatorControl.framework` (older idb)

It links `FBControlCore.framework`, `libFBSimulatorControl.a`, `libCompanionUtilities.a`, plus the vendored CoreSimulator / AccessibilityPlatformTranslation tbds (`-weak_library`, `-ObjC`, `-all_load`).

Without those products, list/boot/install/screenshot still work; tap/swipe/type/press **fail loudly** (`NOT_ATTACHED`). Success is never faked.

Do **not** enable Library Validation when signing the CLI. Private CoreSimulator / SimulatorKit must stay loadable.

## Xcode 27 notes

This Mac is Xcode 27. Claude’s pane fails here; pin recent idb (DTUHID).

- From CoreSimulator **1155.4**, the guest hands the legacy keyboard to `dtuhidd`. Indigo keyboard is a silent no-op. We prefer DTUHID and fail if HID does not send.
- `dtuhidd` can abort during boot if no display is up yet. Pinned idb retries a liveness barrier instead of dropping events.
- **DeviceHub** (`com.apple.dt.Devices`) can take the exclusive IOSurface. HID still works with DeviceHub open (verified on Xcode 27). Viewer / MCP attach calls `simulator.hideHost` (`NSRunningApplication.hide()`). We do **not** quit Device Hub — on Xcode 27, terminating DeviceHub.app also shuts down the guest. Hide the window; the sim stays Booted. If live frames stay black, the viewer uses Snapshot. `simulator.showHost` reopens `open -a "Device Hub"` / `DeviceHub` without detaching. Never `simctl shutdown` as part of hide.
- `mobile-sim stream <UDID>` writes Annex-B to **stdout** (session metadata on stderr). `mobile-sim stream <UDID> --socket PATH` and RPC `simulator.stream` with `socket` bind an **AF_UNIX** listener and write Annex-B there — never mixed with JSON-RPC on stdout. The viewer attaches to that socket and wraps chunks as binary MSF1 (`h264_annexb`). Still screenshots via simctl remain available. There is **no screenshot-poll live stream**.
- UI tree needs `SimulatorFrameworkBridge` (axbridge) next to the binary. That helper is a large facebook/idb vendor product (`./build.sh build SimulatorFrameworkBridge`) and is **not shipped**. `simulator.uiTree` / `mobile-sim uitree` return a clear `NOT_IMPLEMENTED`. No fake tree.

## Coordinates

Device **points**, origin **top-left**. Booted devices report `screen` via `simctl getenv SIMULATOR_MAINSCREEN_{WIDTH,HEIGHT,SCALE}` (pixels ÷ scale). Shutdown devices use a known-size table when the device type is recognized.

## Live test

```bash
bash scripts/test-hid-live.sh
```

Prefers iPhone SE; boots if needed; screenshot → tap → screenshot; shuts down only if the script booted the device.
