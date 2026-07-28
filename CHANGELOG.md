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

### Fixed

- Pinned TypeScript to `^6` — `dependency-cruiser` doesn't parse TS 7's
  (Go-ported compiler) output yet and silently cruises 0 modules against it.
  Revisit once dependency-cruiser publishes TS7 support.

### Documentation

- Architecture and protocol-quirks docs, reference document download
  instructions.
