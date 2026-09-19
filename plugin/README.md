# Mobile Simulator (Cursor plugin)

Thin Cursor plugin: skill + rule + MCP launch config. **No `mobile-sim` binary** and no Swift sources.

| File | Role |
| --- | --- |
| `.cursor-plugin/plugin.json` | Cursor Plugin manifest (`ios`, `simulator`, `mcp`) |
| `assets/logo.jpg` | Marketplace / Customize logo |
| `plugin.json` | Agent Plugins manifest |
| `mcp.json` | Stdio MCP (`npx -y mobile-simulator-mcp` + `MOBILE_SIMULATOR_BIN`) |
| `skills/run-on-simulator/SKILL.md` | “run this on the simulator” workflow |
| `rules/prefer-mobile-simulator.mdc` | Prefer this MCP over `simctl` / Xcode `BuildProject` |

Set **Plugins → Configure → `MOBILE_SIMULATOR_BIN`** to the installed native CLI. This plugin cannot ship `mobile-sim`; build it from [this repo](https://github.com/elysian12/cursor-mobile-simulator) or a future GitHub Release.

`mobile-simulator-mcp` is **not on npm yet**. Until it is, point Cursor at the local Node server instead of `npx` (see the repo README). After publish, `mcp.json` as shipped is the intended command.

Install once at **user** scope. Do not add this plugin to every iOS app repo.
