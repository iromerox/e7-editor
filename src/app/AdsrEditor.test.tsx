import type { AdsrFractions, Point } from "./AdsrEditor";
import type { ControlValue } from "./control-value";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import {
  AdsrEditor,
  BASE_Y,
  EDGE,
  GATE_BOTTOM,
  PEAK_Y,
  SUSTAIN_SPAN,
  TIME_SPAN,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  adsrGeometry,
  adsrPath,
  boundaries,
  gatePath,
  timeWidth,
} from "./AdsrEditor";
import { CONTROL_MAX, CONTROL_MIN, DRAG_TRAVEL_PX, PAGE_STEP } from "./control-value";
import { Knob } from "./Knob";

const EXTREMES: readonly AdsrFractions[] = [0, 1].flatMap((attack) =>
  [0, 1].flatMap((decay) =>
    [0, 1].flatMap((sustain) => [0, 1].map((release) => ({ attack, decay, sustain, release }))),
  ),
);

function curveOf(container: HTMLElement): SVGPathElement {
  const path = container.querySelector<SVGPathElement>('path[stroke="var(--e7-silkscreen)"]');
  if (path === null) {
    throw new Error("no envelope curve rendered");
  }
  return path;
}

function gateOf(container: HTMLElement): SVGPathElement {
  const path = container.querySelector<SVGPathElement>('path[stroke="var(--e7-label-secondary)"]');
  if (path === null) {
    throw new Error("no gate pulse rendered");
  }
  return path;
}

function handleOf(name: string): HTMLElement {
  return screen.getByRole("slider", { name });
}

function stageEditor(props: {
  readonly attack?: ControlValue;
  readonly decay?: ControlValue;
  readonly sustain?: ControlValue;
  readonly release?: ControlValue;
}): ReturnType<typeof render> {
  const stage = (label: string, value: number): ControlValue => ({
    label,
    value,
    onInput: () => {},
  });
  return render(() => (
    <AdsrEditor
      label="EG1"
      attack={props.attack ?? stage("Attack", 64)}
      decay={props.decay ?? stage("Decay", 64)}
      sustain={props.sustain ?? stage("Sustain", 64)}
      release={props.release ?? stage("Release", 64)}
    />
  ));
}

function dragX(handle: HTMLElement, from: number, moves: readonly number[]): void {
  fireEvent.pointerDown(handle, { button: 0, clientX: from, clientY: 0 });
  for (const clientX of moves) {
    fireEvent.pointerMove(window, { clientX, clientY: 0 });
  }
  fireEvent.pointerUp(window);
}

function dragY(handle: HTMLElement, from: number, moves: readonly number[]): void {
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: from });
  for (const clientY of moves) {
    fireEvent.pointerMove(window, { clientX: 0, clientY });
  }
  fireEvent.pointerUp(window);
}

describe("adsrGeometry", () => {
  it("gives each timed stage a width proportional to its value", () => {
    const quiet = adsrGeometry({ attack: 0, decay: 0, sustain: 0, release: 0 });
    const wide = adsrGeometry({ attack: 1, decay: 1, sustain: 0, release: 1 });

    expect(quiet.attack.x - quiet.origin.x).toBe(0);
    expect(quiet.decay.x - quiet.attack.x).toBe(0);
    expect(quiet.release.x - quiet.sustain.x).toBe(0);
    expect(wide.attack.x - wide.origin.x).toBeCloseTo(TIME_SPAN, 6);
    expect(wide.decay.x - wide.attack.x).toBeCloseTo(TIME_SPAN, 6);
    expect(wide.release.x - wide.sustain.x).toBeCloseTo(TIME_SPAN, 6);
  });

  it("holds the sustain plateau at a fixed width so the handles stay where the user left them", () => {
    for (const fractions of EXTREMES) {
      const geometry = adsrGeometry(fractions);
      expect(geometry.sustain.x - geometry.decay.x).toBeCloseTo(SUSTAIN_SPAN, 6);
      expect(geometry.sustain.y).toBe(geometry.decay.y);
    }
  });

  it("puts the sustain handle at the key release, where the plateau ends and the release begins", () => {
    for (const fractions of EXTREMES) {
      const geometry = adsrGeometry(fractions);
      expect(geometry.sustain.x).toBeCloseTo(geometry.release.x - timeWidth(fractions.release), 6);
      expect(gatePath(geometry)).toContain(`L${geometry.sustain.x.toFixed(2)} ${GATE_BOTTOM}`);
    }
  });

  it("stacks a collapsed stage's handle on the one it falls back to", () => {
    const instantDecay = adsrGeometry({ attack: 0.5, decay: 0, sustain: 1, release: 0.5 });
    const instantRelease = adsrGeometry({ attack: 0.5, decay: 0.5, sustain: 0, release: 0 });

    expect(instantDecay.decay).toStrictEqual(instantDecay.attack);
    expect(instantRelease.release).toStrictEqual(instantRelease.sustain);
  });

  it("maps the sustain level between the baseline and the peak", () => {
    expect(adsrGeometry({ attack: 0, decay: 0, sustain: 0, release: 0 }).decay.y).toBe(BASE_Y);
    expect(adsrGeometry({ attack: 0, decay: 0, sustain: 1, release: 0 }).decay.y).toBe(PEAK_Y);
    expect(adsrGeometry({ attack: 0, decay: 0, sustain: 0.5, release: 0 }).decay.y).toBe(
      (BASE_Y + PEAK_Y) / 2,
    );
  });

  it("keeps every extreme drawable: stages in order and inside the view", () => {
    for (const fractions of EXTREMES) {
      const geometry = adsrGeometry(fractions);
      const points: readonly Point[] = [
        geometry.origin,
        geometry.attack,
        geometry.decay,
        geometry.sustain,
        geometry.release,
      ];

      for (const [index, point] of points.entries()) {
        const previous = points[index - 1];
        if (previous !== undefined) {
          expect(point.x).toBeGreaterThanOrEqual(previous.x);
        }
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(VIEW_WIDTH);
        expect(point.y).toBeGreaterThanOrEqual(PEAK_Y);
        expect(point.y).toBeLessThanOrEqual(VIEW_HEIGHT);
      }
    }
  });

  it("rises as a vertical line when the attack is instant", () => {
    const instant = adsrGeometry({ attack: 0, decay: 1, sustain: 1, release: 1 });

    expect(instant.attack.x).toBe(instant.origin.x);
    expect(instant.origin.y).toBe(BASE_Y);
    expect(instant.attack.y).toBe(PEAK_Y);
    expect(adsrPath(instant)).toContain(
      `M${EDGE.toFixed(2)} ${BASE_Y.toFixed(2)}L${EDGE.toFixed(2)} ${PEAK_Y.toFixed(2)}`,
    );
  });

  it("drops straight back down from wherever the attack ended when the decay is instant", () => {
    const ramped = adsrGeometry({ attack: 0.5, decay: 0, sustain: 0, release: 1 });

    expect(ramped.attack.x).toBeCloseTo(EDGE + TIME_SPAN / 2, 6);
    expect(ramped.decay.x).toBe(ramped.attack.x);
    expect(ramped.decay.y).toBe(BASE_Y);
    expect(adsrPath(ramped)).toContain(
      `L${ramped.attack.x.toFixed(2)} ${PEAK_Y.toFixed(2)}L${ramped.attack.x.toFixed(2)} ${BASE_Y.toFixed(2)}`,
    );
  });

  it("gives a stage its width in proportion to its value, from nothing at zero", () => {
    expect(timeWidth(0)).toBe(0);
    expect(timeWidth(0.5)).toBeCloseTo(TIME_SPAN / 2, 6);
    expect(timeWidth(1)).toBeCloseTo(TIME_SPAN, 6);
  });

  it("draws the widest envelope to the edge of the view", () => {
    const widest = adsrGeometry({ attack: 1, decay: 1, sustain: 1, release: 1 });

    expect(widest.origin.x).toBe(EDGE);
    expect(widest.release.x).toBe(VIEW_WIDTH - EDGE);
  });
});

describe("adsrPath", () => {
  it("joins the stage boundaries with straight segments", () => {
    const geometry = adsrGeometry({ attack: 0.5, decay: 0.5, sustain: 0.5, release: 0.5 });
    const path = adsrPath(geometry);

    expect(path).not.toContain("Q");
    expect(path).not.toContain("C");
    expect(path.startsWith(`M${geometry.origin.x.toFixed(2)}`)).toBe(true);
    expect([...path].filter((character) => character === "L")).toHaveLength(4);
    for (const point of boundaries(geometry).slice(1)) {
      expect(path).toContain(`L${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
    }
  });

  it("walks the five stage boundaries in order", () => {
    const geometry = adsrGeometry({ attack: 0.4, decay: 0.4, sustain: 0.4, release: 0.4 });

    expect(boundaries(geometry)).toStrictEqual([
      geometry.origin,
      geometry.attack,
      geometry.decay,
      geometry.sustain,
      geometry.release,
    ]);
  });

  it("stays a real path at every extreme", () => {
    for (const fractions of EXTREMES) {
      const geometry = adsrGeometry(fractions);
      expect(adsrPath(geometry)).not.toContain("NaN");
      expect(gatePath(geometry)).not.toContain("NaN");
    }
  });

  it("holds the gate open until the release begins", () => {
    const geometry = adsrGeometry({ attack: 0.3, decay: 0.3, sustain: 0.3, release: 0.3 });
    const gate = gatePath(geometry);

    expect(gate).toContain(`M${geometry.origin.x.toFixed(2)}`);
    expect(gate).toContain(`L${geometry.sustain.x.toFixed(2)}`);
    expect(gate).toContain(`L${geometry.release.x.toFixed(2)}`);
  });
});

describe("AdsrEditor rendering", () => {
  it("draws the curve for the values it is given", () => {
    const { container } = stageEditor({
      attack: { label: "Attack", value: 32, onInput: () => {} },
      decay: { label: "Decay", value: 96, onInput: () => {} },
      sustain: { label: "Sustain", value: 64, onInput: () => {} },
      release: { label: "Release", value: 0, onInput: () => {} },
    });

    expect(curveOf(container).getAttribute("d")).toBe(
      adsrPath(
        adsrGeometry({
          attack: 32 / CONTROL_MAX,
          decay: 96 / CONTROL_MAX,
          sustain: 64 / CONTROL_MAX,
          release: 0,
        }),
      ),
    );
    expect(gateOf(container)).not.toBeNull();
  });

  it("offers one handle per stage, named for the envelope it belongs to", () => {
    stageEditor({});

    expect(screen.getAllByRole("slider")).toHaveLength(4);
    for (const stage of ["Attack", "Decay", "Sustain", "Release"]) {
      expect(handleOf(`EG1 ${stage}`)).toBeInTheDocument();
    }
  });

  it("reports each stage to assistive technology on the axis it is dragged", () => {
    stageEditor({
      attack: { label: "Attack", value: 67, onInput: () => {} },
      sustain: { label: "Sustain", value: 53, onInput: () => {} },
    });

    const attack = handleOf("EG1 Attack");
    expect(attack).toHaveAttribute("aria-orientation", "horizontal");
    expect(attack).toHaveAttribute("aria-valuemin", String(CONTROL_MIN));
    expect(attack).toHaveAttribute("aria-valuemax", String(CONTROL_MAX));
    expect(attack).toHaveAttribute("aria-valuenow", "67");
    expect(attack).toHaveAttribute("aria-valuetext", "67");
    expect(handleOf("EG1 Sustain")).toHaveAttribute("aria-orientation", "vertical");
  });

  it("shows the value at the handle only while that handle is in use", () => {
    stageEditor({ decay: { label: "Decay", value: 34, onInput: () => {} } });

    expect(screen.queryByText("34")).toBeNull();
    fireEvent.focus(handleOf("EG1 Decay"));
    expect(screen.getByText("34")).toBeInTheDocument();
    fireEvent.blur(handleOf("EG1 Decay"));
    expect(screen.queryByText("34")).toBeNull();
  });

  it("draws the handles in stage order, so a stacked one can always be dragged off the other", () => {
    const { container } = stageEditor({
      attack: { label: "Attack", value: 64, onInput: () => {} },
      decay: { label: "Decay", value: 0, onInput: () => {} },
      sustain: { label: "Sustain", value: CONTROL_MAX, onInput: () => {} },
    });

    const order = [...container.querySelectorAll('[role="slider"]')].map((handle) =>
      handle.getAttribute("aria-label"),
    );

    expect(order).toStrictEqual(["EG1 Attack", "EG1 Decay", "EG1 Sustain", "EG1 Release"]);
  });

  it("takes every colour from the theme's custom properties", () => {
    const { container } = stageEditor({});

    for (const element of container.querySelectorAll("[fill], [stroke]")) {
      for (const name of ["fill", "stroke"]) {
        const value = element.getAttribute(name);
        if (value !== null && value !== "none") {
          expect(value.startsWith("var(--e7-")).toBe(true);
        }
      }
    }
  });
});

describe("AdsrEditor dragging", () => {
  it("drags a timed stage horizontally and redraws the curve to match", () => {
    const [attack, setAttack] = createSignal(0);
    const { container } = render(() => (
      <AdsrEditor
        label="EG1"
        attack={{ label: "Attack", value: attack(), onInput: setAttack }}
        decay={{ label: "Decay", value: 0, onInput: () => {} }}
        sustain={{ label: "Sustain", value: CONTROL_MAX, onInput: () => {} }}
        release={{ label: "Release", value: 0, onInput: () => {} }}
      />
    ));

    const before = curveOf(container).getAttribute("d");
    dragX(handleOf("EG1 Attack"), 100, [100 + DRAG_TRAVEL_PX / 2]);

    expect(attack()).toBe(64);
    expect(curveOf(container).getAttribute("d")).not.toBe(before);
    expect(curveOf(container).getAttribute("d")).toBe(
      adsrPath(adsrGeometry({ attack: 64 / CONTROL_MAX, decay: 0, sustain: 1, release: 0 })),
    );
  });

  it("drags the sustain vertically and redraws the plateau to match", () => {
    const [sustain, setSustain] = createSignal(CONTROL_MAX);
    const { container } = render(() => (
      <AdsrEditor
        label="EG1"
        attack={{ label: "Attack", value: 0, onInput: () => {} }}
        decay={{ label: "Decay", value: 0, onInput: () => {} }}
        sustain={{ label: "Sustain", value: sustain(), onInput: setSustain }}
        release={{ label: "Release", value: 0, onInput: () => {} }}
      />
    ));

    dragY(handleOf("EG1 Sustain"), 200, [200 + DRAG_TRAVEL_PX / 2]);

    expect(sustain()).toBe(64);
    expect(curveOf(container).getAttribute("d")).toBe(
      adsrPath(adsrGeometry({ attack: 0, decay: 0, sustain: 64 / CONTROL_MAX, release: 0 })),
    );
  });

  it("ignores movement across the axis a stage is not dragged on", () => {
    const onAttack = vi.fn();
    const onSustain = vi.fn();
    stageEditor({
      attack: { label: "Attack", value: 40, onInput: onAttack },
      sustain: { label: "Sustain", value: 40, onInput: onSustain },
    });

    dragY(handleOf("EG1 Attack"), 200, [40, 380]);
    dragX(handleOf("EG1 Sustain"), 200, [40, 380]);

    expect(onAttack).not.toHaveBeenCalled();
    expect(onSustain).not.toHaveBeenCalled();
  });

  it("emits once per value rather than once per pixel", () => {
    const onInput = vi.fn<(value: number) => void>();
    stageEditor({ release: { label: "Release", value: 0, onInput } });

    const moves = Array.from({ length: 100 }, (_, index) => 100 + index + 1);
    dragX(handleOf("EG1 Release"), 100, moves);

    const values = onInput.mock.calls.map(([value]) => value);
    expect(values.length).toBeLessThan(moves.length);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toStrictEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)).toBe(64);
  });

  it("clamps at the bounds instead of running past them", () => {
    const onInput = vi.fn();
    stageEditor({ decay: { label: "Decay", value: 64, onInput } });

    dragX(handleOf("EG1 Decay"), 500, [0]);

    expect(onInput).toHaveBeenLastCalledWith(CONTROL_MIN);
  });

  it("suppresses the browser's own drag so a stage drag does not select the page", () => {
    stageEditor({});

    const started = fireEvent.pointerDown(handleOf("EG1 Attack"), {
      button: 0,
      clientX: 100,
      clientY: 0,
    });

    expect(started).toBe(false);
  });

  it("stops tracking the pointer once the drag ends", () => {
    const onInput = vi.fn();
    stageEditor({ attack: { label: "Attack", value: 0, onInput } });

    dragX(handleOf("EG1 Attack"), 100, [120]);
    onInput.mockClear();
    fireEvent.pointerMove(window, { clientX: 400, clientY: 0 });

    expect(onInput).not.toHaveBeenCalled();
  });

  it("ignores non-primary pointer buttons", () => {
    const onInput = vi.fn();
    stageEditor({ attack: { label: "Attack", value: 0, onInput } });

    fireEvent.pointerDown(handleOf("EG1 Attack"), { button: 2, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 0 });

    expect(onInput).not.toHaveBeenCalled();
  });
});

describe("AdsrEditor keyboard control", () => {
  it("nudges, pages and jumps to the ends like the knob does", () => {
    const onInput = vi.fn();
    stageEditor({ sustain: { label: "Sustain", value: 64, onInput } });

    const sustain = handleOf("EG1 Sustain");
    for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      fireEvent.keyDown(sustain, { key });
    }

    expect(onInput.mock.calls).toStrictEqual([
      [65],
      [63],
      [64 + PAGE_STEP],
      [64 - PAGE_STEP],
      [CONTROL_MIN],
      [CONTROL_MAX],
    ]);
  });

  it("does not emit when already at a bound, and leaves unrelated keys alone", () => {
    const onInput = vi.fn();
    stageEditor({ release: { label: "Release", value: CONTROL_MAX, onInput } });

    fireEvent.keyDown(handleOf("EG1 Release"), { key: "ArrowUp" });
    fireEvent.keyDown(handleOf("EG1 Release"), { key: "a" });

    expect(onInput).not.toHaveBeenCalled();
  });
});

describe("AdsrEditor and Knob interchangeability", () => {
  it("drives the same field to the same value from an equivalent drag", () => {
    const onInput = vi.fn();
    const field: ControlValue = { label: "Attack", value: 40, onInput };
    render(() => (
      <>
        <Knob primary={field} />
        <AdsrEditor
          label="EG1"
          attack={field}
          decay={{ label: "Decay", value: 0, onInput: () => {} }}
          sustain={{ label: "Sustain", value: 0, onInput: () => {} }}
          release={{ label: "Release", value: 0, onInput: () => {} }}
        />
      </>
    ));

    dragY(handleOf("Attack"), 300, [300 - DRAG_TRAVEL_PX / 4]);
    const fromKnob = onInput.mock.calls.at(-1);
    onInput.mockClear();
    dragX(handleOf("EG1 Attack"), 100, [100 + DRAG_TRAVEL_PX / 4]);

    expect(fromKnob).toStrictEqual([72]);
    expect(onInput.mock.calls.at(-1)).toStrictEqual(fromKnob);
  });

  it("respects a narrowed range on either control", () => {
    const onInput = vi.fn();
    const field: ControlValue = { label: "Decay", value: 0, max: 14, onInput };
    stageEditor({ decay: field });

    dragX(handleOf("EG1 Decay"), 100, [100 + DRAG_TRAVEL_PX]);

    expect(handleOf("EG1 Decay")).toHaveAttribute("aria-valuemax", "14");
    expect(onInput).toHaveBeenLastCalledWith(14);
  });
});
