// Global configuration: the channel the device receives on, and the bridge from a Read Configuration response to a full Write Configuration payload.
import type { ReadConfigurationFields, WriteConfigurationFields } from "./sysex";

export type ReadConfigPayload = ReadConfigurationFields;
export type Configuration = WriteConfigurationFields;

export const OMNI_RECEIVE_CHANNEL = 16;

export type ReceiveChannel =
  | { readonly kind: "channel"; readonly channel: number }
  | { readonly kind: "omni" }
  | { readonly kind: "invalid"; readonly value: number };

export function receiveChannel(value: number): ReceiveChannel {
  if (value === OMNI_RECEIVE_CHANNEL) {
    return { kind: "omni" };
  }
  return Number.isInteger(value) && value >= 0 && value < OMNI_RECEIVE_CHANNEL
    ? { kind: "channel", channel: value + 1 }
    : { kind: "invalid", value };
}

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
