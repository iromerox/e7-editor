import type { Observable } from "rxjs";
import type { CcEvent, Connection, PortInfo, PortLists, SysExReassemblyStats } from "../midi";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { EMPTY, Subject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoMatchingPortError,
  ResponseTimeoutError,
  enableMidi,
  listPorts,
  openConnection,
  requestResponse,
  watchPorts,
} from "../midi";
import { ConnectionBar } from "./ConnectionBar";

vi.mock("../midi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../midi")>();
  return {
    NoMatchingPortError: original.NoMatchingPortError,
    ResponseTimeoutError: original.ResponseTimeoutError,
    enableMidi: vi.fn(),
    listPorts: vi.fn(),
    openConnection: vi.fn(),
    requestResponse: vi.fn(),
    watchPorts: vi.fn(),
  };
});

class FakeConnection implements Connection {
  readonly inputName = "GS Music e7 IN";
  readonly outputName = "GS Music e7 OUT";
  readonly sysex: Observable<Uint8Array> = EMPTY;
  readonly sysexMonitor: Observable<Uint8Array> = EMPTY;
  readonly ccEvents = new Subject<CcEvent>();
  readonly cc: Observable<CcEvent> = this.ccEvents.asObservable();
  readonly reassembly: SysExReassemblyStats = {
    pendingBytes: 0,
    fragmentedFrames: 0,
    discardedPartials: 0,
  };
  isOpen = true;
  closeCalls = 0;

  send(): void {}

  sendCommand(): void {}

  sendControlChange(): void {}

  close(): Promise<void> {
    this.closeCalls += 1;
    this.unplug();
    return Promise.resolve();
  }

  unplug(): void {
    this.isOpen = false;
    this.ccEvents.complete();
  }
}

function port(index: number, name: string): PortInfo {
  return { index, id: `port-${index}`, name };
}

const NO_PORTS: PortLists = { inputs: [], outputs: [] };

const ONE_DEVICE: PortLists = {
  inputs: [port(0, "GS Music e7 IN")],
  outputs: [port(0, "GS Music e7 OUT")],
};

let announcePorts: (ports: PortLists) => void = () => {};

async function enable(): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: "Enable MIDI" }));
}

async function connect(): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: "Connect" }));
}

function optionNames(label: string): string[] {
  const select = screen.getByLabelText(label);
  return [...select.querySelectorAll("option")].map((option) => option.value);
}

beforeEach(() => {
  vi.mocked(enableMidi).mockResolvedValue(undefined);
  vi.mocked(listPorts).mockReturnValue(NO_PORTS);
  vi.mocked(watchPorts).mockImplementation((onChange) => {
    announcePorts = onChange;
    return () => {
      announcePorts = () => {};
    };
  });
  vi.mocked(requestResponse).mockResolvedValue({ kind: "serial-number", serialNumber: 361 });
});

describe("ConnectionBar", () => {
  it("offers the ports Web MIDI reports once access is granted", async () => {
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    render(() => <ConnectionBar />);

    expect(screen.queryByLabelText("Input")).not.toBeInTheDocument();
    await enable();

    expect(optionNames("Input")).toEqual(["GS Music e7 IN"]);
    expect(optionNames("Output")).toEqual(["GS Music e7 OUT"]);
  });

  it("picks up a device plugged in after the port list was read, without a manual refresh", async () => {
    render(() => <ConnectionBar />);
    await enable();
    expect(optionNames("Input")).toEqual([]);

    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    announcePorts(ONE_DEVICE);

    expect(optionNames("Input")).toEqual(["GS Music e7 IN"]);
    expect(screen.getByLabelText("Input")).toHaveValue("GS Music e7 IN");
    expect(screen.getByRole("button", { name: "Connect" })).toBeEnabled();
  });

  it("drops a selection whose port is unplugged, and says so", async () => {
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    render(() => <ConnectionBar />);
    await enable();

    vi.mocked(listPorts).mockReturnValue(NO_PORTS);
    announcePorts(NO_PORTS);

    expect(optionNames("Input")).toEqual([]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No longer available: GS Music e7 IN, GS Music e7 OUT.",
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("shows the serial number the device answers with, read over the connection", async () => {
    const connection = new FakeConnection();
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockResolvedValue(connection);
    render(() => <ConnectionBar />);

    await enable();
    await connect();

    expect(openConnection).toHaveBeenCalledWith({
      input: "GS Music e7 IN",
      output: "GS Music e7 OUT",
    });
    expect(requestResponse).toHaveBeenCalledWith(connection, { kind: "read-serial-number" });
    expect(screen.getByText("Serial number 361")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports a port that vanished between selection and connect instead of staying silent", async () => {
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockRejectedValue(new NoMatchingPortError("GS Music e7 IN"));
    render(() => <ConnectionBar />);

    await enable();
    await connect();

    expect(screen.getByRole("alert")).toHaveTextContent(
      'NoMatchingPortError: no MIDI port matches "GS Music e7 IN"',
    );
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.queryByText(/Serial number/)).not.toBeInTheDocument();
  });

  it("closes a connection whose device never answers, rather than reporting it connected", async () => {
    const connection = new FakeConnection();
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockResolvedValue(connection);
    vi.mocked(requestResponse).mockRejectedValue(
      new ResponseTimeoutError("read-serial-number", 1000, 0),
    );
    render(() => <ConnectionBar />);

    await enable();
    await connect();

    expect(connection.closeCalls).toBe(1);
    expect(screen.getByRole("alert")).toHaveTextContent("ResponseTimeoutError");
    expect(screen.queryByText(/Serial number/)).not.toBeInTheDocument();
  });

  it("closes the connection and clears the serial number on disconnect", async () => {
    const connection = new FakeConnection();
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockResolvedValue(connection);
    render(() => <ConnectionBar />);

    await enable();
    await connect();
    await fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(connection.closeCalls).toBe(1);
    expect(screen.queryByText(/Serial number/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("never lands on connected when the device vanishes while the serial read is in flight", async () => {
    const connection = new FakeConnection();
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockResolvedValue(connection);
    vi.mocked(requestResponse).mockImplementation(() => {
      connection.unplug();
      return Promise.resolve({ kind: "serial-number", serialNumber: 361 });
    });
    render(() => <ConnectionBar />);

    await enable();
    await connect();

    expect(screen.getByRole("alert")).toHaveTextContent("GS Music e7 IN was disconnected.");
    expect(screen.queryByText(/Serial number/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("falls back to disconnected when the device is unplugged while connected", async () => {
    const connection = new FakeConnection();
    vi.mocked(listPorts).mockReturnValue(ONE_DEVICE);
    vi.mocked(openConnection).mockResolvedValue(connection);
    render(() => <ConnectionBar />);

    await enable();
    await connect();
    connection.unplug();

    expect(screen.getByRole("alert")).toHaveTextContent("GS Music e7 IN was disconnected.");
    expect(screen.queryByText(/Serial number/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });
});
