---
name: run-on-simulator
description: >-
  Installs, launches, and drives the iOS Simulator from Cursor: boot the sim,
  tap the UI, and screenshot a running iOS app. Use when the user says
  "run this on the simulator", "boot the sim", "tap the UI", or wants a
  screenshot of an iOS app. Prefer the mobile-simulator MCP over xcrun simctl
  and over Xcode MCP BuildProject for HID, screenshot, and launch.
---

# Run on simulator

macOS + Xcode + a user-level `mobile-simulator` MCP only. Do not clone
https://github.com/elysian12/cursor-mobile-simulator into the current project.
Do not sign a real Apple ID into a simulator an agent can control.

## Prefer these tools

Use the **mobile-simulator** MCP (`doctor`, `simulator_*`, `app_*`).

Do **not** use `xcrun simctl` or the terminal for boot, HID, screenshot, or launch.
Do **not** use Xcode MCP `BuildProject` (or other xcode-tools) for HID, screenshot,
install, or launch. Xcode MCP is for build / test / preview only.

## Workflow

1. `doctor` — stop if not macOS, `mobile-sim` is missing, or consent is missing (`mobile-sim grant`).
2. `simulator_list` — copy an explicit UDID.
3. `simulator_attach` with that `udid`. Never pass `booted`. Never omit `udid`.
4. `app_install` / `app_launch` when the user wants an app running.
5. Drive the UI with `simulator_tap` / `simulator_swipe` / `simulator_type` / `simulator_press` / `simulator_home`. Coordinates are device points, origin top-left.
6. After **every** HID call, call `simulator_screenshot` with the same `udid`. Gesture success can be a lie on Xcode 27.
7. `simulator_detach` when done. Shutdown happens only if this server booted the device.

`simulator_ui_tree` is not implemented. Do not fake an accessibility tree.

## Example

User: “run this on the simulator”

1. `doctor`
2. `simulator_list` → copy one UDID
3. `simulator_attach` with that `udid`
4. `app_install` / `app_launch` if a `.app` or bundle id is in the workspace
5. `simulator_tap` → `simulator_screenshot` (same after swipe / type / press / home)
6. `simulator_detach`

## Do not

- Pass `booted` as a UDID or assume “the booted simulator”
- Clone or rebuild this repo per iOS project
- Call CoreSimulator / `simctl` from Node or the shell when MCP tools exist
- Quit Device Hub to “fix” a black frame (attach already hides it)
