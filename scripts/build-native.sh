#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FBSC="$ROOT/vendor/facebook-idb/Build/Products/Release/FBSimulatorControl.framework"
if [[ -d "$FBSC" ]]; then
  echo "FBSimulatorControl present — HID will link in-process."
else
  echo "FBSimulatorControl not built. HID will fail loudly; simctl fallback stays."
  echo "To enable HID: bash scripts/build-idb.sh"
fi
cd "$ROOT/native/simulator-controller"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/mobile-sim"
echo "Built $BIN"
