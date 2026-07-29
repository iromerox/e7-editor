// MPE Configuration Message (MCM): standard RPN 0x0006 on channel 1, with
// the data-entry value carrying the member-channel count — 0 disables MPE,
// 1-15 enables it (only the lower zone is supported) (p.23).
import { McmChannelCountRangeError, McmTemplateError } from "./errors";

export const MCM_BYTE_LENGTH = 9;

const CC_CHANNEL_1 = 0xb0;
const CC_RPN_MSB = 0x65;
const CC_RPN_LSB = 0x64;
const CC_DATA_ENTRY = 0x06;
const RPN_MPE_MSB = 0x00;
const RPN_MPE_LSB = 0x06;

const MCM_TEMPLATE = [
  CC_CHANNEL_1,
  CC_RPN_MSB,
  RPN_MPE_MSB,
  CC_CHANNEL_1,
  CC_RPN_LSB,
  RPN_MPE_LSB,
  CC_CHANNEL_1,
  CC_DATA_ENTRY,
] as const;

export interface McmMessage {
  readonly channels: number;
}

function assertChannels(channels: number): void {
  if (!Number.isInteger(channels) || channels < 0 || channels > 15) {
    throw new McmChannelCountRangeError(channels);
  }
}

export function encodeMcm(message: McmMessage): Uint8Array {
  assertChannels(message.channels);
  return Uint8Array.of(
    CC_CHANNEL_1,
    CC_RPN_MSB,
    RPN_MPE_MSB,
    CC_CHANNEL_1,
    CC_RPN_LSB,
    RPN_MPE_LSB,
    CC_CHANNEL_1,
    CC_DATA_ENTRY,
    message.channels,
  );
}

export function decodeMcm(bytes: Uint8Array): McmMessage {
  if (
    bytes.length !== MCM_BYTE_LENGTH ||
    !MCM_TEMPLATE.every((byte, index) => bytes[index] === byte)
  ) {
    throw new McmTemplateError(bytes);
  }
  const channels = bytes[MCM_TEMPLATE.length];
  if (channels === undefined) {
    throw new McmTemplateError(bytes);
  }
  assertChannels(channels);
  return { channels };
}
