import { describe, expect, it } from "vitest";
import { createHidQueue } from "./hid-queue";

describe("HID queue", () => {
  it("dispatches immediately when idle", () => {
    const sent: string[] = [];
    const queue = createHidQueue<string>((message) => sent.push(message));
    queue.send("tap-1");
    expect(sent).toEqual(["tap-1"]);
    expect(queue.inflight).toBe(true);
  });

  it("coalesces while a gesture is in flight and sends the latest on done", () => {
    const sent: string[] = [];
    const queue = createHidQueue<string>((message) => sent.push(message));
    queue.send("tap-1");
    queue.send("tap-2");
    queue.send("tap-3");
    expect(sent).toEqual(["tap-1"]);
    queue.done();
    expect(sent).toEqual(["tap-1", "tap-3"]);
    queue.done();
    expect(sent).toEqual(["tap-1", "tap-3"]);
  });

  it("reset drops a queued gesture", () => {
    const sent: string[] = [];
    const queue = createHidQueue<string>((message) => sent.push(message));
    queue.send("tap-1");
    queue.send("tap-2");
    queue.reset();
    queue.done();
    expect(sent).toEqual(["tap-1"]);
  });
});
