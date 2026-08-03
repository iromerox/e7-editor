import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import {
  ARC_SPAN_DEGREES,
  ARC_START_DEGREES,
  DRAG_TRAVEL_PX,
  KNOB_MAX,
  KNOB_MIN,
  Knob,
  PAGE_STEP,
  SKIRT_LOBES,
  TICK_COUNT,
  TICK_STEP_DEGREES,
  knobAngle,
  skirtRadius,
} from "./Knob";

function ticksOf(container: HTMLElement): readonly SVGLineElement[] {
  return [...container.querySelectorAll("line")].filter(
    (line) => line.getAttribute("stroke") === "var(--e7-silkscreen)",
  );
}

function skirtOf(container: HTMLElement): Element {
  const [skirt, ...rest] = container.querySelectorAll("path");
  if (skirt === undefined || rest.length > 0) {
    throw new Error("expected exactly one skirt path");
  }
  return skirt;
}

function inlayOf(container: HTMLElement): Element {
  const [inlay, ...rest] = container.querySelectorAll("circle");
  if (inlay === undefined || rest.length > 0) {
    throw new Error("expected exactly one inlay circle");
  }
  return inlay;
}

function radiusOf(circle: Element): number {
  return Number(circle.getAttribute("r"));
}

function bodyAngle(container: HTMLElement): number {
  const group = container.querySelector("g");
  const match = /rotate\((-?[\d.]+)/.exec(group?.getAttribute("transform") ?? "");
  if (match?.[1] === undefined) {
    throw new Error("knob body carries no rotation");
  }
  return Number(match[1]);
}

function skirtRadii(container: HTMLElement): readonly number[] {
  const d = skirtOf(container).getAttribute("d") ?? "";
  return [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) =>
    Math.hypot(Number(x) - 50, Number(y) - 50),
  );
}

function pointerOf(container: HTMLElement): Element {
  const line = container.querySelector('line[stroke="var(--e7-knob-notch)"]');
  if (line === null) {
    throw new Error("no pointer line rendered");
  }
  return line;
}

function drag(slider: HTMLElement, from: number, moves: readonly number[]): void {
  fireEvent.pointerDown(slider, { button: 0, clientX: 0, clientY: from });
  for (const clientY of moves) {
    fireEvent.pointerMove(window, { clientX: 0, clientY });
  }
  fireEvent.pointerUp(window);
}

describe("knobAngle", () => {
  it("spans the arc measured off the panel, not the usual 270 degrees", () => {
    expect(ARC_SPAN_DEGREES).toBe(300);
    expect(ARC_START_DEGREES).toBe(-150);
    expect(TICK_STEP_DEGREES * (TICK_COUNT - 1)).toBe(ARC_SPAN_DEGREES);
  });

  it("maps the value range onto the arc", () => {
    expect(knobAngle(KNOB_MIN, KNOB_MIN, KNOB_MAX)).toBe(-150);
    expect(knobAngle(KNOB_MAX, KNOB_MIN, KNOB_MAX)).toBe(150);
    expect(knobAngle(63.5, KNOB_MIN, KNOB_MAX)).toBe(0);
  });

  it("clamps out-of-range values and tolerates an empty range", () => {
    expect(knobAngle(-40, KNOB_MIN, KNOB_MAX)).toBe(-150);
    expect(knobAngle(999, KNOB_MIN, KNOB_MAX)).toBe(150);
    expect(knobAngle(5, 5, 5)).toBe(-150);
  });
});

describe("Knob rendering", () => {
  it("draws the silkscreened tick arc with major ticks every other step", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "OSC1", value: 0, onInput: () => {} }} />
    ));

    const ticks = ticksOf(container);
    expect(ticks).toHaveLength(TICK_COUNT);
    const widths = ticks.map((tick) => tick.getAttribute("stroke-width"));
    expect(widths.filter((width) => width === "2.4")).toHaveLength(11);
    expect(widths.filter((width) => width === "1.6")).toHaveLength(10);
  });

  it("draws the skirt with the metal inlay disc set into it", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "OSC1", value: 0, onInput: () => {} }} />
    ));

    const inlay = inlayOf(container);
    expect(radiusOf(inlay)).toBeLessThan(Math.min(...skirtRadii(container)));
    expect(container.querySelector('stop[stop-color="var(--e7-cap-top)"]')).not.toBeNull();
    expect(container.querySelector('stop[stop-color="var(--e7-knob-inlay-top)"]')).not.toBeNull();
  });

  it("flutes the skirt at the pitch measured off the panel", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "OSC1", value: 0, onInput: () => {} }} />
    ));

    const radii = skirtRadii(container);
    const peaks = radii.filter((radius, index) => {
      const before = radii[(index - 1 + radii.length) % radii.length] ?? 0;
      const after = radii[(index + 1) % radii.length] ?? 0;
      return radius >= before && radius > after;
    });
    expect(peaks).toHaveLength(SKIRT_LOBES);
    expect(skirtRadius(0)).toBeGreaterThan(skirtRadius(360 / SKIRT_LOBES / 2));
    expect(skirtRadius(0)).toBeCloseTo(skirtRadius(360 / SKIRT_LOBES), 6);
  });

  it("keeps the flutes shallow enough to stay a circle at a glance", () => {
    const radii = Array.from({ length: 360 }, (_, degree) => skirtRadius(degree));
    const depth = (Math.max(...radii) - Math.min(...radii)) / Math.max(...radii);
    expect(depth).toBeGreaterThan(0.04);
    expect(depth).toBeLessThan(0.12);
  });

  it("runs the pointer across the skirt, clear of the inlay", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "OSC1", value: 64, onInput: () => {} }} />
    ));

    const inlay = inlayOf(container);
    const pointer = pointerOf(container);
    const near = Math.hypot(
      Number(pointer.getAttribute("x1")) - 50,
      Number(pointer.getAttribute("y1")) - 50,
    );
    const far = Math.hypot(
      Number(pointer.getAttribute("x2")) - 50,
      Number(pointer.getAttribute("y2")) - 50,
    );
    expect(near).toBeGreaterThan(radiusOf(inlay));
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(Math.min(...skirtRadii(container)));
  });

  it("turns the whole knob body, flutes and all, not just the mark", () => {
    const { container: low } = render(() => (
      <Knob primary={{ label: "OSC1", value: KNOB_MIN, onInput: () => {} }} />
    ));
    const { container: mid } = render(() => (
      <Knob primary={{ label: "Sub1", value: 63.5, onInput: () => {} }} />
    ));
    const { container: high } = render(() => (
      <Knob primary={{ label: "OSC2", value: KNOB_MAX, onInput: () => {} }} />
    ));

    expect(bodyAngle(low)).toBe(ARC_START_DEGREES);
    expect(bodyAngle(mid)).toBe(0);
    expect(bodyAngle(high)).toBe(ARC_START_DEGREES + ARC_SPAN_DEGREES);

    for (const container of [low, mid, high]) {
      const group = container.querySelector("g");
      expect(group?.querySelector("path")).not.toBeNull();
      expect(group?.querySelector("circle")).not.toBeNull();
      expect(group?.querySelector('line[stroke="var(--e7-knob-notch)"]')).not.toBeNull();
    }
  });

  it("leaves the silkscreened tick arc behind when the knob turns", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "OSC1", value: KNOB_MAX, onInput: () => {} }} />
    ));

    const group = container.querySelector("g");
    for (const tick of ticksOf(container)) {
      expect(group?.contains(tick)).toBe(false);
    }
  });

  it("takes every colour from the theme's custom properties", () => {
    const { container } = render(() => (
      <Knob
        primary={{ label: "Rate", value: 64, onInput: () => {} }}
        shift={{ label: "EG1 Mod", value: 0, onInput: () => {} }}
      />
    ));

    const painted = [...container.querySelectorAll("[fill], [stroke], [stop-color], [style]")];
    for (const element of painted) {
      for (const name of ["fill", "stroke", "stop-color"]) {
        const value = element.getAttribute(name);
        if (value !== null) {
          expect(value.startsWith("var(--e7-") || value.startsWith("url(#")).toBe(true);
        }
      }
      expect(element.getAttribute("style") ?? "").not.toMatch(/#[0-9a-f]{3}\b/i);
    }
  });

  it("scales the large cap to the panel's 1.7x ratio", () => {
    const { container } = render(() => (
      <Knob primary={{ label: "Cutoff", value: 0, onInput: () => {} }} size="large" />
    ));

    const slider = screen.getByRole("slider");
    expect(slider.style.width).toBe("5.1rem");
    expect(ticksOf(container)).toHaveLength(TICK_COUNT);
  });

  it("reports its value to assistive technology, formatted when a format is given", () => {
    render(() => (
      <Knob
        primary={{
          label: "Delay Time",
          value: 3,
          max: 14,
          format: (value) => `1/${value + 1}`,
          onInput: () => {},
        }}
      />
    ));

    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-label", "Delay Time");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "14");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    expect(slider).toHaveAttribute("aria-valuetext", "1/4");
  });
});

describe("Knob dragging", () => {
  it("changes the value on vertical drag", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "OSC1", value: 0, onInput }} />);

    drag(screen.getByRole("slider"), 300, [300 - DRAG_TRAVEL_PX / 2]);

    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput).toHaveBeenCalledWith(64);
  });

  it("drags downward toward the minimum and clamps there", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "OSC1", value: 64, onInput }} />);

    drag(screen.getByRole("slider"), 100, [400]);

    expect(onInput).toHaveBeenLastCalledWith(KNOB_MIN);
  });

  it("ignores horizontal movement", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "OSC1", value: 40, onInput }} />);

    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider, { button: 0, clientX: 0, clientY: 200 });
    for (const clientX of [20, 60, 140, -80, -200]) {
      fireEvent.pointerMove(window, { clientX, clientY: 200 });
    }
    fireEvent.pointerUp(window);

    expect(onInput).not.toHaveBeenCalled();
  });

  it("emits once per value rather than once per pixel", () => {
    const onInput = vi.fn<(value: number) => void>();
    render(() => <Knob primary={{ label: "OSC1", value: 0, onInput }} />);

    const moves = Array.from({ length: 100 }, (_, index) => 300 - (index + 1));
    drag(screen.getByRole("slider"), 300, moves);

    const values = onInput.mock.calls.map(([value]) => value);
    expect(values.length).toBeLessThan(moves.length);
    expect(values).toStrictEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    expect(values.at(-1)).toBe(64);
  });

  it("suppresses the browser's own drag so a turn does not select the labels", () => {
    render(() => <Knob primary={{ label: "OSC1", value: 0, onInput: () => {} }} />);

    const started = fireEvent.pointerDown(screen.getByRole("slider"), {
      button: 0,
      clientX: 0,
      clientY: 300,
    });

    expect(started).toBe(false);
  });

  it("stops tracking the pointer once the drag ends", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "OSC1", value: 0, onInput }} />);

    drag(screen.getByRole("slider"), 300, [280]);
    onInput.mockClear();
    fireEvent.pointerMove(window, { clientX: 0, clientY: 100 });

    expect(onInput).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer buttons", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "OSC1", value: 0, onInput }} />);

    fireEvent.pointerDown(screen.getByRole("slider"), { button: 2, clientX: 0, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 0, clientY: 100 });

    expect(onInput).not.toHaveBeenCalled();
  });
});

describe("Knob keyboard control", () => {
  it("nudges by one with the arrow keys", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "Cutoff", value: 64, onInput }} />);

    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "ArrowDown" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });

    expect(onInput.mock.calls).toStrictEqual([[65], [65], [63], [63]]);
  });

  it("pages by ten and jumps to the ends", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "Cutoff", value: 64, onInput }} />);

    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.keyDown(slider, { key: "PageDown" });
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "End" });

    expect(onInput.mock.calls).toStrictEqual([
      [64 + PAGE_STEP],
      [64 - PAGE_STEP],
      [KNOB_MIN],
      [KNOB_MAX],
    ]);
  });

  it("does not emit when already at a bound", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "Cutoff", value: KNOB_MAX, onInput }} />);

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });

    expect(onInput).not.toHaveBeenCalled();
  });

  it("leaves unrelated keys alone", () => {
    const onInput = vi.fn();
    render(() => <Knob primary={{ label: "Cutoff", value: 10, onInput }} />);

    fireEvent.keyDown(screen.getByRole("slider"), { key: "a" });

    expect(onInput).not.toHaveBeenCalled();
  });
});

describe("Knob shift layer", () => {
  it("shows one plain label and no layer buttons when the panel has no shift label", () => {
    render(() => <Knob primary={{ label: "Sustain", value: 0, onInput: () => {} }} />);

    expect(screen.getByText("Sustain")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("renders the shift label in the panel's white-filled box", () => {
    render(() => (
      <Knob
        primary={{ label: "Attack", value: 0, onInput: () => {} }}
        shift={{ label: "Velocity mod", value: 0, onInput: () => {} }}
      />
    ));

    const shift = screen.getByRole("button", { name: "Velocity mod" });
    expect(shift.getAttribute("style")).toContain("background: var(--e7-silkscreen)");
    expect(shift.getAttribute("style")).toContain("color: var(--e7-panel)");
  });

  it("edits the primary layer until the shift layer is selected", () => {
    const onPrimary = vi.fn();
    const onShift = vi.fn();
    render(() => (
      <Knob
        primary={{ label: "Tune", value: 64, onInput: onPrimary }}
        shift={{ label: "Transpose", value: 24, max: 48, onInput: onShift }}
      />
    ));

    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-label", "Tune");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onPrimary).toHaveBeenCalledWith(65);
    expect(onShift).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Transpose" }));

    expect(slider).toHaveAttribute("aria-label", "Transpose");
    expect(slider).toHaveAttribute("aria-valuenow", "24");
    expect(slider).toHaveAttribute("aria-valuemax", "48");
    fireEvent.keyDown(slider, { key: "ArrowUp" });
    expect(onShift).toHaveBeenCalledWith(25);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("marks the selected layer for assistive technology", () => {
    render(() => (
      <Knob
        primary={{ label: "Rate", value: 0, onInput: () => {} }}
        shift={{ label: "EG1 Mod", value: 0, onInput: () => {} }}
      />
    ));

    expect(screen.getByRole("button", { name: "Rate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "EG1 Mod" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "EG1 Mod" }));

    expect(screen.getByRole("button", { name: "Rate" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "EG1 Mod" })).toHaveAttribute("aria-pressed", "true");
  });

  it("drags the selected layer over its own range", () => {
    const onShift = vi.fn();
    render(() => (
      <Knob
        primary={{ label: "Delay Time", value: 0, onInput: () => {} }}
        shift={{ label: "Type", value: 0, max: 3, onInput: onShift }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    drag(screen.getByRole("slider"), 300, [300 - DRAG_TRAVEL_PX]);

    expect(onShift).toHaveBeenLastCalledWith(3);
  });
});
