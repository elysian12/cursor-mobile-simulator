# Contributing

macOS 15+ and Xcode 26+ are required. This repo does not build on Linux or Windows.

## Native + HID

```bash
brew install xcodegen ffmpeg
npm install
npm run build:idb      # clones pinned facebook/idb into vendor/facebook-idb (gitignored)
npm run build:native   # release mobile-sim
```

Do not commit `vendor/facebook-idb/` or FBSimulatorControl build trees. The pin is `vendor/IDB_PIN`; the clone script is `scripts/build-idb.sh`.

## Tests

```bash
npm run test:native    # Swift unit tests
npm run test:mcp       # MCP server (Swift RPC mocked)
npm run test:viewer    # viewer unit tests
npm run typecheck
```

Optional live HID (boots a simulator; shuts it down only if the script booted it):

```bash
npm run test:hid-live
```

Do not shut down a guest someone else is using. Do not quit Device Hub to “fix” a black live stream — hide it (`simulator.hideHost`). Quitting Device Hub on Xcode 27 can shut the guest down.

## Consent and local config

Unattended RPC needs `mobile-sim grant` (`~/.mobile-simulator/permissions.json`). Do not commit that file, `last-action.json`, Unix sockets, screenshots, or a project `.cursor/mcp.json` with absolute machine paths. Use [`.cursor/mcp.json.example`](.cursor/mcp.json.example) and placeholders.

## Docs and paths

Keep examples free of `/Users/…` home paths. Use `/ABS/PATH/mobile-simulator` or `$PWD`.
