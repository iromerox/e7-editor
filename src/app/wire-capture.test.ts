import type { WireLogHeader } from "../midi";
import type { WireLog } from "./wire-monitor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseWireLog } from "../midi";
import {
  EMPTY_LOG_REFUSAL,
  captureDate,
  captureFileName,
  captureHeader,
  emptyCaptureHeader,
  saveWireCapture,
  wireCapture,
} from "./wire-capture";
import {
  WIRE_LOG_CAPACITY,
  controlChangeEvent,
  emptyWireLog,
  recorded,
  sysExEvent,
} from "./wire-monitor";

const HEADER: WireLogHeader = {
  device: "GS Music e7, serial 361",
  input: "e7 MIDI 1",
  output: "e7 MIDI 1",
  date: "2026-08-18",
  session: "Reading preset 1.1.1 back a block at a time",
};

const READ_MEMORY = Uint8Array.from([
  0xf0, 0x00, 0x21, 0x62, 0x01, 0x10, 0x0e, 0x00, 0x00, 0x00, 0xf7,
]);
const PREVIEW_FRAME = Uint8Array.from([0xf0, 0x0f, 0xf7]);

function session(): WireLog {
  return [
    sysExEvent("outbound", READ_MEMORY, 0),
    sysExEvent("inbound", PREVIEW_FRAME, 14.638_2),
    controlChangeEvent("inbound", { channel: 1, controller: 74, value: 96 }, 812.44),
  ].reduce(recorded, emptyWireLog());
}

function writtenText(): {
  readonly chunks: Uint8Array[];
  readonly picker: ReturnType<typeof vi.fn>;
} {
  const chunks: Uint8Array[] = [];
  const picker = vi.fn(async () => ({
    createWritable: async () => ({
      write: async (chunk: Uint8Array) => {
        chunks.push(chunk);
      },
      close: async () => undefined,
    }),
  }));
  vi.stubGlobal("showSaveFilePicker", picker);
  return { chunks, picker };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saveWireCapture", () => {
  it("writes a file the fixture loader reads back as the same events", async () => {
    const log = session();
    const { chunks } = writtenText();

    const result = await saveWireCapture(log, HEADER);

    expect(result).toEqual({
      status: "written",
      fileName: "2026-08-18-reading-preset-1-1-1-back-a-block-at-a-time.wire",
      events: 3,
    });
    expect(chunks).toHaveLength(1);
    const read = parseWireLog(
      "capture.wire",
      new TextDecoder().decode(chunks[0] ?? new Uint8Array()),
    );
    expect(read.header).toEqual(HEADER);
    expect(read.events).toEqual(wireCapture(log, HEADER).events);
    expect(read.events).toEqual([
      { atMs: 0, direction: "outbound", bytes: READ_MEMORY },
      { atMs: 14.6, direction: "inbound", bytes: PREVIEW_FRAME },
      { atMs: 812.4, direction: "inbound", bytes: Uint8Array.from([0xb0, 0x4a, 0x60]) },
    ]);
  });

  it("says a dismissed dialog wrote nothing, leaving the log as it was", async () => {
    const log = session();
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(() => Promise.reject(new DOMException("dismissed", "AbortError"))),
    );

    expect(await saveWireCapture(log, HEADER)).toEqual({ status: "dismissed" });
    expect(log).toEqual(session());
  });

  it("refuses an empty log rather than writing a capture with no events in it", async () => {
    const { picker } = writtenText();

    expect(await saveWireCapture(emptyWireLog(), HEADER)).toEqual({
      status: "refused",
      reason: EMPTY_LOG_REFUSAL,
    });
    expect(picker).not.toHaveBeenCalled();
  });

  it("refuses a header the operator has not filled in, naming what it still needs", async () => {
    const { picker } = writtenText();

    const result = await saveWireCapture(session(), { ...HEADER, device: "  ", session: "" });

    expect(result).toEqual({
      status: "refused",
      reason:
        "The capture names no device and no session, and a committed one is only worth reading with all five.",
    });
    expect(picker).not.toHaveBeenCalled();
  });

  it("records the events a bounded log dropped as a comment above them", async () => {
    const log = { ...session(), dropped: 40, capacity: WIRE_LOG_CAPACITY };
    const { chunks } = writtenText();

    await saveWireCapture(log, HEADER);
    const text = new TextDecoder().decode(chunks[0] ?? new Uint8Array());

    expect(text).toContain("# the console kept the most recent 2000 events and dropped 40 older");
    expect(parseWireLog("capture.wire", text).events).toHaveLength(3);
  });

  it("downloads the capture when the browser has no save picker", async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return "blob:e7";
      },
      revokeObjectURL: () => undefined,
    });
    const clicked: (string | null)[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.getAttribute("download"));
    });

    const result = await saveWireCapture(session(), { ...HEADER, session: "Sweeping cutoff" });

    expect(result).toEqual({
      status: "written",
      fileName: "2026-08-18-sweeping-cutoff.wire",
      events: 3,
    });
    expect(clicked).toEqual(["2026-08-18-sweeping-cutoff.wire"]);
    expect(await blobs[0]?.text()).toContain("session  Sweeping cutoff");
  });
});

describe("captureFileName", () => {
  it("carries the day and the note, so a session's captures are told apart", () => {
    expect(captureFileName({ ...HEADER, session: "Sweeping Filter Cutoff by hand" })).toBe(
      "2026-08-18-sweeping-filter-cutoff-by-hand.wire",
    );
    expect(captureFileName({ ...HEADER, session: "CC 71: does it accept one?" })).toBe(
      "2026-08-18-cc-71-does-it-accept-one.wire",
    );
  });

  it("cuts a long note short without leaving the file name ending in a hyphen", () => {
    expect(
      captureFileName({
        ...HEADER,
        session: "Reading every block of preset 1.1.1 back one at a time, twice over",
      }),
    ).toBe("2026-08-18-reading-every-block-of-preset-1-1-1-back-one-at.wire");
  });

  it("falls back to a name rather than a bare date when the note slugs to nothing", () => {
    expect(captureFileName({ ...HEADER, session: "???" })).toBe("2026-08-18-capture.wire");
  });
});

describe("captureHeader", () => {
  it("trims what was typed, since a header value runs to the end of its line", () => {
    expect(captureHeader({ ...HEADER, device: "  serial 361  " }).device).toBe("serial 361");
  });
});

describe("emptyCaptureHeader", () => {
  it("opens on the local day, not the one UTC is having", () => {
    expect(emptyCaptureHeader(captureDate(new Date(2026, 7, 18, 23, 30)))).toEqual({
      device: "",
      input: "",
      output: "",
      date: "2026-08-18",
      session: "",
    });
  });
});
