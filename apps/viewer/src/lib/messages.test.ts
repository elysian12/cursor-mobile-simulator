import { describe, expect, it } from "vitest";
import { parseWSMessage } from "@mobile-simulator/protocol";

describe("parseWSMessage", () => {
  it("parses device_status", () => {
    const message = parseWSMessage(
      JSON.stringify({
        type: "device_status",
        sessionId: "s1",
        device: {
          udid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          name: "iPhone 17 Pro",
          runtime: "iOS 26.5",
          state: "Booted",
          screen: { width: 402, height: 874, scale: 3, origin: "topLeft" },
        },
      }),
    );
    expect(message?.type).toBe("device_status");
    if (message?.type === "device_status") {
      expect(message.device.name).toBe("iPhone 17 Pro");
      expect(message.sessionId).toBe("s1");
    }
  });

  it("parses agent_action tap payload", () => {
    const message = parseWSMessage(
      JSON.stringify({
        type: "agent_action",
        sessionId: "s1",
        action: "tap",
        payload: { x: 10, y: 20 },
      }),
    );
    expect(message).toEqual({
      type: "agent_action",
      sessionId: "s1",
      action: "tap",
      payload: { x: 10, y: 20 },
    });
  });

  it("parses control_tap and control_swipe", () => {
    expect(parseWSMessage(JSON.stringify({ type: "control_tap", x: 1.5, y: 2 }))).toEqual({
      type: "control_tap",
      x: 1.5,
      y: 2,
    });
    expect(
      parseWSMessage(JSON.stringify({ type: "control_swipe", x1: 0, y1: 0, x2: 10, y2: 20, duration: 0.3 })),
    ).toEqual({
      type: "control_swipe",
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 20,
      duration: 0.3,
    });
  });

  it("parses control_home and control_result home", () => {
    expect(parseWSMessage(JSON.stringify({ type: "control_home" }))).toEqual({
      type: "control_home",
    });
    expect(parseWSMessage(JSON.stringify({ type: "control_result", action: "home", ok: true }))).toEqual({
      type: "control_result",
      action: "home",
      ok: true,
    });
    expect(
      parseWSMessage(
        JSON.stringify({
          type: "control_result",
          action: "home",
          ok: false,
          error: { code: "NOT_ATTACHED", message: "Attach an explicit UDID first." },
        }),
      ),
    ).toEqual({
      type: "control_result",
      action: "home",
      ok: false,
      error: { code: "NOT_ATTACHED", message: "Attach an explicit UDID first." },
    });
  });

  it("parses host_status and viewer_show_host", () => {
    expect(
      parseWSMessage(
        JSON.stringify({
          type: "host_status",
          action: "hidden",
          hidden: true,
          app: "Device Hub",
          note: "Apple Device Hub hidden — control this pane",
        }),
      ),
    ).toEqual({
      type: "host_status",
      action: "hidden",
      hidden: true,
      app: "Device Hub",
      note: "Apple Device Hub hidden — control this pane",
    });
    expect(parseWSMessage(JSON.stringify({ type: "viewer_show_host" }))).toEqual({
      type: "viewer_show_host",
    });
    expect(parseWSMessage(JSON.stringify({ type: "control_result", action: "show_host", ok: true }))).toEqual({
      type: "control_result",
      action: "show_host",
      ok: true,
    });
  });

  it("accepts viewer_attach with udid alias", () => {
    expect(
      parseWSMessage(JSON.stringify({ type: "viewer_attach", udid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })),
    ).toEqual({
      type: "viewer_attach",
      deviceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
  });

  it("parses stream_status Live vs Snapshot", () => {
    expect(parseWSMessage(JSON.stringify({ type: "stream_status", mode: "live", connected: true }))).toEqual({
      type: "stream_status",
      mode: "live",
      connected: true,
    });
    expect(parseWSMessage(JSON.stringify({ type: "stream_status", mode: "snapshot", connected: false }))).toEqual({
      type: "stream_status",
      mode: "snapshot",
      connected: false,
    });
  });

  it("rejects invalid JSON, unknown types, and malformed control", () => {
    expect(parseWSMessage("not-json")).toBeUndefined();
    expect(parseWSMessage(JSON.stringify({ type: "not_a_real_type" }))).toBeUndefined();
    expect(parseWSMessage(JSON.stringify({ type: "control_tap", x: "nope", y: 1 }))).toBeUndefined();
    expect(parseWSMessage(JSON.stringify({ type: "agent_action", sessionId: "s" }))).toBeUndefined();
  });

  it("does not treat a JSON image payload as a valid control message", () => {
    const huge = parseWSMessage(
      JSON.stringify({
        type: "frame",
        mime: "image/png",
        data: "iVBORw0KGgo=",
      }),
    );
    expect(huge).toBeUndefined();
  });
});
