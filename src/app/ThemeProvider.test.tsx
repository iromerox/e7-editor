import type { JSX } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { THEME_ROOT_CLASS, ThemeProvider, useTheme } from "./ThemeProvider";
import { DEFAULT_THEME, THEME_VARIABLE_NAMES, themeVariables } from "./theme";

function readVariable(name: string): string {
  const root = document.querySelector(`.${THEME_ROOT_CLASS}`);
  if (root === null) {
    throw new Error("no theme root rendered");
  }
  return getComputedStyle(root).getPropertyValue(name);
}

function BlackRedBlackButton(): JSX.Element {
  const { setPanel, setLed, setCap } = useTheme();

  return (
    <button
      type="button"
      onClick={() => {
        setPanel("black");
        setLed("red");
        setCap("black");
      }}
    >
      switch
    </button>
  );
}

describe("ThemeProvider", () => {
  it("applies the default combination's custom properties", () => {
    render(() => (
      <ThemeProvider>
        <span />
      </ThemeProvider>
    ));

    const expected = themeVariables(DEFAULT_THEME);
    for (const name of THEME_VARIABLE_NAMES) {
      expect(readVariable(name), name).toBe(expected[name]);
    }
  });

  it("honours an initial combination other than the default", () => {
    render(() => (
      <ThemeProvider initial={{ panel: "black", led: "red", cap: "white" }}>
        <span />
      </ThemeProvider>
    ));

    expect(readVariable("--e7-panel")).toBe("#121214");
    expect(readVariable("--e7-led-on")).toBe("#ff321f");
    expect(readVariable("--e7-cap-top")).toBe("#f2eee3");
  });

  it("updates the computed custom properties when the theme changes", async () => {
    render(() => (
      <ThemeProvider>
        <BlackRedBlackButton />
      </ThemeProvider>
    ));

    expect(readVariable("--e7-panel")).toBe("#294a7a");
    expect(readVariable("--e7-led-on")).toBe("#fefae6");
    expect(readVariable("--e7-knob-notch")).toBe("#18181a");

    await fireEvent.click(screen.getByRole("button"));

    const expected = themeVariables({ panel: "black", led: "red", cap: "black" });
    for (const name of THEME_VARIABLE_NAMES) {
      expect(readVariable(name), name).toBe(expected[name]);
    }
  });

  it("rejects a consumer mounted outside the provider", () => {
    expect(() => render(() => <BlackRedBlackButton />)).toThrow(
      "useTheme called outside a ThemeProvider",
    );
  });
});
