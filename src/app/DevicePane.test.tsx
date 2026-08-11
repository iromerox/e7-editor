import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import type { ProgramChangeMessage } from "../protocol";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestResponse } from "../midi";
import { LOCK_BYTE_INDEX, NAME_OFFSET, SINGLE_PRESET_BYTES } from "../protocol";
import { AppStateProvider, useAppState } from "./AppStateProvider";
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
  sendProgramChange: (channel, message) => selected.push({ channel, ...message }),
  close: () => Promise.resolve(),
};

interface SentProgramChange extends ProgramChangeMessage {
  readonly channel: number;
}

const selected: SentProgramChange[] = [];

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

function renderPane(active: Connection | undefined): AppStateControls {
  let captured: AppStateControls | undefined;

  function Harness(): JSX.Element {
    const controls = useAppState();
    captured = controls;
    if (active !== undefined) {
      controls.setReceiveChannel({ kind: "channel", channel: 4 });
    }
    return <DevicePane connection={active} />;
  }

  render(() => (
    <AppStateProvider>
      <Harness />
    </AppStateProvider>
  ));

  if (captured === undefined) {
    throw new Error("the pane never rendered");
  }
  return captured;
}

async function settled(): Promise<void> {
  await vi.waitFor(() => expect(screen.queryByText("Reading…")).toBeNull());
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
  selected.length = 0;
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
    expect(screen.getByRole("button", { name: "Select Multi 1.1.1" })).toBeInTheDocument();
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

  it("reads the whole group as soon as it is in view, with no press to start it", async () => {
    serveSlots(
      new Map([
        [slotAt(1, 1, 1), presetImage("Opening Pad", 1)],
        [slotAt(1, 1, 2), presetImage("Pulse Bass", 0)],
      ]),
    );
    renderPane(connection);

    await settled();

    expect(screen.getByText("Opening Pad")).toBeInTheDocument();
    expect(screen.getByText("Pulse Bass")).toBeInTheDocument();
    expect(slotLabels()[0]).toContain("Locked");
    expect(slotLabels()[1]).toContain("Unlocked");
    expect(slotLabels().every((label) => !label.includes("Not read"))).toBe(true);
    expect(screen.queryByRole("button", { name: /^Read / })).toBeNull();
  });

  it("reads the new group when navigation moves to one, and keeps what it already has", async () => {
    serveSlots(new Map([[slotAt(3, 5, 1), presetImage("Metal Flies", 0)]]));
    renderPane(connection);
    await settled();

    await fireEvent.click(screen.getByRole("button", { name: "Bank 3" }));
    await fireEvent.click(screen.getByRole("button", { name: "Group 5" }));
    await settled();

    expect(screen.getByText("Metal Flies")).toBeInTheDocument();

    const reads = vi.mocked(requestResponse).mock.calls.length;
    await fireEvent.click(screen.getByRole("button", { name: "Group 1" }));
    await settled();

    expect(slotLabels()[0]).toContain("3.1.1");
    await fireEvent.click(screen.getByRole("button", { name: "Group 5" }));
    await settled();

    expect(screen.getByText("Metal Flies")).toBeInTheDocument();
    expect(vi.mocked(requestResponse).mock.calls.length).toBeLessThan(reads * 3);
  });

  it("says so when a slot carries no name", async () => {
    renderPane(connection);

    await settled();

    expect(screen.getAllByText("(unnamed)")).toHaveLength(8);
  });

  it("keeps navigation working while reads are in flight, and caches the results", async () => {
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

    expect(slotLabels()[0]).toContain("Reading…");

    await fireEvent.click(screen.getByRole("button", { name: "Group 2" }));
    expect(slotLabels()[0]).toContain("1.2.1");

    release();

    await fireEvent.click(screen.getByRole("button", { name: "Group 1" }));
    await vi.waitFor(() => expect(screen.getByText("Opening Pad")).toBeInTheDocument());
  });

  it("offers a slot the device never answered for a read of its own, and leaves the rest alone", async () => {
    vi.mocked(requestResponse).mockRejectedValue(new Error("no response"));
    renderPane(connection);

    await settled();

    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("no response");
    expect(screen.getByRole("button", { name: "Read Single 1.1.2 again" })).toBeEnabled();

    serveSlots(new Map([[slotAt(1, 1, 2), presetImage("Pulse Bass", 0)]]));
    await fireEvent.click(screen.getByRole("button", { name: "Read Single 1.1.2 again" }));

    await vi.waitFor(() => expect(screen.getByText("Pulse Bass")).toBeInTheDocument());
  });

  it("reads nothing and selects nothing while there is no connection", () => {
    renderPane(undefined);

    expect(screen.getByText(/Connect to a device/)).toBeInTheDocument();
    expect(vi.mocked(requestResponse)).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Select Single 1.1.1" })).toBeDisabled();
  });

  it("plays a slot on the instrument with the bank select and program change addressing it", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("button", { name: "Bank 2" }));
    await fireEvent.click(screen.getByRole("button", { name: "Group 3" }));
    await fireEvent.click(screen.getByRole("button", { name: "Select Single 2.3.5" }));

    expect(selected).toEqual([{ channel: 4, bankMsb: 0, bankLsb: 0, program: 84 }]);
  });

  it("addresses a multi on the other bank select", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    await fireEvent.click(screen.getByRole("button", { name: "Select Multi 1.1.2" }));

    expect(selected).toEqual([{ channel: 4, bankMsb: 1, bankLsb: 0, program: 1 }]);
  });

  it("marks the slot it last selected, and only while the browser still shows it", async () => {
    renderPane(connection);

    await fireEvent.click(screen.getByRole("button", { name: "Select Single 1.1.6" }));

    expect(screen.getByRole("button", { name: "Select Single 1.1.6" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await fireEvent.click(screen.getByRole("button", { name: "Group 2" }));

    expect(screen.getByRole("button", { name: "Select Single 1.2.6" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("says selecting plays the slot rather than loading it into the editor", () => {
    renderPane(connection);

    expect(screen.getByText(/does not load the preset into the editor/)).toBeInTheDocument();
  });
});
