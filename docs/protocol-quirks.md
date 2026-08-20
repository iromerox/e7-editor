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

**Hardware-confirmed 2026-08-19**, serial #361. Writing `1` to byte 127 of
slot 8.8.8, then attempting a panel save to that address (Shift + Bank/Save,
buttons 8-8-8, Save), was refused with **"Write protected"** on the display.
Writing `0` to the same byte and repeating the identical gesture reported
**"Preset saved"**. Byte 127 = 1 locks, 0 unlocks, page 26 is right, and the
pp. 16-17 example labels are confirmed inverted.

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

## 5. EG1 Mod: CC 67 and byte 55 disagree about which LFO — **open**

**This entry's reading is contested and is now owned by HW-08.** It stays
numbered here rather than moving to the open-questions section below so the
cross-references to "#5" keep resolving.

The CC table (p.5) lists "LFO2 EG1 Mod" at CC 67, and the preset byte map
(p.25) has no LFO2 EG1 Mod byte — byte 67 is LFO3 Aftertouch Mod, and the
LFO 2 run's spare bytes (61-63) are reserved. The original reading was that
LFO2 EG1 modulation depth is runtime-only: settable via CC, not persisted to
flash. `src/protocol/cc-map.ts` leaves CC 67 unmapped on that basis.

The panel photography contradicts it. The instrument has **exactly one**
EG1-to-LFO control — `EG1 Mod`, the shift layer of the **LFO 2** `Rate` knob
— and the LFO 1 block has none. The user manual (p.14) attributes it to
LFO 2 too. Meanwhile the byte map names byte 55 "LFO1 EG1 Mod", and that
byte is what `preset.ts` decodes as `lfo1.eg1Mod`.

So there is one knob, one CC, and one byte, and the two documents disagree
only about the LFO number. The simplest explanation is that all three are
the same parameter — EG1 modulating LFO 2's rate, persisted at byte 55 — and
that the byte map's "LFO1" prefix is the typo. Against that: byte 55 sits
inside the LFO 1 run (53 shape, 54 rate, 55 this, 58 mode), which is
self-consistent for LFO 1.

Consequences either way. If the original reading holds, `lfo1.eg1Mod` is a
preset byte no control can reach and the panel's knob writes a CC that maps
to nothing. If the panel is right, a real persisted parameter is currently
unreachable from the editor and the field is misnamed.

Until HW-08 answers it: don't rename `lfo1.eg1Mod`, don't wire CC 67 into
the CC↔field map, and don't remove either framing. See `panel-layout.md`
Finding 1 for the four sources side by side.

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

## 12. The "preview frame" is a host artifact, not a device behavior

This entry used to say the device sends an undocumented short frame before
each Read Memory response. **It does not.** Nothing the instrument transmits
has ever been shown to be malformed, and the claim is withdrawn: read the
paragraphs below as the correction, not as a caveat on a standing claim.

What was originally observed against serial #361 was a single Read Memory
command producing **two** SysEx frames ~16ms apart — a short frame no decoder
accepts, then the real spec-shaped response. The shape is real. What produces
it is the host's MIDI client, not the synthesizer.

**Two independent transports, same instrument and same cable, see no such
frame.** The in-browser smoke test (Brave/Chromium, Web MIDI, USB) read the
serial number and all eight blocks of preset 1.1.1 and saw zero unparsed
frames across nine commands. A later session drove the same device from Node
over CoreMIDI and saw the same thing: eight Read Memory commands, eight
34-byte spec-shaped responses, nothing short and nothing malformed. That
capture is `fixtures/read-memory-clean.wire`.

That second run is what settles it, and it eliminates the three candidates
this entry used to list:

1. **Chromium dropping malformed frames — ruled out.** A native CoreMIDI
   client does no such validation and would have delivered a malformed frame
   untouched. It received nothing to deliver, so there was nothing on the wire
   for a browser to be hiding.
2. **A Soft Thru echo of the outbound command — ruled out on this rig,
   though not for the expected reason.** Soft Thru was assumed to be off; it
   is not. Read Configuration on serial #361 returns `00 00 07 01`, so the
   Soft Thru byte is **1**, not 0. It still does not echo: a SysEx frame from
   another manufacturer (`F0 7D 01 02 03 04 F7`), which the device cannot
   answer and could only return by replication, was never returned, and none
   of the outbound Read Memory commands came back either. Whatever bit 0 of
   that byte selects, it does not replicate an inbound USB SysEx to the USB
   output. The rig of the original sighting cannot be reconstructed, but
   configuration memory is persistent and nothing in this project has ever
   written it, so 1 is most likely what it read then too.
3. **A native-MIDI-client artifact — this is what it was.** Not a bug in
   `midir` specifically: it is how a SysEx frame reaches any client that talks
   to CoreMIDI directly, in pieces rather than whole. Web MIDI is specified to
   deliver one complete `F0...F7` frame per event and does; a native client
   sees the fragments.

**The mechanism reproduces on demand.** On the Node path every answer trails
its command by one (HW-11), so a session that sends a command and exits leaves
an answer undelivered — and no amount of *waiting* drains it, because the
device only ships a pending answer when something is next sent to it. The next
session to open the port receives the tail of that answer as a frame of its
own, and its first real response behind it. That is one short undecodable
frame followed by one spec-shaped response: #12's description exactly, with
the instrument sending no prelude at any point. The capture is
`fixtures/stale-frame-tail.wire`.

So #12 and #16 are the same phenomenon seen from two angles, which is what the
third candidate predicted. The consequence for the code is unchanged and the
tolerance stays: `requestResponse` must still treat a parse failure inside the
timeout window as transient rather than fatal, because a fragment arriving
ahead of a real response is exactly what this produces on a non-browser
transport. It is **defensive on Web MIDI and load-bearing off it** — but
nothing may assume a preview frame arrives, and nothing should describe one as
something the device does.

---

## Open questions (needs hardware re-validation)

These have not been resolved against real hardware yet — track as open
questions, not assumptions:

13. **Filter Resonance (CC 71) is resolved and bidirectional** — this entry
    stays numbered here rather than moving to the confirmed section below so
    the cross-references to "#13" keep resolving.

    **Hardware-confirmed 2026-08-19**, serial #361, over USB. The device
    receives CC 71: sending it on the receive channel moved byte 71 of the
    edit buffer (`0x030800`, the volatile Current Preset) to 0, 32, 96 and
    127 in turn, each landing on the value sent with no scaling. CC 74
    (Cutoff) was the positive control and moved byte 70 the same way; CC 102,
    which the CC table does not assign, moved neither byte, so the instrument
    is answering the controller rather than any control change. The device
    also transmits CC 71: turning the panel `Resonance` knob produced a
    continuous run of `B0 47 xx` and nothing else. The run that measured the
    inbound half was separate from the one that measured the outbound half,
    because the panel writes the same byte the outbound test reads back.

    So the earlier reading — device reports panel changes, may not accept
    outbound writes — was half right and is withdrawn. `ccDirection` no
    longer flags CC 71, the editor sends it like any other controller, and
    the `Resonance` knob turns.

    **CC 71 is not in the printed CC table.** The FILTER section on p.4 lists
    Cutoff, EG1 Mod, Velocity EG1 Mod, LFO1-3 Mod, Keyboard Tracking, Mod
    Wheel and Aftertouch, and no Resonance; 71 is assigned to nothing else in
    that table either. Byte 71 of the preset structure *is* FILTER Resonance
    (p.25), which is a coincidence of numbering rather than a rule — Cutoff
    is byte 70 and CC 74. The controller is real and undocumented, which is
    why nothing in the repo can cite a page for it.
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

    The panel narrows the *inbound* half of this: global transpose has no
    front-panel control at all — it is reachable only from the Preset Menu —
    while OSC 1 Transpose is the shift layer of the `Tune` knob. So a CC 3
    the device *transmits* during ordinary playing almost certainly comes
    from that knob. That is a hint about which field the device associates
    with CC 3, not an answer, and it says nothing about what an *inbound*
    CC 3 does when the editor sends one. See `panel-layout.md` Finding 3.
15. Whether other Read commands (Autotuning, Lock echo, Write Memory echo)
    exhibit the same prelude as Read Memory (#12) is **mostly moot now that
    #12 is a host artifact**: there is no device prelude for any command to
    exhibit, and what a given command shows depends on the transport rather
    than on the command. Read Serial Number and Read Configuration are both
    confirmed clean — the smoke test recorded a single response frame for the
    first, and HW-02's Node session recorded a single 6-byte frame
    (`F0 00 00 07 01 F7`) for the second. The three untried commands are worth
    a line in a capture when someone is next at the instrument, but nothing is
    waiting on them.
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

    **Off Web MIDI, splitting is real and observed.** HW-02's Node session
    against serial #361 over CoreMIDI received a lone `F7` as an event of its
    own — the tail of a frame whose head went to a port that had since
    closed. That is the same phenomenon as the Rust implementation's `midir`
    fragmentation and as #12, and it is why those two entries are one finding:
    a client talking to CoreMIDI directly sees the pieces of a frame, and a
    browser does not. The open question above is specifically about *browsers*
    and stays open; nothing here says a browser will ever fragment.
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
22. **Nothing accounts for the Chorus and Delay enable LEDs.** Both effect
    sections carry an LED beside their title on the front panel, and there is
    no on/off parameter behind either one: `Chorus` and `Delay` have no such
    field, the CC table lists no enable, and neither `ChorusType`
    (basic/ensemble) nor `DelayType` (four delay flavours) has an `off`
    variant. Either the effect is switched by a panel gesture that isn't a
    parameter, or the LED just tracks a non-zero `mix`. HW-09 owns this.
    Until it answers, the effect sections have no toggle to bind — don't
    invent an `enabled` field to back the indicator, because there is no byte
    to persist it in. See `panel-layout.md` Finding 6.
23. **Nothing says what value byte 48 holds when portamento is on.** The CC
    table lists CC 65 as `Portamento Switch` with no zone table — the only
    switch-like entry in it that has none — and the byte map names byte 48
    `Portamento On` without giving it values. The editor makes the
    Portamento Time knob write it — on as the time leaves zero, off as it
    returns — so it has to write *something*: 127 and 0, on the general MIDI
    convention for switch controllers 64-69. That convention is the reason to
    prefer those values and the only evidence for them. Nothing reads the
    byte back into the UI, so a wrong guess costs a byte the editor
    overwrites rather than a control that lies.

    Settle it in a hardware session: switch portamento on from a MIDI
    controller, read byte 48 of the edit buffer back, and record the value.
    A second pass in the other direction — send CC 65 with 127, 64, 1 and 0
    and listen for whether the glide engages — says whether the instrument
    applies the same convention on input. The same session should answer
    whether the panel's Time knob glides at all while byte 48 is 0, which is
    what decides whether coupling the two was necessary or merely tidy.
    HW-10 owns this.

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

19. **An unwritten lock byte reads `0xFF`, and a panel save leaves it
    unlocked.** Page 26's wording is deliberate — "if the value is *not* 1,
    the preset is unlocked" — because a third value occurs: slots that have
    never been written read `255` at byte 127, not `0` (8.8.8 and 3.1.1 of
    serial #361 both did). `Unlock Preset` writes `0` rather than restoring
    `255`, so the two unlocked values are not interchangeable when comparing
    a slot byte-for-byte against a backup. Saving a preset from the panel
    into an unlocked slot leaves byte 127 at `0`; the panel does not re-lock
    what it writes. This is why `isPresetLocked` testing `=== 1` rather than
    `!== 0` is load-bearing: a `!== 0` test reports every blank slot as
    locked.
