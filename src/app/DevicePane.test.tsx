import type { JSX } from "solid-js";
import type { Connection } from "../midi";
import type { ProgramChangeMessage } from "../protocol";
import type { LibraryDatabase, LibraryEntry } from "../store";
import type { AppStateControls } from "./app-state";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestResponse } from "../midi";
import {
  LOCK_BYTE_INDEX,
  MULTI_PRESET_BYTES,
  NAME_BYTES,
  NAME_OFFSET,
  SINGLE_PRESET_BYTES,
  decodeMultiPreset,
  decodeSinglePreset,
} from "../protocol";
import { createLibraryDatabase } from "../store";
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

const written: number[] = [];

function presetImage(name: string, lockByte: number): Uint8Array {
  const bytes = new Uint8Array(SINGLE_PRESET_BYTES);
  for (const [index, character] of [...name].entries()) {
    bytes[NAME_OFFSET + index] = character.charCodeAt(0);
  }
  bytes[LOCK_BYTE_INDEX] = lockByte;
  return bytes;
}

function slotFixture(name: string, length = SINGLE_PRESET_BYTES): Uint8Array {
  const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
  for (let part = 0; part < length; part += SINGLE_PRESET_BYTES) {
    bytes.fill(0x20, part + NAME_OFFSET, part + NAME_OFFSET + NAME_BYTES);
    for (const [index, character] of [...name].entries()) {
      bytes[part + NAME_OFFSET + index] = character.charCodeAt(0);
    }
    bytes[part + LOCK_BYTE_INDEX] = 0;
  }
  return bytes;
}

function blockOf(images: ReadonlyMap<number, Uint8Array>, address: number): Uint8Array {
  for (const [base, image] of images) {
    if (address >= base && address < base + image.length) {
      const offset = address - base;
      return image.slice(offset, offset + READ_BLOCK_BYTES);
    }
  }
  return new Uint8Array(READ_BLOCK_BYTES);
}

function serveSlots(images: ReadonlyMap<number, Uint8Array>): void {
  vi.mocked(requestResponse).mockImplementation((_connection, command) => {
    if (command.kind !== "read-memory") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    return Promise.resolve({ kind: "memory-data", data: blockOf(images, command.address) });
  });
}

function storeBlock(
  images: ReadonlyMap<number, Uint8Array>,
  address: number,
  data: Uint8Array,
): void {
  for (const [base, image] of images) {
    if (address >= base && address < base + image.length) {
      image.set(data, address - base);
      return;
    }
  }
}

function serveDevice(images: ReadonlyMap<number, Uint8Array>): void {
  vi.mocked(requestResponse).mockImplementation((_connection, command) => {
    if (command.kind === "read-memory") {
      return Promise.resolve({ kind: "memory-data", data: blockOf(images, command.address) });
    }
    if (command.kind !== "write-memory") {
      throw new Error(`unexpected command ${command.kind}`);
    }
    written.push(command.address);
    storeBlock(images, command.address, command.data);
    return Promise.resolve({ kind: "memory-data", data: command.data });
  });
}

function imageAt(images: ReadonlyMap<number, Uint8Array>, base: number): Uint8Array {
  const image = images.get(base);
  if (image === undefined) {
    throw new Error(`nothing served at ${base}`);
  }
  return image;
}

function slotAt(bank: number, group: number, slot: number): number {
  return slotByteAddress({ kind: "Single", bank, group, slot });
}

function blockAddresses(base: number, blocks: number): number[] {
  return Array.from({ length: blocks }, (_, index) => base + index * READ_BLOCK_BYTES);
}

function renderPane(active: Connection | undefined): AppStateControls {
  let captured: AppStateControls | undefined;

  function Harness(): JSX.Element {
    const controls = useAppState();
    captured = controls;
    if (active !== undefined) {
      controls.setReceiveChannel({ kind: "channel", channel: 4 });
    }
    return <DevicePane connection={active} database={library} />;
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

let library: LibraryDatabase;

beforeEach(async () => {
  vi.mocked(requestResponse).mockReset();
  serveSlots(new Map());
  selected.length = 0;
  written.length = 0;
  library = await createLibraryDatabase({
    name: `device-pane-${Math.random().toString(36).slice(2)}`,
  });
});

afterEach(async () => {
  await library.close();
});

async function storedEntries(): Promise<readonly LibraryEntry[]> {
  const found = await library.entries.find().exec();
  return found.map((document) => document.toJSON() as LibraryEntry);
}

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

describe("DevicePane transfers", () => {
  it("puts a slot's preset in the editor, and leaves the library as it was", async () => {
    const image = slotFixture("Fat Brass");
    serveSlots(new Map([[slotAt(1, 1, 3), image]]));
    const controls = renderPane(connection);
    await settled();

    await fireEvent.click(
      screen.getByRole("button", { name: "Load Single 1.1.3 into the editor" }),
    );

    await vi.waitFor(() =>
      expect(controls.state.editor.source).toEqual({
        kind: "DeviceSlot",
        address: { kind: "Single", bank: 1, group: 1, slot: 3 },
      }),
    );
    expect(controls.state.editor.preset).toEqual(decodeSinglePreset(image));
    expect(controls.state.editor.part).toBeUndefined();
    expect(await storedEntries()).toEqual([]);
    expect(slotLabels()[2]).toContain("In the editor");
  });

  it("loads part 1 of a multi and says which part the editor holds", async () => {
    const image = slotFixture("Split Keys", MULTI_PRESET_BYTES);
    serveSlots(new Map([[slotByteAddress({ kind: "Multi", bank: 1, group: 1, slot: 2 }), image]]));
    const controls = renderPane(connection);
    await fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    await settled();

    await fireEvent.click(screen.getByRole("button", { name: "Load Multi 1.1.2 into the editor" }));

    await vi.waitFor(() => expect(controls.state.editor.part).toBe(1));
    expect(controls.state.editor.preset).toEqual(decodeMultiPreset(image).parts[0]);
    expect(slotLabels()[1]).toContain("Part 1 in the editor");
  });

  it("marks the slot it is reading busy and leaves the other slots usable", async () => {
    serveSlots(new Map([[slotAt(1, 1, 1), slotFixture("Opening Pad")]]));
    renderPane(connection);
    await settled();

    let release = (): void => {};
    const answering = new Promise<void>((resolve) => {
      release = resolve;
    });
    const images = new Map([[slotAt(1, 1, 1), slotFixture("Opening Pad")]]);
    vi.mocked(requestResponse).mockImplementation(async (_connection, command) => {
      if (command.kind !== "read-memory") {
        throw new Error(`unexpected command ${command.kind}`);
      }
      await answering;
      return { kind: "memory-data", data: blockOf(images, command.address) };
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "Load Single 1.1.1 into the editor" }),
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Load Single 1.1.1 into the editor" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Load Single 1.1.2 into the editor" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Group 4" })).toBeEnabled();

    release();
    await vi.waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  });

  it("keeps the editor's preset when the read fails, and reports the reason at the slot", async () => {
    const controls = renderPane(connection);
    await settled();
    const before = controls.state.editor.preset;
    vi.mocked(requestResponse).mockRejectedValue(new Error("no response"));

    await fireEvent.click(
      screen.getByRole("button", { name: "Load Single 1.1.4 into the editor" }),
    );

    await vi.waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("no response"));
    expect(controls.state.editor.source).toEqual({ kind: "Empty" });
    expect(controls.state.editor.preset).toEqual(before);
  });

  it("asks before replacing unsaved edits, and loads only once told to", async () => {
    serveSlots(new Map([[slotAt(1, 1, 5), slotFixture("Metal Flies")]]));
    const controls = renderPane(connection);
    await settled();
    controls.editField("filterCutoff", 42);
    controls.recordEdit({ field: "filterCutoff", previousValue: 0, nextValue: 42, at: Date.now() });

    await fireEvent.click(
      screen.getByRole("button", { name: "Load Single 1.1.5 into the editor" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent("discarding 1 edit");
    expect(controls.state.editor.source).toEqual({ kind: "Empty" });

    await fireEvent.click(
      screen.getByRole("button", { name: "Keep editing, leaving Single 1.1.5 where it is" }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(controls.state.editor.preset.filter.cutoff).toBe(42);

    await fireEvent.click(
      screen.getByRole("button", { name: "Load Single 1.1.5 into the editor" }),
    );
    await fireEvent.click(screen.getByRole("button", { name: "Load Single 1.1.5 anyway" }));

    await vi.waitFor(() => expect(controls.state.editor.source).not.toEqual({ kind: "Empty" }));
    expect(controls.state.history.undo).toEqual([]);
  });

  it("saves a slot to the library as a device dump of the address it read", async () => {
    const image = slotFixture("Fat Brass");
    serveSlots(new Map([[slotAt(3, 5, 2), image]]));
    const controls = renderPane(connection);
    await fireEvent.click(screen.getByRole("button", { name: "Bank 3" }));
    await fireEvent.click(screen.getByRole("button", { name: "Group 5" }));
    await settled();

    await fireEvent.click(screen.getByRole("button", { name: "Save Single 3.5.2 to the library" }));

    await vi.waitFor(async () => expect(await storedEntries()).toHaveLength(1));
    const [entry] = await storedEntries();
    expect(entry).toMatchObject({
      kind: "Single",
      name: "Fat Brass",
      source: "DeviceDump",
      bank: 3,
      group: 5,
      slot: 2,
    });
    expect(screen.getByText(/Saved to the library as/)).toHaveTextContent("Fat Brass");
    expect(controls.state.editor.source).toEqual({ kind: "Empty" });
  });

  it("offers no transfer at all while there is no connection", () => {
    renderPane(undefined);

    expect(
      screen.getByRole("button", { name: "Load Single 1.1.1 into the editor" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Single 1.1.1 to the library" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Write the editor's preset to Single 1.1.1" }),
    ).toBeDisabled();
  });
});

describe("DevicePane writes", () => {
  async function editing(
    images: ReadonlyMap<number, Uint8Array>,
    from: string,
  ): Promise<AppStateControls> {
    serveDevice(images);
    const controls = renderPane(connection);
    await fireEvent.click(screen.getByRole("button", { name: "Group 8" }));
    await settled();
    await fireEvent.click(screen.getByRole("button", { name: `Load ${from} into the editor` }));
    await vi.waitFor(() => expect(controls.state.editor.source).not.toEqual({ kind: "Empty" }));
    return controls;
  }

  async function write(target: string, confirm: boolean): Promise<void> {
    await fireEvent.click(
      screen.getByRole("button", { name: `Write the editor's preset to ${target}` }),
    );
    if (confirm) {
      await fireEvent.click(
        screen.getByRole("button", { name: `Write the editor's preset to ${target} anyway` }),
      );
    }
  }

  it("asks before it writes, naming the slot, and sends nothing until it is told to", async () => {
    const images = new Map([
      [slotAt(1, 8, 3), slotFixture("Fat Brass")],
      [slotAt(1, 8, 5), new Uint8Array(SINGLE_PRESET_BYTES)],
    ]);
    const controls = await editing(images, "Single 1.8.3");

    await write("Single 1.8.5", false);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Writing replaces what Single 1.8.5 holds on the instrument",
    );
    expect(written).toEqual([]);

    await fireEvent.click(
      screen.getByRole("button", {
        name: "Keep what is stored, leaving Single 1.8.5 as the instrument has it",
      }),
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(written).toEqual([]);

    await write("Single 1.8.5", true);

    await vi.waitFor(() =>
      expect(screen.getByText("Written to Single 1.8.5.")).toBeInTheDocument(),
    );
    expect(written).toEqual(blockAddresses(slotAt(1, 8, 5), 8));
    expect(decodeSinglePreset(imageAt(images, slotAt(1, 8, 5)))).toEqual(
      controls.state.editor.preset,
    );
    expect(slotLabels()[4]).toContain("Fat Brass");
  });

  it("writes the preset unlocked, so a preset taken from a locked slot cannot lock the slot it lands in", async () => {
    const source = slotFixture("Opening Pad");
    source[LOCK_BYTE_INDEX] = 1;
    const images = new Map([
      [slotAt(1, 8, 1), source],
      [slotAt(1, 8, 6), new Uint8Array(SINGLE_PRESET_BYTES)],
    ]);
    await editing(images, "Single 1.8.1");

    await write("Single 1.8.6", true);

    await vi.waitFor(() =>
      expect(screen.getByText("Written to Single 1.8.6.")).toBeInTheDocument(),
    );
    const landed = imageAt(images, slotAt(1, 8, 6));
    expect(landed[LOCK_BYTE_INDEX]).toBe(0);
    expect(landed.subarray(0, LOCK_BYTE_INDEX)).toEqual(source.subarray(0, LOCK_BYTE_INDEX));
  });

  it("refuses the factory range, with the reason at the slot and nothing on the wire", async () => {
    serveDevice(new Map());
    renderPane(connection);
    await settled();

    await write("Single 1.1.1", false);

    expect(screen.getByRole("alert")).toHaveTextContent("Single 1.1.1 is a factory preset");
    expect(written).toEqual([]);
    expect(
      screen.queryByRole("button", { name: "Write the editor's preset to Single 1.1.1 anyway" }),
    ).toBeNull();
  });

  it("refuses a multi slot, which the editor's one preset cannot fill", async () => {
    serveDevice(new Map());
    renderPane(connection);
    await fireEvent.click(screen.getByRole("tab", { name: "Multi" }));
    await settled();

    await write("Multi 1.1.1", false);

    expect(screen.getByRole("alert")).toHaveTextContent("Multi 1.1.1 holds four presets");
    expect(written).toEqual([]);
  });

  it("reads the target's lock byte itself, refusing a slot locked since the cell was read", async () => {
    const target = slotFixture("Opening Pad");
    const images = new Map([
      [slotAt(1, 8, 1), slotFixture("Fat Brass")],
      [slotAt(1, 8, 2), target],
    ]);
    await editing(images, "Single 1.8.1");
    expect(slotLabels()[1]).toContain("Unlocked");

    target[LOCK_BYTE_INDEX] = 1;
    await write("Single 1.8.2", true);

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Single 1.8.2 is locked on the instrument",
      ),
    );
    expect(written).toEqual([]);
  });

  it("reports the block a write stopped at rather than reporting a write", async () => {
    const base = slotAt(1, 8, 4);
    const images = new Map([
      [slotAt(1, 8, 1), slotFixture("Fat Brass")],
      [base, new Uint8Array(SINGLE_PRESET_BYTES)],
    ]);
    await editing(images, "Single 1.8.1");
    const serving = vi.mocked(requestResponse).getMockImplementation();
    vi.mocked(requestResponse).mockImplementation((sent, command) => {
      if (command.kind === "write-memory" && command.address === base + 3 * READ_BLOCK_BYTES) {
        return Promise.reject(new Error("no write-memory response parsed within 1000ms"));
      }
      return serving?.(sent, command) ?? Promise.reject(new Error("nothing served"));
    });

    await write("Single 1.8.4", true);

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("stopped at block 4 of 8"),
    );
    expect(screen.queryByText(/^Written to/)).toBeNull();
    expect(written).toEqual(blockAddresses(base, 3));
  });
});
