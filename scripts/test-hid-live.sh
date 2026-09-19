#!/usr/bin/env bash
# Boot a small simulator (iPhone SE if present), screenshot, tap, screenshot.
# Shuts down only a device this script booted. Never fakes tap success.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/native/simulator-controller"

BIN="$(swift build --show-bin-path)/mobile-sim"
if [[ ! -x "$BIN" ]]; then
  swift build
  BIN="$(swift build --show-bin-path)/mobile-sim"
fi

echo "Using $BIN"
"$BIN" doctor || true

LIST="$("$BIN" list --json)"
python3 - "$BIN" <<'PY'
import json, os, subprocess, sys, tempfile

bin_path = sys.argv[1]
raw = subprocess.check_output([bin_path, "list", "--json"], text=True)
devices = json.loads(raw)["devices"]
if not devices:
    print("No iOS simulators", file=sys.stderr)
    sys.exit(1)

def pick(devs):
    se = [d for d in devs if "SE" in d["name"]]
    if se:
        return se[0]
    booted = [d for d in devs if d["state"] == "Booted"]
    if booted:
        return booted[0]
    return devs[0]

device = pick(devices)
udid = device["udid"]
already = device["state"] == "Booted"
print(f"Live device: {device['name']} {udid} ({device['state']})")
if device.get("screen"):
    print(f"Screen: {device['screen']}")

booted_by_us = False
if not already:
    subprocess.check_call([bin_path, "boot", udid])
    booted_by_us = True

try:
    tmp = tempfile.mkdtemp(prefix="mobile-sim-live-")
    before = os.path.join(tmp, "before.png")
    after = os.path.join(tmp, "after.png")
    subprocess.check_call([bin_path, "screenshot", udid, before])
    print(f"screenshot before: {before} ({os.path.getsize(before)} bytes)")

    refreshed = json.loads(subprocess.check_output([bin_path, "list", "--json"], text=True))["devices"]
    current = next(d for d in refreshed if d["udid"] == udid)
    screen = current.get("screen") or {}
    x = float(screen.get("width") or 200) / 2
    y = float(screen.get("height") or 400) / 2
    print(f"tap {x} {y} (device points, origin top-left)")

    tap = subprocess.run([bin_path, "tap", udid, str(x), str(y)], capture_output=True, text=True)
    print(tap.stdout)
    print(tap.stderr, file=sys.stderr)
    if tap.returncode != 0:
        print(f"HID tap FAILED (exit {tap.returncode}) — not treated as success")
        hid_ok = False
    else:
        hid_ok = True

    subprocess.check_call([bin_path, "screenshot", udid, after])
    print(f"screenshot after: {after} ({os.path.getsize(after)} bytes)")
    print(f"Xcode HID: {'yes' if hid_ok else 'no'}")
    if not hid_ok:
        sys.exit(tap.returncode)
finally:
    if booted_by_us:
        subprocess.call([bin_path, "shutdown", udid])
        print(f"Shutdown {udid} (booted by this script)")
PY

echo "Also running Swift live test (MOBILE_SIM_LIVE=1)"
MOBILE_SIM_LIVE=1 swift test --filter LiveHIDTests
