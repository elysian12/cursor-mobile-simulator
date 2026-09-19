#!/usr/bin/env bash
# Build facebook/idb FBControlCore + FBSimulatorControl from the pinned SHA.
# Does not wrap the idb Python CLI or idb_companion gRPC.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_FILE="$ROOT/vendor/IDB_PIN"
VENDOR="$ROOT/vendor/facebook-idb"
REPO="https://github.com/facebook/idb"

if [[ ! -f "$PIN_FILE" ]]; then
  echo "error: missing $PIN_FILE" >&2
  exit 1
fi

SHA="$(awk -F= '/^sha=/{print $2}' "$PIN_FILE")"
if [[ -z "$SHA" ]]; then
  echo "error: no sha= in $PIN_FILE" >&2
  exit 1
fi

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "error: XcodeGen is required to generate FBSimulatorControl.xcodeproj." >&2
  echo "Install: brew install xcodegen" >&2
  exit 1
fi

if [[ ! -d "$VENDOR/.git" ]]; then
  echo "Cloning facebook/idb into $VENDOR"
  git clone --filter=blob:none "$REPO" "$VENDOR"
fi

CURRENT="$(git -C "$VENDOR" rev-parse HEAD)"
if [[ "$CURRENT" != "$SHA" ]]; then
  echo "Checking out pinned SHA $SHA"
  git -C "$VENDOR" fetch --filter=blob:none origin "$SHA"
  git -C "$VENDOR" checkout --detach "$SHA"
fi

cd "$VENDOR"

echo "Generating Xcode projects (xcodegen)…"
./build.sh generate

echo "Building FBControlCore + FBSimulatorControl (Release)…"
./build.sh build FBControlCore
./build.sh build FBSimulatorControl

PRODUCTS=""
for candidate in "$VENDOR/Build/Products/Release" "$VENDOR/Build/Products/Debug"; do
  if [[ -f "$candidate/libFBSimulatorControl.a" || -d "$candidate/FBSimulatorControl.framework" ]]; then
    PRODUCTS="$candidate"
    break
  fi
done

if [[ -z "$PRODUCTS" ]]; then
  echo "error: expected libFBSimulatorControl.a or FBSimulatorControl.framework under Build/Products" >&2
  echo "Look under $VENDOR/Build for xcodebuild products." >&2
  exit 1
fi

echo
echo "FBSimulatorControl ready in $PRODUCTS:"
ls -1 "$PRODUCTS" | sed 's/^/  /'
echo
echo "Rebuild mobile-sim so Package.swift can detect the frameworks:"
echo "  npm run build:native"
echo
echo "Do not enable Library Validation when signing; private CoreSimulator"
echo "frameworks must stay loadable. Do not wrap idb / idb_companion."
echo
echo "If HID or H.264 attach fails on Xcode 27: close DeviceHub.app and boot"
echo "headless (simctl boot). DeviceHub can take the exclusive IOSurface."
