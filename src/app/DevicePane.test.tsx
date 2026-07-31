import type { Connection } from "../midi";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestResponse } from "../midi";
import { LOCK_BYTE_INDEX, NAME_OFFSET, SINGLE_PRESET_BYTES } from "../protocol";
import { AppStateProvider } from "./AppStateProvider";
import { DevicePane } from "./DevicePane";
import { slotByteAddress } from "./device-slots";

vi.mock("../midi", () => ({ requestResponse: vi.fn() }));

const READ_BLOCK_BYTES = 16;

const connection: Connection = {
  inputName: "GS Music e7 IN",
  outputName: "GS Music e7 OUT",
  sysex: EMPTY,
  sysexMonitor: EMPTY,
  cc: EMPTY,
  isOpen: true,
  reassembly: { pendingBytes: 0, fragmentedFrames: 0, discardedPartials: 0 },
  send: () => {},
  sendCommand: () => {},
  sendControlChange: () => {},
  close: () => Promise.resolve(),
};

function presetImage(name: string, lockByte: number): Uint8Array {
  const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
  for (const [index, character] of [...name].entries()) {
    bytes[NAME_OFFSET + index] = character.charCodeAt(0);
  }
  bytes[LOCK_BYTE_INDEX] = lockByte;
  return bytes;
}

function serveSlots(images: ReadonlyMap<number, Uint8Array>): void {
  vi.mocked(requestResponse).mockImplementation((_connection, command) => {
    if (command.kind !== "read-memory") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    const base = command.address - (command.address % SINGLE_PRESET_BYTES);
    const image = images.get(base) ?? new Uint8Array(SINGLE_PRESET_BYTES);
    const offset = command.address - base;
    return Promise.resolve({
      kind: "memory-data",
      data: image.slice(offset, offset + READ_BLOCK_BYTES),
    });
  });
}

function slotAt(bank: number, group: number, slot: number): number {
  return slotByteAddress({ kind: "Single", bank, group, slot });
}

function renderPane(active: Connection | undefined): void {
  render(() => (
    <AppStateProvider>
      <DevicePane connection={active} />
    </AppStateProvider>
  ));
}

async function readSlot(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name }));
}

function slotLabels(): string[] {
  return screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
}

function bankButtons(): string[] {
  return screen
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? "")
    .filter((label) => label.startsWith("Bank "));
}

beforeEach(() => {
  vi.mocked(requestResponse).mockReset();
  serveSlots(new Map());
});

describe("DevicePane", () => {
  it("renders a group of eight slots under eight banks of eight groups", () => {
    renderPane(connection);

    expect(bankButtons()).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((bank) => `Bank ${bank}`));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("group", { name: "Group" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Group 8" })).toBeInTheDocument();
    expect(slotLabels()[0]).toContain("1.1.1");
    expect(slotLabels()[7]).toContain("1.1.8");
  });

  it("offers only the two banks the multi range reaches", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("tab", { name: "Multi" }));

    expect(bankButtons()).toEqual(["Bank 1", "Bank 2"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Read Multi 1.1.1" })).toBeInTheDocument();
  });

  it("falls back to the first bank when the selected one is out of the multi range", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("button", { name: "Bank 8" }));
    await fireEvent.click(screen.getByRole("tab", { name: "Multi" }));

    expect(screen.getByRole("button", { name: "Bank 1" })).toHaveAttribute("aria-pressed", "true");
    expect(slotLabels()[0]).toContain("1.1.1");
  });

  it("navigates to the slots of another bank and group", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("button", { name: "Bank 3" }));
    await fireEvent.click(screen.getByRole("button", { name: "Group 5" }));

    expect(slotLabels()[0]).toContain("3.5.1");
    expect(slotLabels()[7]).toContain("3.5.8");
  });

  it("fills a slot in with the name and lock state the device reports", async () => {
    serveSlots(
      new Map([
        [slotAt(1, 1, 1), presetImage("Opening Pad", 1)],
        [slotAt(1, 1, 2), presetImage("Pulse Bass", 0)],
      ]),
    );
    renderPane(connection);

    await readSlot("Read Single 1.1.1");
    await readSlot("Read Single 1.1.2");

    await vi.waitFor(() => expect(screen.getByText("Opening Pad")).toBeInTheDocument());
    await vi.waitFor(() => expect(screen.getByText("Pulse Bass")).toBeInTheDocument());
    expect(slotLabels()[0]).toContain("Locked");
    expect(slotLabels()[1]).toContain("Unlocked");
    expect(slotLabels()[2]).toContain("Not read");
  });

  it("says so when a slot carries no name", async () => {
    renderPane(connection);

    await readSlot("Read Single 1.1.1");

    await vi.waitFor(() => expect(screen.getByText("(unnamed)")).toBeInTheDocument());
  });

  it("keeps navigation working while a read is in flight, and caches the result", async () => {
    let release = (): void => {};
    const answering = new Promise<void>((resolve) => {
      release = resolve;
    });
    const served = new Map([[slotAt(1, 1, 1), presetImage("Opening Pad", 1)]]);
    vi.mocked(requestResponse).mockImplementation(async (_connection, command) => {
      if (command.kind !== "read-memory") {
        throw new Error(`unexpected command ${command.kind}`);
      }
      await answering;
      const base = command.address - (command.address % SINGLE_PRESET_BYTES);
      const image = served.get(base) ?? new Uint8Array(SINGLE_PRESET_BYTES);
      const offset = command.address - base;
      return { kind: "memory-data", data: image.slice(offset, offset + READ_BLOCK_BYTES) };
    });
    renderPane(connection);

    await readSlot("Read Single 1.1.1");
    expect(slotLabels()[0]).toContain("Reading…");

    await fireEvent.click(screen.getByRole("button", { name: "Group 2" }));
    expect(slotLabels()[0]).toContain("1.2.1");
    expect(slotLabels()[0]).toContain("Not read");

    release();

    await fireEvent.click(screen.getByRole("button", { name: "Group 1" }));
    await vi.waitFor(() => expect(screen.getByText("Opening Pad")).toBeInTheDocument());
  });

  it("reports a slot the device never answers for, leaving the rest readable", async () => {
    vi.mocked(requestResponse).mockRejectedValue(new Error("no response"));
    renderPane(connection);

    await readSlot("Read Single 1.1.1");

    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no response"));
    expect(screen.getByRole("button", { name: "Read Single 1.1.2" })).toBeEnabled();
  });

  it("explains that reading needs a connection when there is none", () => {
    renderPane(undefined);

    expect(screen.getByText(/Connect to a device/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read Single 1.1.1" })).toBeDisabled();
  });
});
