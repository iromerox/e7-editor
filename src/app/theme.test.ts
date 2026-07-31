import type { Theme, ThemeVariableName } from "./theme";
import { describe, expect, it } from "vitest";
import {
  CAP_COLORS,
  DEFAULT_THEME,
  LED_COLORS,
  PANEL_TONES,
  THEME_COMBINATIONS,
  THEME_VARIABLE_NAMES,
  themeVariables,
} from "./theme";

const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

function redChannel(color: string): number {
  return Number.parseInt(color.slice(1, 3), 16);
}

function withTheme(overrides: Partial<Theme>): Theme {
  return { ...DEFAULT_THEME, ...overrides };
}

function variableFor(overrides: Partial<Theme>, variable: ThemeVariableName): string {
  return themeVariables(withTheme(overrides))[variable];
}

function duplicateGroups(theme: Theme): string[][] {
  const byValue = new Map<string, string[]>();
  for (const name of THEME_VARIABLE_NAMES) {
    const value = themeVariables(theme)[name];
    byValue.set(value, [...(byValue.get(value) ?? []), name]);
  }
  return [...byValue.values()].filter((names) => names.length > 1);
}

describe("theme axes", () => {
  it("defaults to the blue panel with white LEDs and white caps", () => {
    expect(DEFAULT_THEME).toEqual({ panel: "blue", led: "white", cap: "white" });
  });

  it("enumerates all eight combinations exactly once", () => {
    expect(THEME_COMBINATIONS).toHaveLength(
      PANEL_TONES.length * LED_COLORS.length * CAP_COLORS.length,
    );
    const keys = THEME_COMBINATIONS.map(({ panel, led, cap }) => `${panel}/${led}/${cap}`);
    expect(new Set(keys).size).toBe(8);
  });

  it("starts the enumeration at the default combination", () => {
    expect(THEME_COMBINATIONS[0]).toEqual(DEFAULT_THEME);
  });
});

describe("themeVariables", () => {
  it("defines every variable as a valid hex color for every combination", () => {
    for (const theme of THEME_COMBINATIONS) {
      const variables = themeVariables(theme);
      expect(Object.keys(variables).sort()).toEqual([...THEME_VARIABLE_NAMES].sort());
      for (const name of THEME_VARIABLE_NAMES) {
        expect(variables[name], `${name} of ${theme.panel}/${theme.led}/${theme.cap}`).toMatch(
          HEX_COLOR,
        );
      }
    }
  });

  it("gives each of the eight combinations a distinct set of values", () => {
    const rendered = THEME_COMBINATIONS.map((theme) => JSON.stringify(themeVariables(theme)));
    expect(new Set(rendered).size).toBe(8);
  });

  it("shares a value between two variables only where the label aliases the silkscreen", () => {
    for (const theme of THEME_COMBINATIONS) {
      expect(duplicateGroups(theme), `${theme.panel}/${theme.led}/${theme.cap}`).toEqual([
        ["--e7-silkscreen", "--e7-label"],
      ]);
    }
  });

  it("derives the panel variables from the panel tone alone", () => {
    for (const name of ["--e7-panel", "--e7-section-background", "--e7-silkscreen"] as const) {
      expect(variableFor({ panel: "blue" }, name)).not.toBe(variableFor({ panel: "black" }, name));
      expect(variableFor({ panel: "blue", led: "red" }, name)).toBe(
        variableFor({ panel: "blue" }, name),
      );
    }
  });

  it("derives the LED variables from the LED color alone", () => {
    for (const name of ["--e7-led-on", "--e7-led-off", "--e7-led-halo"] as const) {
      expect(variableFor({ led: "white" }, name)).not.toBe(variableFor({ led: "red" }, name));
      expect(variableFor({ led: "red", cap: "black" }, name)).toBe(
        variableFor({ led: "red" }, name),
      );
    }
  });

  it("derives the cap variables from the cap color alone", () => {
    for (const name of ["--e7-cap-top", "--e7-cap-bottom", "--e7-knob-notch"] as const) {
      expect(variableFor({ cap: "white" }, name)).not.toBe(variableFor({ cap: "black" }, name));
      expect(variableFor({ cap: "black", panel: "black" }, name)).toBe(
        variableFor({ cap: "black" }, name),
      );
    }
  });

  it("derives the halo from the lit LED color at a low alpha", () => {
    for (const led of LED_COLORS) {
      const variables = themeVariables(withTheme({ led }));
      expect(variables["--e7-led-halo"]).toBe(`${variables["--e7-led-on"]}28`);
    }
  });

  it("inverts the knob notch against the cap so it stays readable", () => {
    const onWhite = redChannel(variableFor({ cap: "white" }, "--e7-knob-notch"));
    const onBlack = redChannel(variableFor({ cap: "black" }, "--e7-knob-notch"));
    expect(Math.abs(onWhite - onBlack)).toBeGreaterThan(100);
  });

  it("keeps the modified dot constant so it reads against any panel", () => {
    const dots = THEME_COMBINATIONS.map((theme) => themeVariables(theme)["--e7-modified-dot"]);
    expect(new Set(dots)).toEqual(new Set(["#ffc100"]));
  });
});
