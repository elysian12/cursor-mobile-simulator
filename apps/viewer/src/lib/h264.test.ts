import { describe, expect, it } from "vitest";
import {
  annexBToAvcc,
  avcCFromSpsPps,
  codecFromSps,
  nalType,
  splitAnnexB,
  stripStartCode,
} from "./h264";

const sps = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1e, 0xaa]);
const pps = new Uint8Array([0, 0, 0, 1, 0x68, 0xce, 0x06, 0xe2]);
const idr = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00]);

describe("H.264 Annex-B helpers", () => {
  it("splits complete NALUs and keeps the trailing unit", () => {
    const joined = new Uint8Array(sps.byteLength + pps.byteLength + idr.byteLength);
    joined.set(sps, 0);
    joined.set(pps, sps.byteLength);
    joined.set(idr, sps.byteLength + pps.byteLength);
    const { units, incomplete } = splitAnnexB(joined);
    expect(units).toHaveLength(2);
    expect(nalType(units[0] ?? new Uint8Array())).toBe(7);
    expect(nalType(units[1] ?? new Uint8Array())).toBe(8);
    expect(Array.from(incomplete)).toEqual(Array.from(idr));
  });

  it("converts Annex-B to AVCC length-prefixed NALUs", () => {
    const avcc = annexBToAvcc(sps);
    expect(avcc[0]).toBe(0);
    expect(avcc[1]).toBe(0);
    expect(avcc[2]).toBe(0);
    expect(avcc[3]).toBe(5);
    expect(Array.from(avcc.subarray(4))).toEqual(Array.from(stripStartCode(sps)));
  });

  it("builds avcC and an avc1 codec string from SPS/PPS", () => {
    expect(codecFromSps(sps)).toBe("avc1.42C01E");
    const avcc = avcCFromSpsPps(sps, pps);
    expect(avcc[0]).toBe(1);
    expect(avcc[1]).toBe(0x42);
    expect(avcc[2]).toBe(0xc0);
    expect(avcc[3]).toBe(0x1e);
    expect(avcc[5]).toBe(0xe1);
  });
});
