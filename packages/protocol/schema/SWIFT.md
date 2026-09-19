# Swift mapping

TypeScript in `src/` is the named source of truth. Native models live in:

- `native/simulator-controller/Sources/SimulatorController/Models.swift`
- `native/simulator-controller/Sources/SimulatorController/Errors.swift`
- `native/simulator-controller/Sources/RPC/JSONRPC.swift`

Keep these aligned:

| TS | Swift |
| --- | --- |
| `SimulatorDevice` | `SimulatorDevice` |
| `ScreenInfo` | `ScreenInfo` (device points, origin `topLeft`) |
| `ErrorCode.DEVICE_NOT_FOUND` | `SimulatorErrorCode.deviceNotFound` raw value `"DEVICE_NOT_FOUND"` |
| `RPCRequest` | `RPCRequest` |
| `Session` | `Session` (defined, unused in V1) |
| `PermissionsFile` | `PermissionsFile` |

Field names on the wire are camelCase (`deviceId`, `bundleId`, `bootedByServer`). Native accepts `deviceId` or `udid`.

Aligned RPC methods (native / MCP / viewer): `simulator.list`, `simulator.boot`, `simulator.shutdown`, `simulator.screenshot`, `simulator.tap`, `simulator.swipe`, `simulator.type`, `simulator.press`, `simulator.home`, `simulator.uiTree`, `simulator.stream`, `simulator.hideHost`, `simulator.showHost`, `app.install`, `app.launch`, `app.terminate`, `app.uninstall`.

`simulator.hideHost` hides Device Hub.app / Simulator.app (`NSRunningApplication.hide()`). It does **not** quit Device Hub — terminating that host app also shuts down the guest on Xcode 27. It never calls `simctl shutdown`. `simulator.showHost` reopens `open -a "Device Hub"` / `DeviceHub` (or Simulator) without detaching.
