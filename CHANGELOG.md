# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Initial repository scaffolding: single-package TypeScript/Vite/SolidJS
  project, Biome, Vitest, `dependency-cruiser` layering checks, CI workflow.
- `src/protocol/address.ts`: `PresetSlot` and `MultiSlot` memory addressing
  with region constants for preset/configuration/volatile memory.
- `src/protocol/cc.ts`: MIDI CC number constants for every parameter in the
  spec's CC table, and a shared `decodeZoned` helper for the zoned/breakpoint
  CC enums.
- `src/protocol/enums.ts`: `OscShape`, `OscSync`, `LfoShape`, `Lfo3Shape`,
  `LfoMode`, `DelayType`, `ChorusType`, and `OtherMode` enums with `fromCc`/
  `toCc` pairs, plus an `encodeZoned` helper in `cc.ts` to support the
  reverse direction. `OtherMode` rejects the CC 80-127 reserved range with a
  typed error.
- `src/protocol/transpose.ts`: `Transpose` 49-band CC lookup (-24..+24
  semitones).
- `src/protocol/tune.ts`: `Tune`, storing integer millisemitones with a
  `.semitones()` float accessor; CC 63/64 both decode to 0 and canonically
  re-encode to 63.
- `src/protocol/lfo-clock-rate.ts` and `src/protocol/delay-clock-rate.ts`:
  `LfoClockRate` and `DelayClockRate`, separate 15-division musical-rate
  types with different hardware-captured byte layouts despite sharing
  division names.
- `src/protocol/voices.ts`: `Voices`, packing V1/V2 as `16*V1 + V2` on CC 97
  with real read/write accessors. Rejects CC 72-127 and any low-range CC
  whose V2 nibble falls outside 0-7 as reserved.
- `src/protocol/cc.ts`: `FILTER_RESONANCE` (CC 71) constant and a `ccDirection`
  helper marking it inbound-only, so the upcoming CC↔field map can reject
  outbound writes to CCs known not to accept them.
- `src/protocol/preset.ts`: `SinglePreset` (128 bytes) and `MultiPreset`
  (four contiguous parts of 128) byte layouts, decoding and re-encoding every
  byte position verbatim — including the ones the spec leaves unused, which
  are never clobbered on encode. Fields the device reads only from part 1 of
  a multi (name, delay, chorus, stereo, lock) and fields only used when the
  preset is part of a multi (keyboard/velocity zones, MIDI channel and
  filter) are grouped separately from the always-active ones.
- `src/protocol/nibble.ts`: `pack`/`unpack` for the 4-bit-per-byte payload
  form SysEx data travels in, rejecting odd-length payloads and nibbles with
  high bits set with typed errors.
- `src/protocol/sysex.ts`: the `SysExMessage` union covering every documented
  command (All LEDs ON, Read Serial Number, Read/Write Memory, Factory Reset,
  Read/Write Configuration, Initialize preset, Read Autotuning Status) with
  encoding, decoding, and 21-bit address splitting. Commands carry the 5-byte
  manufacturer header; response parsing takes bare data, matching what the
  device actually sends. Lock/Unlock Preset helpers write 0 to unlock and 1
  to lock, per the byte-map text rather than the inverted example labels.
- `src/protocol/config.ts`: `intoConfiguration`, bridging a 4-field Read
  Configuration response into the full 6-field Write Configuration payload
  by supplying the two values Read never returns (Clock Source, MPE Enable).
- `src/protocol/program-change.ts`: Bank Select MSB/LSB + Program Change
  resolution to a preset or multi slot, and the reverse encoding, matching
  the spec's single (Bank MSB 0) and multi (Bank MSB 1) addressing.
- `src/protocol/mpe.ts`: `encodeMcm`/`decodeMcm` for the 9-byte MPE
  Configuration Message (RPN 0x0006 on channel 1), enabling with 1-15
  channels or disabling with 0.
- `src/protocol/cc-map.ts`: bidirectional map between CC numbers and the
  `SinglePreset` fields they drive — `ccToFields`, `fieldToCc`, `readField`,
  `writeField`, and an `applyCc` that returns the updated preset without
  mutating the original. Every mapped field has a real accessor pair,
  including the packed Voices CC 97 that unpacks into the Poly Voice and
  Mono Voice bytes. Performance-only CCs (Mod Wheel, Volume, Hold) and
  LFO2 EG1 Mod (CC 67, which has no preset byte) are deliberately unmapped.
  CC 3 resolves to both `osc1Transpose` and `transpose` and `applyCc`
  reports it as ambiguous rather than guessing, pending a hardware test.
- `src/midi/ports.ts`: MIDI input/output enumeration, each port reported with
  its name and the identifier the browser assigns it for the session, plus
  `resolvePort` for turning a user-supplied specifier into a port — `#N` by
  listing position, then exact name, then a unique case-insensitive
  substring. A substring matching several ports is reported as ambiguous,
  naming the candidates, instead of silently picking one.
- `src/midi/errors.ts`: typed error hierarchy for the MIDI transport
  (`MidiError` base class with a `code` discriminant per failure mode),
  mirroring the protocol layer's.
- `src/midi/connection.ts`: a `Connection` binding an input/output port pair
  and exposing incoming traffic as two independent streams — complete SysEx
  frames and raw CC events (channel, controller, value, timestamp) — so
  request/response traffic and live control forwarding never block or drop
  each other. The SysEx stream admits a single consumer at a time, keeping a
  pending request the sole owner of the frames it is waiting for, while the
  CC stream fans out to every listener. `close()` and an unplugged device
  tear down identically: both streams complete, port listeners are removed,
  and further sends raise a typed closed-connection error rather than
  writing to a dead port. `openConnection()` resolves a pair of port
  specifiers, requesting system exclusive access if Web MIDI is not enabled
  yet and refusing to connect without it.
- `src/midi/request-response.ts`: `requestResponse(connection, command,
  timeout)`, which sends a command and resolves with the decoded response the
  device documents for it. Frames that don't parse as that response — such as
  the short malformed preview frame the device sends ahead of a real Read
  Memory response — are ignored and waited past, so only a genuinely silent
  device produces a failure: a typed timeout error reporting how many frames
  were ignored. The command sent decides the response type the caller gets
  back, and the four commands with no documented response (All LEDs ON,
  Factory Reset, Initialize Preset, Write Configuration) are rejected at
  compile time and raise a typed error at runtime instead of timing out.
- `src/midi/cc-rate-limit.ts`: outbound control changes are capped at 200 Hz
  (5 ms) per channel and controller, so a knob drag can't outrun the device.
  Updates arriving inside that window are coalesced, and only the latest one
  ships when the window opens — the value the user lands on always reaches
  the wire. Values for different channel/controller pairs never coalesce
  against each other, and a lone control change goes out on the spot rather
  than waiting out an interval. `Connection.sendControlChange(channel,
  controller, value)` sends through it, and closing the connection drops any
  value still held back instead of writing to a dead port.

### Changed

- Consolidated every protocol error class into `src/protocol/errors.ts` as a
  single typed hierarchy (`ProtocolError` base class with a `code`
  discriminant per failure mode), replacing the ad-hoc classes previously
  defined and exported from `address.ts`, `cc.ts`, `mpe.ts`, `nibble.ts`,
  `preset.ts`, `program-change.ts`, and `sysex.ts` individually.
  `ManufacturerHeaderError` and `SysExAddressRangeError` now carry their
  expected header / min-max bounds as structured constructor properties
  instead of baking them into the message string.

### Fixed

- Pinned TypeScript to `^6` — `dependency-cruiser` doesn't parse TS 7's
  (Go-ported compiler) output yet and silently cruises 0 modules against it.
  Revisit once dependency-cruiser publishes TS7 support.

### Documentation

- Architecture and protocol-quirks docs, reference document download
  instructions.
