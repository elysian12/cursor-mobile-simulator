/** One in-flight HID message; keep only the latest queued gesture. */

export interface HidQueue<T> {
  send(message: T): void;
  done(): void;
  reset(): void;
  readonly inflight: boolean;
}

export function createHidQueue<T>(dispatch: (message: T) => void): HidQueue<T> {
  let inflight = false;
  let queued: T | undefined;
  return {
    get inflight() {
      return inflight;
    },
    send(message: T): void {
      if (inflight) {
        queued = message;
        return;
      }
      inflight = true;
      dispatch(message);
    },
    done(): void {
      inflight = false;
      if (queued === undefined) {
        return;
      }
      const next = queued;
      queued = undefined;
      inflight = true;
      dispatch(next);
    },
    reset(): void {
      inflight = false;
      queued = undefined;
    },
  };
}
