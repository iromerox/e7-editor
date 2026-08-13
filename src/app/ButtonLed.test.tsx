import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { ButtonLed, CAP_REM, CAP_ROW_OFFSET_REM, DualButton, READOUT_WIDTH_REM } from "./ButtonLed";

const LFO_SHAPES = ["Triangle", "Ramp up", "Ramp down", "Square", "S&H"] as const;

const LFO_MODES = [
  "Mono",
  "Poly",
  "KB tracking",
  "KB sync",
  "Clock sync",
  "KB + clock sync",
] as const;

const OSC_SHAPES = ["Triangle", "Saw-tri", "Sawtooth"] as const;

function shown(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    if (node.style.visibility === "hidden") {
      return false;
    }
  }
  return true;
}

function litLensesOf(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll("span")].filter(
    (span) => span.style.background === "var(--e7-led-on)" && shown(span),
  );
}

function capOf(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function capGroupOf(container: HTMLElement): HTMLElement {
  const group = container.querySelector("button")?.parentElement;
  if (group === null || group === undefined) {
    throw new Error("no cap rendered");
  }
  return group;
}

describe("ButtonLed", () => {
  it("presses on click", () => {
    const onPress = vi.fn();
    render(() => <ButtonLed label="Sync" lit={false} onPress={onPress} />);

    fireEvent.click(capOf("Sync"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("is a real button, so the space and enter keys activate it", () => {
    render(() => <ButtonLed label="Bank" lit={false} onPress={() => {}} />);

    const cap = capOf("Bank");
    expect(cap.tagName).toBe("BUTTON");
    expect(cap).toHaveAttribute("type", "button");
  });

  it("exposes its panel label as its accessible name and its LED as pressed state", () => {
    const { unmount } = render(() => <ButtonLed label="Sync" lit={true} onPress={() => {}} />);

    expect(capOf("Sync")).toHaveAttribute("aria-pressed", "true");
    unmount();

    render(() => <ButtonLed label="Sync" lit={false} onPress={() => {}} />);
    expect(capOf("Sync")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the cap held down while pressed and released again after", () => {
    render(() => <ButtonLed label="Shift" lit={false} onPress={() => {}} />);

    const cap = capOf("Shift");
    expect(cap.style.transform).toBe("none");

    fireEvent.pointerDown(cap);
    expect(cap.style.transform).not.toBe("none");

    fireEvent.pointerUp(cap);
    expect(cap.style.transform).toBe("none");
  });

  it("shows the cap held down while a keyboard activation key is down", () => {
    render(() => <ButtonLed label="Shift" lit={false} onPress={() => {}} />);

    const cap = capOf("Shift");
    fireEvent.keyDown(cap, { key: " " });
    expect(cap.style.transform).not.toBe("none");

    fireEvent.keyUp(cap, { key: " " });
    expect(cap.style.transform).toBe("none");

    fireEvent.keyDown(cap, { key: "Tab" });
    expect(cap.style.transform).toBe("none");
  });

  it("releases the cap when the pointer leaves it mid-press", () => {
    render(() => <ButtonLed label="Shift" lit={false} onPress={() => {}} />);

    const cap = capOf("Shift");
    fireEvent.pointerDown(cap);
    fireEvent.pointerLeave(cap);

    expect(cap.style.transform).toBe("none");
  });

  it("lights one LED, placed above the cap by default and beside it on request", () => {
    const { container, unmount } = render(() => (
      <ButtonLed label="1" lit={true} onPress={() => {}} />
    ));

    expect(litLensesOf(container)).toHaveLength(1);
    expect(capGroupOf(container).style.flexDirection).toBe("column");
    unmount();

    const { container: beside } = render(() => (
      <ButtonLed label="Pulse" lit={true} placement="beside" onPress={() => {}} />
    ));
    expect(capGroupOf(beside).style.flexDirection).toBe("row-reverse");
  });

  it("takes the cap's colours from the theme and sizes it against the knob", () => {
    render(() => <ButtonLed label="Sync" lit={false} onPress={() => {}} />);

    const cap = capOf("Sync");
    expect(cap.style.background).toBe("linear-gradient(var(--e7-cap-top), var(--e7-cap-bottom))");
    expect(cap.style.width).toBe(`${CAP_REM}rem`);
    expect(cap.getAttribute("style") ?? "").not.toMatch(/#[0-9a-f]{3}\b/i);
  });
});

describe("DualButton", () => {
  it("steps the primary layer and shows its column of LEDs", () => {
    const onPress = vi.fn();
    const { container } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 1,
          names: LFO_SHAPES,
          onPress,
        }}
      />
    ));

    expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
    fireEvent.click(capOf("Wave shape: Ramp up"));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(litLensesOf(container)).toHaveLength(1);
  });

  it("reports which state is current in the cap's accessible name", () => {
    render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 4,
          names: LFO_SHAPES,
          onPress: () => {},
        }}
      />
    ));

    expect(capOf("Wave shape: S&H")).toBeInTheDocument();
  });

  it("says nothing is lit for a state the panel gives no LED", () => {
    render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: OSC_SHAPES.length,
          names: OSC_SHAPES,
          onPress: () => {},
        }}
      />
    ));

    expect(capOf("Wave shape: none")).toBeInTheDocument();
  });

  it("spells the state out under the button only while no lens is lit", () => {
    const { container, unmount } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 4,
          names: LFO_SHAPES,
          readout: "Sample and hold",
          onPress: () => {},
        }}
      />
    ));

    expect(container.textContent).not.toContain("Sample and hold");
    unmount();

    const { container: dark } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          names: LFO_SHAPES,
          readout: "S&H (LED off)",
          onPress: () => {},
        }}
      />
    ));

    expect(dark.textContent).toContain("S&H (LED off)");
    expect(capOf("Wave shape: S&H (LED off)")).toBeInTheDocument();
  });

  it("spells out a layer the panel gives no lenses at all", () => {
    const { container } = render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }}
        shift={{ label: "Mode", count: 0, readout: "Clock Sync", onPress: () => {} }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    expect(container.textContent).toContain("Clock Sync");
    expect(capOf("Mode: Clock Sync")).toBeInTheDocument();
  });

  it("drops the cap onto the centre line of the knobs beside it, whatever its column holds", () => {
    const { container, unmount } = render(() => (
      <DualButton primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }} />
    ));

    const group = capGroupOf(container);
    expect(group.style.height).toBe(`${CAP_REM}rem`);
    expect(group.style.alignItems).toBe("center");
    expect((group.parentElement as HTMLElement).style.paddingTop).toBe(`${CAP_ROW_OFFSET_REM}rem`);
    unmount();

    const { container: short } = render(() => (
      <DualButton primary={{ label: "Pulse", count: 1, active: 0, onPress: () => {} }} />
    ));
    expect((capGroupOf(short).parentElement as HTMLElement).style.paddingTop).toBe(
      `${CAP_ROW_OFFSET_REM}rem`,
    );
  });

  it("clears the column's overhang before the labels under a tall one", () => {
    const labelBlockOf = (container: HTMLElement): HTMLElement => {
      const block = capGroupOf(container).nextElementSibling;
      if (!(block instanceof HTMLElement)) {
        throw new Error("no label block rendered");
      }
      return block;
    };

    const { container: tall, unmount } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 0,
          names: LFO_SHAPES,
          onPress: () => {},
        }}
      />
    ));

    expect(Number.parseFloat(labelBlockOf(tall).style.marginTop)).toBeGreaterThan(0);
    unmount();

    const { container: none } = render(() => (
      <DualButton primary={{ label: "Mode", count: 0, readout: "Clock Sync", onPress: () => {} }} />
    ));
    expect(labelBlockOf(none).style.marginTop).toBe("0rem");
  });

  it("shows one plain label and no layer buttons when the panel has no shift label", () => {
    render(() => (
      <DualButton primary={{ label: "Wave shape", count: 4, active: 0, onPress: () => {} }} />
    ));

    expect(screen.getByText("Wave shape")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders the shift label in the panel's white-filled box", () => {
    render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }}
        shift={{ label: "Mode", count: 6, active: 0, onPress: () => {} }}
      />
    ));

    const shift = screen.getByRole("button", { name: "Mode" });
    expect(shift.getAttribute("style")).toContain("background: var(--e7-silkscreen)");
    expect(shift.getAttribute("style")).toContain("color: var(--e7-panel)");
  });

  it("steps the primary layer until the shift layer is selected", () => {
    const onShape = vi.fn();
    const onMode = vi.fn();
    const { container } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 0,
          names: LFO_SHAPES,
          onPress: onShape,
        }}
        shift={{
          label: "Mode",
          count: LFO_MODES.length,
          active: 5,
          names: LFO_MODES,
          onPress: onMode,
        }}
      />
    ));

    fireEvent.click(capOf("Wave shape: Triangle"));
    expect(onShape).toHaveBeenCalledTimes(1);
    expect(onMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    expect(litLensesOf(container)).toHaveLength(1);
    fireEvent.click(capOf("Mode: KB + clock sync"));
    expect(onMode).toHaveBeenCalledTimes(1);
    expect(onShape).toHaveBeenCalledTimes(1);
  });

  it("swaps the LED column for the selected layer's own length, keeping both columns' space", () => {
    const { container } = render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }}
        shift={{ label: "Mode", count: 6, active: 0, onPress: () => {} }}
      />
    ));

    const lenses = (): readonly HTMLElement[] =>
      [...container.querySelectorAll("span")].filter((span) =>
        span.style.background.startsWith("var(--e7-led-"),
      );
    const lensCount = (): number => lenses().filter(shown).length;

    expect(lensCount()).toBe(5);
    expect(lenses()).toHaveLength(11);

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    expect(lensCount()).toBe(6);
    expect(lenses()).toHaveLength(11);
  });

  it("keeps the primary column lit under a shift layer that has no lenses of its own", () => {
    const { container } = render(() => (
      <DualButton
        primary={{
          label: "Wave shape",
          count: LFO_SHAPES.length,
          active: 1,
          names: LFO_SHAPES,
          onPress: () => {},
        }}
        shift={{ label: "Mode", count: 0, readout: "Clock Sync", onPress: () => {} }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    expect(litLensesOf(container)).toHaveLength(1);
    expect(container.textContent).toContain("Ramp up");
    expect(container.textContent).toContain("Clock Sync");
  });

  it("wraps a long spelled-out state rather than widening the button under it", () => {
    const { container } = render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }}
        shift={{ label: "Mode", count: 0, readout: "Keyboard + Clock Sync", onPress: () => {} }}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    const line = [...container.querySelectorAll("span")].find(
      (span) => span.textContent === "Keyboard + Clock Sync",
    );
    expect(line?.style.maxWidth).toBe(`${READOUT_WIDTH_REM}rem`);
    expect(line?.style.whiteSpace).toBe("");
  });

  it("marks the selected layer for assistive technology", () => {
    render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 0, onPress: () => {} }}
        shift={{ label: "Mode", count: 6, active: 0, onPress: () => {} }}
      />
    ));

    expect(screen.getByRole("button", { name: "Wave shape" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Mode" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Mode" }));

    expect(screen.getByRole("button", { name: "Wave shape" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Mode" })).toHaveAttribute("aria-pressed", "true");
  });

  it("takes every colour from the theme's custom properties", () => {
    const { container } = render(() => (
      <DualButton
        primary={{ label: "Wave shape", count: 5, active: 2, names: LFO_SHAPES, onPress: () => {} }}
        shift={{ label: "Mode", count: 6, active: 0, names: LFO_MODES, onPress: () => {} }}
      />
    ));

    for (const element of container.querySelectorAll("[style]")) {
      expect(element.getAttribute("style") ?? "").not.toMatch(/#[0-9a-f]{3}\b/i);
    }
  });
});
