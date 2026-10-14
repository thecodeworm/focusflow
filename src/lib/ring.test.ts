import { describe, expect, it } from "vitest";
import { dashOffset, remainingFraction, ringGeometry } from "./ring";

describe("ring math", () => {
  const g = ringGeometry(200, 8);
  it("computes radius inside the stroke", () => {
    expect(g.radius).toBe(96);
    expect(g.circumference).toBeCloseTo(2 * Math.PI * 96);
  });
  it("represents remaining time", () => {
    expect(remainingFraction(1500, 3000)).toBe(0.5);
    expect(remainingFraction(5000, 3000)).toBe(1);
    expect(remainingFraction(-1, 3000)).toBe(0);
    expect(remainingFraction(10, 0)).toBe(0);
  });
  it("maps fractions to dash offsets", () => {
    expect(dashOffset(1, 100)).toBe(0);
    expect(dashOffset(0, 100)).toBe(100);
    expect(dashOffset(0.25, 100)).toBe(75);
  });
});
