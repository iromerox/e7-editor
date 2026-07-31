import type { Input, Output } from "webmidi";
import type { PortInfo, PortLists } from "./ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebMidi } from "webmidi";
import { AmbiguousPortError, NoMatchingPortError } from "./errors";
import { listInputPorts, listOutputPorts, resolvePort, watchPorts } from "./ports";

function fixture(): PortInfo[] {
  return [
    { index: 0, id: "in-0", name: "IAC Driver Bus 1" },
    { index: 1, id: "in-1", name: "GS Music e7" },
    { index: 2, id: "in-2", name: "GS Music e7 Aux" },
  ];
}

function advertisedPort(id: string, name: string): Input & Output {
  return { id, name } as unknown as Input & Output;
}

describe("listInputPorts / listOutputPorts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the name and the port's session identifier, numbered by listing position", () => {
    vi.spyOn(WebMidi, "inputs", "get").mockReturnValue([
      advertisedPort("input-a", "IAC Driver Bus 1"),
      advertisedPort("input-b", "GS Music e7"),
    ]);

    expect(listInputPorts()).toEqual([
      { index: 0, id: "input-a", name: "IAC Driver Bus 1" },
      { index: 1, id: "input-b", name: "GS Music e7" },
    ]);
  });

  it("enumerates inputs and outputs independently", () => {
    vi.spyOn(WebMidi, "inputs", "get").mockReturnValue([advertisedPort("input-a", "GS Music e7")]);
    vi.spyOn(WebMidi, "outputs", "get").mockReturnValue([
      advertisedPort("output-a", "GS Music e7"),
      advertisedPort("output-b", "IAC Driver Bus 1"),
    ]);

    expect(listInputPorts()).toEqual([{ index: 0, id: "input-a", name: "GS Music e7" }]);
    expect(listOutputPorts()).toEqual([
      { index: 0, id: "output-a", name: "GS Music e7" },
      { index: 1, id: "output-b", name: "IAC Driver Bus 1" },
    ]);
  });

  it("reports no ports where the environment exposes no Web MIDI access", () => {
    expect(listInputPorts()).toEqual([]);
    expect(listOutputPorts()).toEqual([]);
  });
});

describe("watchPorts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-reads both lists every time the browser reports a port change", () => {
    const seen: PortLists[] = [];
    const stop = watchPorts((ports) => seen.push(ports));

    vi.spyOn(WebMidi, "inputs", "get").mockReturnValue([advertisedPort("in-a", "GS Music e7")]);
    WebMidi.emit("portschanged", {});
    vi.spyOn(WebMidi, "inputs", "get").mockReturnValue([]);
    WebMidi.emit("portschanged", {});
    stop();

    expect(seen).toEqual([
      { inputs: [{ index: 0, id: "in-a", name: "GS Music e7" }], outputs: [] },
      { inputs: [], outputs: [] },
    ]);
  });

  it("stops reporting once the watch is released", () => {
    const seen: PortLists[] = [];
    const stop = watchPorts((ports) => seen.push(ports));

    stop();
    WebMidi.emit("portschanged", {});

    expect(seen).toEqual([]);
  });
});

describe("resolvePort", () => {
  it("resolves the #N index form", () => {
    expect(resolvePort("#2", fixture())).toEqual(fixture()[2]);
  });

  it("prefers an exact name match over a substring one", () => {
    expect(resolvePort("GS Music e7", fixture())).toEqual(fixture()[1]);
  });

  it("resolves a unique substring case-insensitively", () => {
    expect(resolvePort("iac", fixture())).toEqual(fixture()[0]);
    expect(resolvePort("aux", fixture())).toEqual(fixture()[2]);
  });

  it("throws on a substring matching more than one port, naming the candidates", () => {
    const ambiguous = (): PortInfo => resolvePort("music", fixture());
    expect(ambiguous).toThrow(AmbiguousPortError);
    try {
      ambiguous();
    } catch (error) {
      expect(error).toBeInstanceOf(AmbiguousPortError);
      if (error instanceof AmbiguousPortError) {
        expect(error.code).toBe("ambiguous-port");
        expect(error.matches).toEqual(["GS Music e7", "GS Music e7 Aux"]);
      }
    }
  });

  it("throws a distinct error when nothing matches at all", () => {
    expect(() => resolvePort("Korg", fixture())).toThrow(NoMatchingPortError);
    expect(() => resolvePort("Korg", fixture())).not.toThrow(AmbiguousPortError);
    expect(() => resolvePort("iac", fixture())).not.toThrow(NoMatchingPortError);
  });

  it("treats an out-of-range or malformed index as no match, never as a substring", () => {
    expect(() => resolvePort("#99", fixture())).toThrow(NoMatchingPortError);
    expect(() => resolvePort("#", fixture())).toThrow(NoMatchingPortError);
    expect(() => resolvePort("#1x", fixture())).toThrow(NoMatchingPortError);
  });

  it("rejects an empty specifier instead of substring-matching every port", () => {
    expect(() => resolvePort("", fixture())).toThrow(NoMatchingPortError);
    expect(() => resolvePort("", [{ index: 0, id: "in-0", name: "GS Music e7" }])).toThrow(
      NoMatchingPortError,
    );
  });

  it("resolves against an empty port list without matching anything", () => {
    expect(() => resolvePort("#0", [])).toThrow(NoMatchingPortError);
    expect(() => resolvePort("GS Music e7", [])).toThrow(NoMatchingPortError);
  });
});
