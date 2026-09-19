import { describe, expect, it } from "vitest";
import { formatHostStatus } from "./format";

describe("formatHostStatus", () => {
  it("uses the attach note while the host is hidden", () => {
    expect(formatHostStatus(true, "Apple Device Hub hidden — control this pane", true)).toBe(
      "Apple Device Hub hidden — control this pane",
    );
  });

  it("keeps a hidden-host note after detach", () => {
    expect(formatHostStatus(true, "Apple Device Hub hidden — control this pane", false)).toMatch(/Device Hub/);
  });

  it("hides the chrome after Show Device Hub when detached", () => {
    expect(formatHostStatus(false, "Reopened Device Hub.", false)).toBeUndefined();
  });
});
