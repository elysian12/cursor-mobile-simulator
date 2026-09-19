import type { SimulatorDevice } from "@mobile-simulator/protocol";

interface ToolbarProps {
  devices: SimulatorDevice[];
  selectedId: string;
  udidDraft: string;
  attached: boolean;
  canBoot: boolean;
  canHome: boolean;
  busy: boolean;
  watch: boolean;
  onSelect: (udid: string) => void;
  onUdidDraft: (value: string) => void;
  onAttach: () => void;
  onDetach: () => void;
  onRefresh: () => void;
  onBoot: () => void;
  onHome: () => void;
  onShowHost: () => void;
  onWatch: (enabled: boolean) => void;
}

export function Toolbar({
  devices,
  selectedId,
  udidDraft,
  attached,
  canBoot,
  canHome,
  busy,
  watch,
  onSelect,
  onUdidDraft,
  onAttach,
  onDetach,
  onRefresh,
  onBoot,
  onHome,
  onShowHost,
  onWatch,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="field">
        <label htmlFor="device-picker">Device</label>
        <select
          id="device-picker"
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={attached}
        >
          <option value="">Select a simulator…</option>
          {devices.map((device) => (
            <option key={device.udid} value={device.udid}>
              {device.name} · {device.state} · {device.runtime}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="udid-input">UDID</label>
        <input
          id="udid-input"
          value={udidDraft}
          onChange={(event) => onUdidDraft(event.target.value)}
          placeholder="Explicit UUID"
          autoComplete="off"
          spellCheck={false}
          disabled={attached}
        />
      </div>
      <div className="actions">
        {attached ? (
          <button
            type="button"
            className="btn detach"
            onClick={onDetach}
            disabled={busy}
            title="Stop streaming. Leaves the simulator Booted."
          >
            Detach
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onAttach} disabled={busy || !udidDraft.trim()}>
            Attach
          </button>
        )}
        <button type="button" className="btn" onClick={onRefresh} disabled={busy || !attached}>
          Refresh snapshot
        </button>
        <button type="button" className="btn" onClick={onBoot} disabled={busy || !canBoot}>
          Boot
        </button>
        <button
          type="button"
          className="btn"
          onClick={onHome}
          disabled={busy || !canHome}
          aria-label="Home"
          title="Go Home"
        >
          <svg className="home-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 2.2 2.4 7.1v6.5h4.1V10h3v3.6h4.1V7.1L8 2.2Zm0-1.5 6.8 5.9v8H9.1V10.6H6.9v4h-5.7v-8L8 .7Z"
            />
          </svg>
          Home
        </button>
        <button type="button" className="btn" onClick={onShowHost} disabled={busy} title="Reopen Apple Device Hub without detaching">
          Show Device Hub
        </button>
        <label className="watch">
          <input
            type="checkbox"
            checked={watch}
            onChange={(event) => onWatch(event.target.checked)}
            disabled={!attached}
          />
          Watch (snapshots, not live)
        </label>
      </div>
    </div>
  );
}
