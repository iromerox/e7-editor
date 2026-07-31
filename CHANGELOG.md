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
- `src/midi/reassembly.ts`: incoming SysEx is buffered until a complete
  `F0...F7` frame is on hand, so a driver that splits a frame across message
  events can't hand a caller a truncated one, and two frames arriving in a
  single event are delivered as two. An `F0` arriving before the open frame
  closes drops the partial buffer and starts over rather than splicing the
  two together. `Connection.reassembly` reports how many frames arrived
  fragmented and how many partials were discarded, so the hardware smoke
  test can record whether browsers fragment at all.
- Hardware smoke test page, served by the dev server at `/smoke-test.html`
  and left out of the production build. Against a connected e7 it enables
  Web MIDI with system exclusive access, resolves the device's ports, reads
  the serial number, and reads a preset as eight sequential 16-byte Read
  Memory calls, decoding its name. It is read-only — nothing is written to
  the instrument. Every frame that crossed the wire is logged as pasteable
  hex, timestamped from the moment its command went out and marked as either
  the documented response or an unparsed frame, alongside the reassembly
  counters — so a run answers, with evidence, whether the device's
  undocumented preview frame and SysEx fragmentation actually reach a
  browser.
- `Connection.sysexMonitor`, a non-exclusive stream mirroring every complete
  inbound SysEx frame. Logging and diagnostics can watch the traffic without
  taking the single consumer slot on `Connection.sysex` that a pending
  request needs.
- `enableMidi()`, requesting Web MIDI with system exclusive access and
  refusing anything less, so ports can be listed before a connection is
  opened. `openConnection()` now goes through it rather than enabling
  inline.
- `src/store/schema.ts`: the library entry collection schema — what the
  entry is (Single, Multi, Group, Bank, MultiPack or Backup), its name, the
  bank/group/slot it originated from when it has one, when it was captured
  and how (device dump, user import or edit), tags, comment, SHA-256
  hash, the raw SysEx bytes as base64, and a JSON-safe snapshot of the
  decoded preset. Entries carry a generated primary key rather than being
  keyed by content or slot, so the same sound can be stored more than once.
- `src/store/database.ts`: `createLibraryDatabase()`, opening the library on
  IndexedDB through RxDB's Dexie storage. Schema evolution goes through
  RxDB's own `version` + `migrationStrategies`; a version 0 → 1 strategy is
  in place and tested against a database written under the old schema, so
  the migration path is proven before a real schema change needs it.
- `src/store/syx-codec.ts`: `.syx` file contents are parsed into 16-byte
  write-memory blocks and classified purely by the addresses they write —
  Single, Multi, Group, Bank, Backup, or MultiPack for any other set of whole
  presets — never by filename or extension. The result carries the decoded
  presets and their bank/group/slot, so an entry can be stored without
  parsing the file a second time.
- `src/store/errors.ts`: a typed `StoreError` hierarchy for library-side
  failures, so a file with a `.syx` extension holding anything other than
  writes to preset memory — another manufacturer's SysEx, a non-write-memory
  command, an address outside preset memory, a duplicated or partly written
  preset — is rejected with a specific error rather than misclassified.
- `src/store/backup.ts`: `exportLibrary()`/`importLibrary()`, whole-library
  backup and restore over RxDB's JSON dump. The dump travels inside an
  envelope stamped with a format marker, a backup format version, the entry
  schema version and the capture time, so a file written by a newer build is
  refused with a version error naming the marker that disagrees, rather than
  failing on RxDB's opaque schema hash or importing half-understood
  documents. Restore is empty-library-only: importing into a library that
  already holds entries is rejected outright — no merge, no overwrite, no
  partially applied dump — and every entry is validated before a single
  document is written, since RxDB's import bypasses schema validation on its
  way to storage. Exporting a library and importing it into a fresh database
  reproduces every entry unchanged, raw SysEx base64 and decoded snapshot
  included.
- `src/store/import-export.ts`: `.syx` files move between disk and the
  library — `importSyxFromDisk()` reads one or more files through the File
  System Access picker where the browser has one and a hidden file input
  where it doesn't, and `exportEntryToDisk()` writes an entry back out
  through the save picker or, failing that, an object-URL download. A file
  from disk is untrusted input, so its size and F0/F7 framing are validated
  at the boundary before its bytes reach the `.syx` codec: anything that is
  not readable SysEx — a text file, something larger than a whole-instrument
  backup, or well-framed SysEx that writes nothing to preset memory — is
  rejected with a typed error and never reaches the library. An imported
  entry takes its name from the preset bytes for a single or multi and from
  the file name otherwise, carries whichever of bank/group/slot its
  classification pins down, and stores the file verbatim, so exporting it
  again writes back a byte-identical `.syx`.
- `src/store/queries.ts`: the library's reactive views — the whole library,
  one kind, one bank and group, a single entry by id, and the entry count —
  each an observable of plain typed entry data that re-emits on every insert,
  edit and delete, so a pane subscribes once and never asks for a refresh.
  The by-kind view resolves through the declared kind index and answers a
  synthetic 500-entry library measurably faster than reading the collection
  and filtering it. Bank-and-group filtering deliberately does not use an
  index: Dexie storage cannot index an optional field, and an entry captured
  from no slot has no bank or group to index.

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
- `docs/hardware-smoke-test.md`: running the smoke test against a real
  device, and how to read each counter in its log against the open questions
  in `protocol-quirks.md` it settles.
- First hardware findings, from a run against serial #361 over USB in
  Brave/Chromium. Neither behavior the transport was built to absorb appears
  in a browser: the device's undocumented preview frame never reached the
  page, and no SysEx frame arrived fragmented. Both guards stay but are now
  documented as defensive rather than load-bearing. Recorded alongside them:
  what the run does not rule out (Chromium may be dropping malformed frames
  itself, and the original sighting may have been a Soft Thru echo), that
  preset names are ASCII padded with spaces to 20 bytes, and that
  undocumented preset bytes are not uniformly zero — preset 1.1.1 holds
  `0xFF` in bytes 125 and 126, confirming they must round-trip verbatim.
- Three open questions the same run raised: the device answers every command
  in a fixed ~16ms, which is device-side rather than browser-side and puts a
  floor of about 2min 11s on reading all preset memory unless the device
  turns out to accept pipelined requests; the outbound CC rate limit of 200Hz
  may be roughly 3x more permissive than a ~62.5Hz device cycle warrants; and
  every one of these findings holds for USB only, DIN MIDI being untested.
