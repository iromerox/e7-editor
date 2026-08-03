import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { Led, LedRow, LedStack, NO_LED_LIT, activeLedName, ledName, litIndex } from "./Led";

const LFO_SHAPES = ["Triangle", "Ramp up", "Ramp down", "Square", "S&H"] as const;

const LFO3_SHAPES = ["Triangle", "Ramp up", "Ramp down", "Square"] as const;

const OSC_SHAPES = ["Triangle", "Saw-tri", "Sawtooth"] as const;

const POLYPHONY_MODES = ["Poly", "ST", "MT", "Unison"] as const;

function lensesOf(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll("span")].filter(
    (span) => span.getAttribute("aria-hidden") === "true",
  );
}

function backgroundOf(lens: HTMLElement): string {
  return lens.style.background;
}

function lensOf(container: HTMLElement): HTMLElement {
  const [lens] = lensesOf(container);
  if (lens === undefined) {
    throw new Error("no LED lens rendered");
  }
  return lens;
}

describe("led naming", () => {
  it("numbers unnamed LEDs from one, the way the panel prints them", () => {
    expect(ledName(0)).toBe("1");
    expect(ledName(6)).toBe("7");
    expect(ledName(1, LFO_SHAPES)).toBe("Ramp up");
  });

  it("treats an index outside the column as nothing lit", () => {
    expect(litIndex(5, 4)).toBe(4);
    expect(litIndex(5, 5)).toBeUndefined();
    expect(litIndex(5, -1)).toBeUndefined();
    expect(litIndex(5, undefined)).toBeUndefined();
    expect(activeLedName(3, undefined, OSC_SHAPES)).toBe(NO_LED_LIT);
    expect(activeLedName(3, 2, OSC_SHAPES)).toBe("Sawtooth");
  });
});

describe("Led", () => {
  it("takes both lit states from the theme's LED custom properties", () => {
    const { container: off } = render(() => <Led lit={false} />);
    const { container: on } = render(() => <Led lit={true} />);

    expect(backgroundOf(lensOf(off))).toBe("var(--e7-led-off)");
    expect(backgroundOf(lensOf(on))).toBe("var(--e7-led-on)");
  });

  it("halos only the lit lens", () => {
    const { container: off } = render(() => <Led lit={false} />);
    const { container: on } = render(() => <Led lit={true} />);

    expect(lensOf(on).style.boxShadow).toContain("var(--e7-led-halo)");
    expect(lensOf(off).style.boxShadow).not.toContain("var(--e7-led-halo)");
  });
});

describe("LedRow", () => {
  it("draws the count it is given, at the seven the VOICES row uses", () => {
    const { container } = render(() => (
      <LedRow count={7} lit={[true, false, true, false, false, false, false]} />
    ));

    expect(lensesOf(container)).toHaveLength(7);
  });

  it("keeps the row at its own length when fewer states are supplied", () => {
    const { container } = render(() => <LedRow count={7} lit={[true]} />);

    const lenses = lensesOf(container);
    expect(lenses).toHaveLength(7);
    expect(lenses.filter((lens) => backgroundOf(lens) === "var(--e7-led-on)")).toHaveLength(1);
  });

  it("renders any length asked for rather than one baked in", () => {
    for (const count of [1, 4, 5, 7, 10]) {
      const { container, unmount } = render(() => <LedRow count={count} lit={[]} />);
      expect(lensesOf(container)).toHaveLength(count);
      unmount();
    }
  });

  it("reads its lit LEDs out to assistive technology when it carries a label", () => {
    render(() => (
      <LedRow label="VOICES" count={7} lit={[true, false, true, false, true, false, false]} />
    ));

    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "VOICES: 1, 3, 5");
  });

  it("says so when nothing is lit", () => {
    render(() => <LedRow label="VOICES" count={7} lit={[]} />);

    expect(screen.getByRole("img")).toHaveAttribute("aria-label", `VOICES: ${NO_LED_LIT}`);
  });

  it("hides itself from assistive technology when something else names it", () => {
    const { container } = render(() => <LedRow count={7} lit={[true]} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("LedStack", () => {
  it("draws the waveshape counts each LFO actually has", () => {
    for (const shapes of [LFO_SHAPES, LFO_SHAPES, LFO3_SHAPES, OSC_SHAPES]) {
      const { container, unmount } = render(() => (
        <LedStack count={shapes.length} active={0} names={shapes} />
      ));
      expect(lensesOf(container)).toHaveLength(shapes.length);
      unmount();
    }
  });

  it("lights exactly the active LED", () => {
    const { container } = render(() => (
      <LedStack count={LFO_SHAPES.length} active={3} names={LFO_SHAPES} />
    ));

    const lit = lensesOf(container).map((lens) => backgroundOf(lens) === "var(--e7-led-on)");
    expect(lit).toStrictEqual([false, false, false, true, false]);
  });

  it("lights nothing when the state has no LED, as the oscillators' pulse-only shape does", () => {
    const { container } = render(() => <LedStack count={3} names={OSC_SHAPES} />);

    expect(lensesOf(container).every((lens) => backgroundOf(lens) === "var(--e7-led-off)")).toBe(
      true,
    );
  });

  it("prints each state's name beside its LED, as the panel prints its glyphs", () => {
    render(() => <LedStack count={4} active={1} names={POLYPHONY_MODES} />);

    for (const mode of POLYPHONY_MODES) {
      expect(screen.getByText(mode)).toBeInTheDocument();
    }
  });

  it("draws plain lenses when the states have no names", () => {
    const { container } = render(() => <LedStack count={5} active={0} />);

    expect(lensesOf(container)).toHaveLength(5);
    expect(container.textContent).toBe("");
  });

  it("names its current state for assistive technology when it carries a label", () => {
    render(() => <LedStack label="Wave shape" count={5} active={4} names={LFO_SHAPES} />);

    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Wave shape: S&H");
  });

  it("hides itself from assistive technology when something else names it", () => {
    const { container } = render(() => <LedStack count={5} active={0} names={LFO_SHAPES} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("takes every colour from the theme's custom properties", () => {
    const { container } = render(() => (
      <LedStack label="Wave shape" count={5} active={2} names={LFO_SHAPES} />
    ));

    for (const element of container.querySelectorAll("[style]")) {
      expect(element.getAttribute("style") ?? "").not.toMatch(/#[0-9a-f]{3}\b/i);
    }
  });
});
