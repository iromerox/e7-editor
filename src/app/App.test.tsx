import type { LibraryDatabase } from "../store";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLibraryDatabase } from "../store";
import { App } from "./App";
import { THEME_ROOT_CLASS } from "./ThemeProvider";

let database: LibraryDatabase;

function readVariable(name: string): string {
  const root = document.querySelector(`.${THEME_ROOT_CLASS}`);
  if (root === null) {
    throw new Error("no theme root rendered");
  }
  return getComputedStyle(root).getPropertyValue(name);
}

beforeEach(async () => {
  database = await createLibraryDatabase({
    name: `shell-${Math.random().toString(36).slice(2)}`,
  });
});

afterEach(async () => {
  await database.close();
});

describe("App shell", () => {
  it("renders", () => {
    render(() => <App database={database} />);
    expect(screen.getByText("e7 editor")).toBeInTheDocument();
  });

  it("mounts inside a theme root carrying the default finish", () => {
    render(() => <App database={database} />);
    expect(readVariable("--e7-panel")).toBe("#0a4a72");
  });

  it("shows the library and device panes alongside the connection bar", () => {
    render(() => <App database={database} />);
    expect(screen.getByRole("region", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Device connection" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Device" })).toBeInTheDocument();
  });

  it("leaves the device pane inert until a device is connected", () => {
    render(() => <App database={database} />);
    expect(screen.getByRole("button", { name: "Select Single 1.1.1" })).toBeDisabled();
  });

  it("repaints the shell when a finish axis is changed", async () => {
    render(() => <App database={database} />);

    await fireEvent.change(screen.getByLabelText("Panel"), { target: { value: "black" } });
    expect(readVariable("--e7-panel")).toBe("#3a2f2c");

    await fireEvent.change(screen.getByLabelText("Caps"), { target: { value: "black" } });
    expect(readVariable("--e7-knob-notch")).toBe("#fcf5f0");
    expect(readVariable("--e7-panel")).toBe("#3a2f2c");
  });
});
