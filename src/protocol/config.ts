// Bridges a Read Configuration response into a full Write Configuration
// payload, filling in the two fields the read command never returns
// (protocol-quirks.md #2).
import type { ReadConfigurationFields, WriteConfigurationFields } from "./sysex";

export type ReadConfigPayload = ReadConfigurationFields;
export type Configuration = WriteConfigurationFields;

export function intoConfiguration(
  payload: ReadConfigPayload,
  clockSource: number,
  mpeEnable: number,
): Configuration {
  return {
    rxChannel: payload.rxChannel,
    txChannel: payload.txChannel,
    filterMode: payload.filterMode,
    softThruMode: payload.softThruMode,
    clockSource,
    mpeEnable,
  };
}
