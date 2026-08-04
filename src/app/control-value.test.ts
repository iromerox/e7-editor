import type { ControlValue } from "./control-value";
import { describe, expect, it, vi } from "vitest";
import {
  CONTROL_MAX,
  CONTROL_MIN,
  DRAG_TRAVEL_PX,
  PAGE_STEP,
  createEmitter,
  draggedValue,
  fractionOf,
  lowerBound,
  nudgedValue,
  quantize,
  readout,
  upperBound,
} from "./control-value";

function control(overrides: Partial<ControlValue> = {}): ControlValue {
  return { label: "Attack", value: 64, onInput: () => {}, ...overrides };
}

describe("bounds", () => {
  it("defaults to the 7-bit range the device uses", () => {
    expect(lowerBound(control())).toBe(CONTROL_MIN);
    expect(upperBound(control())).toBe(CONTROL_MAX);
    expect([CONTROL_MIN, CONTROL_MAX]).toStrictEqual([0, 127]);
  });

  it("takes narrower bounds from the control", () => {
    const narrow = control({ min: 2, max: 14 });
    expect(lowerBound(narrow)).toBe(2);
    expect(upperBound(narrow)).toBe(14);
  });
});

describe("quantize", () => {
  it("rounds to whole values and clamps to the bounds", () => {
    expect(quantize(control(), 63.4)).toBe(63);
    expect(quantize(control(), 63.5)).toBe(64);
    expect(quantize(control(), -20)).toBe(CONTROL_MIN);
    expect(quantize(control(), 999)).toBe(CONTROL_MAX);
    expect(quantize(control({ max: 14 }), 20)).toBe(14);
  });
});

describe("fractionOf", () => {
  it("places the value on its own range", () => {
    expect(fractionOf(control({ value: 0 }))).toBe(0);
    expect(fractionOf(control({ value: CONTROL_MAX }))).toBe(1);
    expect(fractionOf(control({ value: 7, max: 14 }))).toBe(0.5);
  });

  it("clamps out-of-range values and tolerates an empty range", () => {
    expect(fractionOf(control({ value: -5 }))).toBe(0);
    expect(fractionOf(control({ value: 300 }))).toBe(1);
    expect(fractionOf(control({ value: 5, min: 5, max: 5 }))).toBe(0);
  });
});

describe("draggedValue", () => {
  it("spans the whole range over the drag travel distance", () => {
    expect(draggedValue(control(), 0, DRAG_TRAVEL_PX)).toBe(CONTROL_MAX);
    expect(draggedValue(control(), 0, DRAG_TRAVEL_PX / 2)).toBe(64);
    expect(draggedValue(control(), CONTROL_MAX, -DRAG_TRAVEL_PX)).toBe(CONTROL_MIN);
  });

  it("spans a narrow range over the same distance", () => {
    expect(draggedValue(control({ max: 14 }), 0, DRAG_TRAVEL_PX)).toBe(14);
    expect(draggedValue(control({ max: 14 }), 0, DRAG_TRAVEL_PX * 2)).toBe(14);
  });
});

describe("nudgedValue", () => {
  it("steps by one, pages by ten and jumps to the ends", () => {
    expect(nudgedValue(control(), "ArrowUp")).toBe(65);
    expect(nudgedValue(control(), "ArrowRight")).toBe(65);
    expect(nudgedValue(control(), "ArrowDown")).toBe(63);
    expect(nudgedValue(control(), "ArrowLeft")).toBe(63);
    expect(nudgedValue(control(), "PageUp")).toBe(64 + PAGE_STEP);
    expect(nudgedValue(control(), "PageDown")).toBe(64 - PAGE_STEP);
    expect(nudgedValue(control(), "Home")).toBe(CONTROL_MIN);
    expect(nudgedValue(control(), "End")).toBe(CONTROL_MAX);
  });

  it("returns the same value at a bound rather than stepping past it", () => {
    expect(nudgedValue(control({ value: CONTROL_MAX }), "ArrowUp")).toBe(CONTROL_MAX);
    expect(nudgedValue(control({ value: CONTROL_MIN }), "PageDown")).toBe(CONTROL_MIN);
  });

  it("leaves unrelated keys alone", () => {
    expect(nudgedValue(control(), "a")).toBeUndefined();
    expect(nudgedValue(control(), "Enter")).toBeUndefined();
  });
});

describe("readout", () => {
  it("shows the raw value unless the control formats it", () => {
    expect(readout(control({ value: 67 }))).toBe("67");
    expect(readout(control({ value: 3, format: (value) => `1/${value + 1}` }))).toBe("1/4");
  });
});

describe("createEmitter", () => {
  it("emits once per distinct value", () => {
    const onInput = vi.fn();
    const emitter = createEmitter();
    const target = control({ value: 10, onInput });

    emitter.begin(10);
    for (const value of [10, 11, 11, 12, 12, 12, 11]) {
      emitter.emit(target, value);
    }

    expect(onInput.mock.calls).toStrictEqual([[11], [12], [11]]);
  });

  it("re-emits a value once a new gesture starts from somewhere else", () => {
    const onInput = vi.fn();
    const emitter = createEmitter();
    const target = control({ onInput });

    emitter.begin(10);
    emitter.emit(target, 11);
    emitter.begin(20);
    emitter.emit(target, 11);

    expect(onInput.mock.calls).toStrictEqual([[11], [11]]);
  });
});
