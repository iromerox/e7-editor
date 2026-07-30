// MIDI port enumeration and resolution of user-supplied port specifiers.
import { WebMidi } from "webmidi";
import { AmbiguousPortError, NoMatchingPortError } from "./errors";

export interface PortInfo {
  readonly index: number;
  readonly id: string;
  readonly name: string;
}

interface AdvertisedPort {
  readonly id: string;
  readonly name: string;
}

const INDEX_SPECIFIER = /^#(\d+)$/;

function describePorts(ports: readonly AdvertisedPort[]): PortInfo[] {
  return ports.map((port, index) => ({ index, id: port.id, name: port.name }));
}

export function listInputPorts(): PortInfo[] {
  return describePorts(WebMidi.inputs);
}

export function listOutputPorts(): PortInfo[] {
  return describePorts(WebMidi.outputs);
}

export function resolvePort(specifier: string, ports: readonly PortInfo[]): PortInfo {
  const asIndex = INDEX_SPECIFIER.exec(specifier);
  if (asIndex !== null) {
    const port = ports[Number(asIndex[1])];
    if (port === undefined) {
      throw new NoMatchingPortError(specifier);
    }
    return port;
  }

  const exact = ports.find((port) => port.name === specifier);
  if (exact !== undefined) {
    return exact;
  }

  if (specifier === "") {
    throw new NoMatchingPortError(specifier);
  }

  const needle = specifier.toLowerCase();
  const [first, ...rest] = ports.filter((port) => port.name.toLowerCase().includes(needle));
  if (first === undefined) {
    throw new NoMatchingPortError(specifier);
  }
  if (rest.length > 0) {
    throw new AmbiguousPortError(
      specifier,
      [first, ...rest].map((port) => port.name),
    );
  }
  return first;
}
