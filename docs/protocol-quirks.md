# Protocol quirks

Discrepancies between the printed GS Music *e7 MIDI Implementation* document
(dated 2022-09-22) and either real hardware behavior or an implementation
decision worth flagging. Each entry is a decision the implementation should
make that a careful reader of the spec should know about. Page numbers refer
to the printed page numbers of the PDF, not the PDF page indices. These are
unverified against real hardware in this repo yet — re-check against a real
device before relying on them.

## 1. Lock / Unlock command labels are inverted on pp. 16-17

The section titles, body text, and example labels on pages 16 and 17
contradict each other. The authoritative byte-map text on page 26 settles
it: **0 = unlocked, 1 = locked** (matches the section titles and body text).
The *example labels* on pp. 16-17 are inverted — don't trust them.

## 2. Read Configuration and Write Configuration are asymmetric

Read Configuration response: 4 bytes (RxCh, TxCh, Filter, SoftThru). Write
Configuration request: 7 bytes (those 4 + ClockSource, MpeEnable, a
mandatory `0x00` pad). The configuration EEPROM map (p.27) lists 5 documented
bytes; Write also takes an MPE Enable byte not in that map — the sensible
reading is that MPE Enable is a runtime flag accepted via Write but not
persisted, and Read simply doesn't surface ClockSource. Model the asymmetry
directly rather than trying to force a single shared shape.

## 3. Response frames omit the manufacturer header

Every command **sent to** the e7 carries the 5-byte `00 21 62 / 01 / 10`
(manufacturer/device/model) header after the opening `F0`. Every documented
**response from** the e7 omits that header — wire form is just
`F0 <data> F7`. Parsing needs two code paths: header-validating for outbound
command echoes, bare-data for inbound responses.

## 4. Memory map: Multi 2.8.8 starts at 0x01FE00, not 0x01FD00

The address-range table on p.24 lists Multi 2.8.8 at `0x01FD00–0x01FFFF`
(768 bytes — wider than one multi). The spec's own formula on the same page
— `Address = 65536 + ((A−1)×64 + (B−1)×8 + (C−1)) × 512` — gives `0x01FE00`,
exactly filling the last 512 bytes of preset memory. The table is a typo;
the formula is authoritative.

## 5. LFO2 EG1 Mod is exposed as CC 67 but has no preset byte

The CC table (p.5) lists "LFO2 EG1 Mod" at CC 67, but the preset byte map
(p.25) puts "LFO3 Aftertouch Mod" at byte 67 — there is no LFO2 EG1 Mod byte.
Reading: LFO2 EG1 modulation depth is runtime-only (settable via CC, not
persisted to flash).

## 6. Multitimbral preset structure typo on page 26

Page 26 describes part 4's bytes as "384–512" — a 128-byte part can't extend
to byte 512 of a 512-byte multi (ends at 511). Treat parts as 4×128
contiguous bytes with no gap.

## 7. Tune table stores integer millisemitones, not floats

Page 8 lists 128 semitone values like `−0.500`, `0.039`, `0.500`. Store as
integer millisemitones (value × 1000) rather than floating point, and expose
a `.semitones()`-style accessor for callers that want the float view. CC
values 63 and 64 both map to 0 millisemitones (the spec's only duplicate) —
pick a canonical direction (63) so all other values round-trip.

## 8. Voices CC encoding caps at 71 (V1 ≤ 4, V2 ≤ 7)

CC 97 packs `V1*16 + V2`. V1 above 4 and V2 above 7 are reserved, capping
the maximum legal CC value at 71. Values 72-127, and low values whose V2
nibble falls in the reserved range, should be treated as errors.

## 9. Reserved-range policy: errors, not silent fallback

For every enum with a reserved/invalid range (`OtherMode` 80-127, `Voices`
>71, `MidiFilter` >7, `SoftThru` >15, `RxChannel`/`TxChannel` >16,
`ClockSource` >1, MCM channel count >15), fail loudly rather than coercing to
a nearest valid variant. Callers that want to recover can do so explicitly.

## 10. Write Configuration trailing pad byte must be zero

Page 20 shows a trailing `0x00` after the six configuration fields. Always
emit 0; reject non-zero padding on decode. Unknown whether the device
tolerates non-zero padding — untested.

## 11. Configuration EEPROM is 1024 bytes; only 5 are documented

Memory map (p.24): `0x020000–0x0203FF` is 1024 bytes of configuration
memory. The documented layout (p.27) covers only the first 5 bytes. The
remaining 1019 bytes are untyped, reachable only via generic Read/Write
Memory.

## 12. Device sends an undocumented preview frame before Read Memory responses

Observed against firmware on serial #361: a single Read Memory command
produces **two** SysEx frames on the wire, ~16ms apart — a short malformed
preview frame (odd-length nibble payload, not spec-shaped) followed by the
real spec-shaped response. Not in the spec, but reproducible. The
request/response helper in `src/midi` must treat parse failures within the
timeout window as transient (keep waiting for a frame that parses) rather
than fatal, to absorb this.

---

## Open questions (needs hardware re-validation)

These have not been resolved against real hardware yet — track as open
questions, not assumptions:

13. **Filter Resonance (CC 71)** was referenced in code but never defined
    with an actual constant. Believed **inbound-only** per informal hardware
    notes (device reports panel changes, may not accept outbound writes) —
    unverified.
14. **`GlobalTranspose` vs. `Osc1Transpose`** both plausibly claim CC 3.
    Which byte does the physical CC 3 actually drive — the global transpose
    field, or oscillator 1's transpose? Needs a hardware test.
15. Whether other Read commands (Serial, Configuration, Autotuning, Lock
    echo, Write Memory echo) exhibit the same preview-frame prelude as Read
    Memory (#12) was never confirmed — the defensive handling should already
    be correct for any of them, but it's untested.
