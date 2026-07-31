import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { THEME_ROOT_CLASS } from "./ThemeProvider";

function readVariable(name: string): string {
  const root = document.querySelector(`.${THEME_ROOT_CLASS}`);
  if (root === null) {
    throw new Error("no theme root rendered");
  }
  return getComputedStyle(root).getPropertyValue(name);
}

describe("App shell", () => {
  it("renders", () => {
    render(() => <App />);
    expect(screen.getByText("e7 editor")).toBeInTheDocument();
  });

  it("mounts inside a theme root carrying the default finish", () => {
    render(() => <App />);
    expect(readVariable("--e7-panel")).toBe("#294a7a");
  });

  it("repaints the shell when a finish axis is changed", async () => {
    render(() => <App />);

    await fireEvent.change(screen.getByLabelText("Panel"), { target: { value: "black" } });
    expect(readVariable("--e7-panel")).toBe("#121214");

    await fireEvent.change(screen.getByLabelText("Caps"), { target: { value: "black" } });
    expect(readVariable("--e7-knob-notch")).toBe("#e0e0da");
    expect(readVariable("--e7-panel")).toBe("#121214");
  });
});
