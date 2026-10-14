import { describe, expect, it } from "vitest";
import { eventToAccelerator, formatAccelerator, type KeyLike } from "./accelerator";

const ev = (over: Partial<KeyLike>): KeyLike => ({
  key: "p",
  code: "KeyP",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});

describe("eventToAccelerator", () => {
  it("builds macOS accelerators", () => {
    expect(eventToAccelerator(ev({ metaKey: true, altKey: true, shiftKey: true }), "macos")).toEqual({
      ok: true,
      accelerator: "Command+Alt+Shift+P",
    });
  });
  it("builds Windows accelerators", () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true, code: "Digit5", key: "5" }), "windows")).toEqual({
      ok: true,
      accelerator: "Control+Alt+5",
    });
  });
  it("waits while only modifiers are held", () => {
    expect(eventToAccelerator(ev({ key: "Shift", code: "ShiftLeft", shiftKey: true }), "macos")).toEqual({ ok: false, pending: true });
  });
  it("requires a non-shift modifier", () => {
    const r = eventToAccelerator(ev({ shiftKey: true }), "windows");
    expect(r.ok).toBe(false);
    expect(eventToAccelerator(ev({}), "macos").ok).toBe(false);
  });
  it("maps special keys", () => {
    expect(eventToAccelerator(ev({ code: "Space", key: " ", ctrlKey: true }), "windows")).toEqual({ ok: true, accelerator: "Control+Space" });
    expect(eventToAccelerator(ev({ code: "ArrowUp", key: "ArrowUp", altKey: true }), "macos")).toEqual({ ok: true, accelerator: "Alt+Up" });
    expect(eventToAccelerator(ev({ code: "F5", key: "F5", altKey: true }), "macos")).toEqual({ ok: true, accelerator: "Alt+F5" });
  });
});

describe("formatAccelerator", () => {
  it("renders mac symbols in canonical order", () => {
    expect(formatAccelerator("CommandOrControl+Alt+Shift+P", "macos")).toEqual(["⌥", "⇧", "⌘", "P"]);
  });
  it("renders Windows names", () => {
    expect(formatAccelerator("CommandOrControl+Alt+Shift+P", "windows")).toEqual(["Ctrl", "Alt", "Shift", "P"]);
  });
  it("handles empty", () => {
    expect(formatAccelerator(null, "macos")).toEqual([]);
  });
});
