import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App scaffolding", () => {
  it("renders", () => {
    render(() => <App />);
    expect(screen.getByText("e7 editor")).toBeInTheDocument();
  });
});
