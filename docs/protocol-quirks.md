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

**In-browser, it does not appear.** A smoke test run against the same device
(serial #361, USB, Brave/Chromium, Web MIDI) read the serial number and all
eight 16-byte blocks of preset 1.1.1 and saw **zero** unparsed frames across
all nine commands — one frame per command, each parsing as the documented
response, the Read Memory responses arriving a consistent 15.7-16.0ms after
their command. So the tolerance in `requestResponse` is **defensive, not
load-bearing**: keep it, but nothing may assume a preview frame arrives.

That is not evidence the device stopped sending it. Three explanations fit,
and HW-02 should tell them apart rather than assume the first:

1. Chromium validates inbound SysEx and drops malformed frames before they
   reach the page, so a frame still on the wire is invisible to Web MIDI.
2. The original sighting was the device echoing the outbound command back
   with Soft Thru enabled — the command frame carries an odd-length payload
   after its header and would fail response decoding exactly as described,
   and it would arrive at once rather than after the device's ~16ms read
   latency, matching "~16ms early". Read the Soft Thru configuration byte on
   both rigs before ruling this out.
3. The `midir` backend produced it, which would make this quirk and #16 the
   same underlying bug seen from two angles.

---

## Open questions (needs hardware re-validation)

These have not been resolved against real hardware yet — track as open
questions, not assumptions:

13. **Filter Resonance (CC 71)** is now defined (`FILTER_RESONANCE` in
    `src/protocol/cc.ts`) and marked **inbound-only** (`ccDirection`) per
    informal hardware notes (device reports panel changes, may not accept
    outbound writes) — this framing is still **unverified**, pending
    confirmation in HW-03. Don't remove the unverified framing until HW-03
    resolves it.
14. **`GlobalTranspose` vs. `Osc1Transpose`** both plausibly claim CC 3.
    The CC table (p.5) lists CC 3 as OSC1 Transpose, but the byte map (p.25)
    has both an OSC1 Transpose byte (20) and a bare Transpose byte (105) —
    and only the former has a documented CC. Which byte does the physical
    CC 3 actually drive? Needs a hardware test (HW-04). Until then
    `src/protocol/cc-map.ts` maps CC 3 to *both* candidate fields
    (`osc1Transpose` and `transpose`): `ccToFields(3)` returns the pair and
    `applyCc` returns `{ kind: "ambiguous" }` rather than picking one.
    Callers that know which control the user touched can still write either
    field directly with `writeField`. Don't collapse the pair to a single
    field until the hardware test resolves it.
15. Whether other Read commands (Configuration, Autotuning, Lock echo, Write
    Memory echo) exhibit the same preview-frame prelude as Read Memory (#12)
    is still unconfirmed — the defensive handling should already be correct
    for any of them, but it's untested. Read Serial Number is no longer among
    them: the smoke test recorded a single clean response frame for it.
16. **No browser has been seen to split an inbound SysEx frame.** The Rust
    implementation needed real reassembly because of a `midir`-backend
    fragmentation quirk; Web MIDI is specified to deliver one complete
    `F0...F7` frame per message event, so `src/midi/reassembly.ts` is a guard
    against a driver that doesn't, not a known-load-bearing path. The smoke
    test (serial #361, USB, Brave/Chromium, nine commands) reported
    `fragmentedFrames` 0, `discardedPartials` 0, and no bytes left pending —
    every frame arrived whole in a single event, as specified. Keep the guard
    for drivers not yet tried, but nothing may depend on it doing work.

    The caveat it was meant to catch therefore stays open rather than
    resolved: webmidi.js classifies an incoming message by its leading status
    byte, so a continuation fragment carrying no status byte may never
    surface as a `sysex` event at all. A run that fragments would show up not
    as a non-zero `fragmentedFrames` but as a timeout with bytes left
    pending. If that is ever observed, what feeds the reassembler has to
    change, not just the reassembler.
19. **Whether the device accepts a pipelined request is untested, and a full
    backup takes over two minutes if it doesn't.** Every command in the smoke
    test answered in 15.7-16.0ms — a fixed cost, identical for a 2-byte
    serial response and a 34-byte memory response. It is device-side, not
    transport-side: across those nine samples the spread was 0.3ms, whereas
    delivery batched on a browser task queue would scatter latencies across a
    full tick, and the ~63Hz floor doesn't match a 60Hz refresh either.

    `requestResponse` sends one command and waits, so that cost is paid
    serially. Reading all of preset memory is 8192 Read Memory calls
    (`0x000000-0x01FFFF`, 16 bytes each) — about 2min 11s, and no amount of
    client-side work reduces it while requests stay sequential. Whether the
    device will accept a new command while preparing a response, and how deep
    that queue goes, has never been tried. Settle it before designing BULK's
    bulk reads and progress UI, because the answer decides whether a full
    backup is a progress bar or an operation the user walks away from.
20. **The outbound CC rate limit was chosen without hardware and may be about
    3x too permissive.** `MIN_CC_INTERVAL_MS` is 5 (200Hz per
    channel/controller pair). If the device really works on the ~16ms cycle
    #19 measured, a knob drag still delivers roughly three updates per device
    cycle, so the limiter throttles far less than its name suggests. Whether
    the device drops the surplus, lags behind a drag, or handles it fine is
    unknown — nothing has been sent to the instrument at rate yet.
21. **Every hardware finding here is USB-only.** The smoke test ran over the
    e7's USB port. DIN MIDI is a different physical path at 31250 baud, where
    a 34-byte Read Memory response occupies ~9ms of wire time rather than
    being effectively instant, so both the framing questions (#12, #16) and
    the latency in #19 could behave differently. Treat #12, #16, and #19 as
    settled for USB and open for DIN until someone runs the same page through
    a DIN interface.

---

## Confirmed against hardware

Observations from a real device that the printed document doesn't state.
Same standing as the settled entries above, kept apart only because they
were learned by running the instrument rather than by reading.

17. **Preset names are ASCII, padded to 20 bytes with `0x20`.** The byte map
    (p.25) reserves bytes 0-19 for the name without saying how characters are
    encoded; the printed Read Memory example on p.14 implies ASCII, and
    preset 1.1.1 of serial #361 confirms it — `50 75 6D 70 69 6E 20 50 61 64`
    followed by ten `0x20`, reading "Pumpin Pad". Trailing spaces are padding,
    not part of the name.

18. **Reserved bytes are not uniformly zero.** In that same preset, bytes 125
    and 126 both read `0xFF` while every other undocumented byte read `0x00`
    — and they are the only two bytes in the whole 128 above `0x7F`. What
    they mean is unknown, but they carry a value the device put there, which
    is why `src/protocol/preset.ts` round-trips undocumented bytes verbatim
    instead of zeroing them on encode. Don't "clean" them.
