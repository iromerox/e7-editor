import type { SyxFile } from "./syx-codec";
import { describe, expect, it } from "vitest";
import {
  MULTI_PRESET_BYTES,
  MultiSlot,
  PresetSlot,
  SINGLE_PRESET_BYTES,
  SYSEX_END,
  SYSEX_START,
  encodeCommand,
} from "../protocol";
import {
  DuplicateMemoryBlockError,
  IncompletePresetError,
  MemoryBlockAlignmentError,
  MemoryBlockLengthError,
  MemoryBlockRangeError,
  SyxFileFramingError,
  SyxFrameDecodeError,
  UnexpectedSysExCommandError,
} from "./errors";
import { LIBRARY_ENTRY_KINDS } from "./schema";
import {
  BACKUP_BLOCKS,
  BANK_GROUPS,
  BANK_PRESETS,
  GROUP_PRESETS,
  MEMORY_BLOCK_BYTES,
  MULTI_SLOTS,
  PRESET_BANKS,
  PRESET_SLOTS,
  encodeMemoryImage,
  parseMemoryBlocks,
  parseSyxFile,
} from "./syx-codec";

const MULTI_REGION_START = new MultiSlot(1, 1, 1).byteAddress();

function presetBytes(seed: number, length = SINGLE_PRESET_BYTES): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (seed * 7 + index * 3) % 256);
}

function writeFrames(start: number, bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += MEMORY_BLOCK_BYTES) {
    frames.push(
      encodeCommand({
        kind: "write-memory",
        address: start + offset,
        data: bytes.subarray(offset, offset + MEMORY_BLOCK_BYTES),
      }),
    );
  }
  return frames;
}

function file(frames: readonly Uint8Array[]): Uint8Array {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const frame of frames) {
    bytes.set(frame, offset);
    offset += frame.length;
  }
  return bytes;
}

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to fail");
}

function singleFrames(slot: PresetSlot, seed = 1): Uint8Array[] {
  return writeFrames(slot.byteAddress(), presetBytes(seed));
}

function multiFrames(slot: MultiSlot, seed = 1): Uint8Array[] {
  return writeFrames(slot.byteAddress(), presetBytes(seed, MULTI_PRESET_BYTES));
}

function groupFrames(bank: number, group: number): Uint8Array[] {
  return Array.from({ length: GROUP_PRESETS }, (_, index) =>
    singleFrames(new PresetSlot(bank, group, index + 1), index),
  ).flat();
}

function bankFrames(bank: number): Uint8Array[] {
  return Array.from({ length: BANK_GROUPS }, (_, index) => groupFrames(bank, index + 1)).flat();
}

function backupFrames(): Uint8Array[] {
  const banks = Array.from({ length: PRESET_BANKS }, (_, index) => bankFrames(index + 1)).flat();
  const multis = Array.from({ length: MULTI_SLOTS }, (_, index) =>
    writeFrames(
      MULTI_REGION_START + index * MULTI_PRESET_BYTES,
      presetBytes(index, MULTI_PRESET_BYTES),
    ),
  ).flat();
  return [...banks, ...multis];
}

describe("parseSyxFile", () => {
  it("classifies eight blocks at a preset slot as a Single, carrying its slot components", () => {
    const parsed = parseSyxFile(file(singleFrames(new PresetSlot(3, 5, 2))));

    expect(parsed.kind).toBe("Single");
    expect(parsed).toMatchObject({ bank: 3, group: 5, slot: 2 });
    expect(parsed.singles).toHaveLength(1);
    expect(parsed.multis).toHaveLength(0);
    expect(parsed.singles[0]?.bytes).toEqual(presetBytes(1));
    expect(parsed.singles[0]?.slot).toBeInstanceOf(PresetSlot);
  });

  it("classifies thirty-two blocks at a multi slot as a Multi", () => {
    const parsed = parseSyxFile(file(multiFrames(new MultiSlot(2, 8, 8))));

    expect(parsed.kind).toBe("Multi");
    expect(parsed).toMatchObject({ bank: 2, group: 8, slot: 8 });
    expect(parsed.multis).toHaveLength(1);
    expect(parsed.singles).toHaveLength(0);
    expect(parsed.multis[0]?.multi.parts).toHaveLength(4);
  });

  it("classifies the eight singles of one group as a Group", () => {
    const parsed = parseSyxFile(file(groupFrames(4, 6)));

    expect(parsed.kind).toBe("Group");
    expect(parsed).toMatchObject({ bank: 4, group: 6 });
    expect(parsed.singles).toHaveLength(GROUP_PRESETS);
    expect(parsed.singles.map((single) => single.slot.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("classifies the sixty-four singles of one bank as a Bank", () => {
    const parsed = parseSyxFile(file(bankFrames(7)));

    expect(parsed.kind).toBe("Bank");
    expect(parsed).toMatchObject({ bank: 7 });
    expect(parsed.singles).toHaveLength(BANK_PRESETS);
  });

  it("classifies every preset and multi slot as a Backup", () => {
    const frames = backupFrames();
    expect(frames).toHaveLength(BACKUP_BLOCKS);

    const parsed = parseSyxFile(file(frames));

    expect(parsed.kind).toBe("Backup");
    expect(parsed.singles).toHaveLength(PRESET_SLOTS);
    expect(parsed.multis).toHaveLength(MULTI_SLOTS);
  });

  it("classifies an arbitrary set of whole presets as a MultiPack", () => {
    const parsed = parseSyxFile(
      file([
        ...singleFrames(new PresetSlot(1, 1, 1), 1),
        ...singleFrames(new PresetSlot(8, 4, 7), 2),
        ...multiFrames(new MultiSlot(1, 2, 3), 3),
      ]),
    );

    expect(parsed.kind).toBe("MultiPack");
    expect(parsed.singles).toHaveLength(2);
    expect(parsed.multis).toHaveLength(1);
  });

  it("classifies a full group that is one preset short as a MultiPack, not a Group", () => {
    const partial = Array.from({ length: GROUP_PRESETS - 1 }, (_, index) =>
      singleFrames(new PresetSlot(2, 2, index + 1), index),
    ).flat();

    expect(parseSyxFile(file(partial)).kind).toBe("MultiPack");
  });

  it("classifies eight singles spread across two groups as a MultiPack, not a Group", () => {
    const spread = [
      ...Array.from({ length: 4 }, (_, index) =>
        singleFrames(new PresetSlot(2, 1, index + 1), index),
      ).flat(),
      ...Array.from({ length: 4 }, (_, index) =>
        singleFrames(new PresetSlot(2, 2, index + 1), index),
      ).flat(),
    ];

    expect(parseSyxFile(file(spread)).kind).toBe("MultiPack");
  });

  it("classifies by address, not by the order frames appear in the file", () => {
    const shuffled = [...groupFrames(4, 6)].reverse();

    const parsed = parseSyxFile(file(shuffled));

    expect(parsed).toMatchObject({ kind: "Group", bank: 4, group: 6 });
    expect(parsed.singles.map((single) => single.slot.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("classifies identical bytes by the region they are written to", () => {
    const bytes = presetBytes(9, MULTI_PRESET_BYTES);

    expect(parseSyxFile(file(writeFrames(0, bytes.subarray(0, SINGLE_PRESET_BYTES)))).kind).toBe(
      "Single",
    );
    expect(parseSyxFile(file(writeFrames(MULTI_REGION_START, bytes))).kind).toBe("Multi");
  });

  it("only classifies as kinds the library schema can store", () => {
    const kinds: readonly SyxFile["kind"][] = [
      "Single",
      "Multi",
      "Group",
      "Bank",
      "Backup",
      "MultiPack",
    ];

    for (const kind of kinds) {
      expect(LIBRARY_ENTRY_KINDS).toContain(kind);
    }
  });
});

describe("parseSyxFile rejections", () => {
  it("rejects an empty file", () => {
    expect(() => parseSyxFile(new Uint8Array())).toThrow(SyxFileFramingError);
  });

  it("rejects bytes sitting outside a frame", () => {
    const bytes = file([...singleFrames(new PresetSlot(1, 1, 1)), Uint8Array.of(0x42)]);

    expect(() => parseSyxFile(bytes)).toThrow(SyxFileFramingError);
  });

  it("rejects a frame that never ends", () => {
    const truncated = file(singleFrames(new PresetSlot(1, 1, 1))).slice(0, -1);

    expect(thrownBy(() => parseSyxFile(truncated))).toMatchObject({
      code: "syx-file-framing",
      fault: "unterminated-frame",
    });
  });

  it("rejects a frame from another manufacturer, keeping the protocol error as the cause", () => {
    const foreign = Uint8Array.of(SYSEX_START, 0x00, 0x20, 0x32, 0x01, 0x10, 0x0f, SYSEX_END);

    const error = thrownBy(() => parseSyxFile(foreign));

    expect(error).toBeInstanceOf(SyxFrameDecodeError);
    expect(error).toMatchObject({ frame: 0, reason: { code: "manufacturer-header" } });
  });

  it("rejects a SysEx command that is not write-memory", () => {
    const bytes = file([
      encodeCommand({ kind: "read-memory", address: 0 }),
      ...singleFrames(new PresetSlot(1, 1, 1)),
    ]);

    expect(() => parseSyxFile(bytes)).toThrow(UnexpectedSysExCommandError);
  });

  it("rejects a write outside preset memory", () => {
    const configuration = writeFrames(0x020000, presetBytes(1, MEMORY_BLOCK_BYTES));

    expect(() => parseSyxFile(file(configuration))).toThrow(MemoryBlockRangeError);
  });

  it("rejects a block that is not a whole memory block", () => {
    const short = encodeCommand({
      kind: "write-memory",
      address: 0,
      data: presetBytes(1, MEMORY_BLOCK_BYTES - 1),
    });

    expect(() => parseSyxFile(file([short]))).toThrow(MemoryBlockLengthError);
  });

  it("rejects a block written to an unaligned address", () => {
    const unaligned = encodeCommand({
      kind: "write-memory",
      address: MEMORY_BLOCK_BYTES / 2,
      data: presetBytes(1, MEMORY_BLOCK_BYTES),
    });

    expect(() => parseSyxFile(file([unaligned]))).toThrow(MemoryBlockAlignmentError);
  });

  it("rejects the same address written twice", () => {
    const frames = singleFrames(new PresetSlot(1, 1, 1));
    const duplicated = frames[0];
    if (duplicated === undefined) {
      throw new Error("fixture has no frames");
    }

    expect(() => parseSyxFile(file([...frames, duplicated]))).toThrow(DuplicateMemoryBlockError);
  });

  it("rejects a preset whose blocks are only partly present", () => {
    const partial = singleFrames(new PresetSlot(1, 1, 1)).slice(0, -1);

    expect(() => parseSyxFile(file(partial))).toThrow(IncompletePresetError);
  });
});

describe("parseMemoryBlocks", () => {
  it("returns one sixteen-byte block per write-memory frame, in file order", () => {
    const blocks = parseMemoryBlocks(file(singleFrames(new PresetSlot(2, 3, 4))));

    expect(blocks).toHaveLength(SINGLE_PRESET_BYTES / MEMORY_BLOCK_BYTES);
    expect(blocks.map((block) => block.address)).toEqual([
      ...Array.from(
        { length: SINGLE_PRESET_BYTES / MEMORY_BLOCK_BYTES },
        (_, index) => new PresetSlot(2, 3, 4).byteAddress() + index * MEMORY_BLOCK_BYTES,
      ),
    ]);
    expect(blocks.every((block) => block.data.length === MEMORY_BLOCK_BYTES)).toBe(true);
  });

  it("unpacks the nibble payload back to the bytes that were written", () => {
    const [block] = parseMemoryBlocks(file(writeFrames(0, presetBytes(1, MEMORY_BLOCK_BYTES))));

    expect(block?.data).toEqual(presetBytes(1, MEMORY_BLOCK_BYTES));
  });
});

describe("encodeMemoryImage", () => {
  it("writes one frame per block, at consecutive addresses from the one given", () => {
    const slot = new PresetSlot(3, 5, 2);

    const bytes = encodeMemoryImage(slot.byteAddress(), presetBytes(4));

    expect(bytes).toEqual(file(writeFrames(slot.byteAddress(), presetBytes(4))));
    expect(parseMemoryBlocks(bytes).map((block) => block.address)).toEqual(
      Array.from(
        { length: SINGLE_PRESET_BYTES / MEMORY_BLOCK_BYTES },
        (_, index) => slot.byteAddress() + index * MEMORY_BLOCK_BYTES,
      ),
    );
  });

  it("round-trips a multi image back to the same slot and bytes", () => {
    const slot = new MultiSlot(2, 8, 8);
    const image = presetBytes(9, MULTI_PRESET_BYTES);

    const parsed = parseSyxFile(encodeMemoryImage(slot.byteAddress(), image));

    expect(parsed).toMatchObject({ kind: "Multi", bank: 2, group: 8, slot: 8 });
    expect(parsed.multis[0]?.bytes).toEqual(image);
  });

  it("refuses an address that does not start a memory block", () => {
    expect(() => encodeMemoryImage(MEMORY_BLOCK_BYTES / 2, presetBytes(1))).toThrow(
      MemoryBlockAlignmentError,
    );
  });

  it("refuses an image that does not fill whole blocks, naming the block left over", () => {
    const error = thrownBy(() => encodeMemoryImage(0, presetBytes(1, MEMORY_BLOCK_BYTES + 3)));

    expect(error).toBeInstanceOf(MemoryBlockLengthError);
    expect(error).toMatchObject({
      code: "memory-block-length",
      address: MEMORY_BLOCK_BYTES,
      expected: MEMORY_BLOCK_BYTES,
      actual: 3,
    });
  });

  it("refuses an empty image, which would write nothing at all", () => {
    expect(() => encodeMemoryImage(0, new Uint8Array(0))).toThrow(MemoryBlockLengthError);
  });
});
