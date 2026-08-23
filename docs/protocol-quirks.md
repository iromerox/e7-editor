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
14. **CC 3 is OSC 1 Transpose, and the preset's own Transpose has no CC** —
    this entry stays numbered here rather than moving to the confirmed
    section below so the cross-references to "#14" keep resolving.

    **Hardware-confirmed 2026-08-20**, serial #361, over USB, both
    directions. Sending CC 3 on the receive channel moved byte 20 (OSC 1
    Transpose) of the edit buffer — volatile `0x030800`, the Current Preset —
    to 0, 41, 96 and 127 in turn, each landing on the value sent with no
    scaling, and byte 105 (Transpose) never moved. CC 30 (OSC 2 Transpose)
    was the positive control and moved byte 34 the same way; CC 102, which
    the CC table does not assign, moved neither byte. Holding Shift and
    turning the `Tune`/`Transpose` knob transmitted a continuous run of
    `B0 03 xx` and no other controller.

    So the CC table (p.5) is right where it lists CC 3 under OSC1, and the
    byte map's bare Transpose byte 105 has no controller behind it: the
    printed table's OTHER section carries only Mode (116) and Voices (97),
    and no row anywhere assigns byte 105. `cc-map.ts` therefore resolves
    CC 3 to `osc1Transpose` alone, `ccToField(3)` returns that one field, and
    the `transpose` field is gone from the CC map rather than mapped to a
    controller it does not have. Byte 105 is still decoded, preserved and
    re-encoded like every other preset byte — what it no longer has is a live
    path to the instrument.

    That last point is a constraint on the editor rather than a quirk of the
    documents. Volatile memory cannot be written by SysEx (p.24), so with no
    CC of its own the preset's global transpose cannot be changed on a
    running instrument at all — only by writing a preset to flash and loading
    it, or from the Preset Menu on the panel.

    Whether an *undocumented* CC drives byte 105, the way CC 71 turned out to
    drive resonance (#13), is not settled, but the evidence runs against it:
    sweeping the byte across its whole range from the Preset Menu transmitted
    **nothing at all**, where a comparable sweep of the `Tune` knob transmits
    a continuous run of CC 3. That says the instrument associates no
    controller with this parameter on the way out; only a sweep of all 128
    controllers against the byte would settle the way in.

    **Byte 105 encodes semitones as `64 + n`, over -48..+48.** Confirmed
    2026-08-20 against serial #361: nine readings of the byte taken while the
    Preset Menu displayed the value beside it — 0/64, ±12/52/76, ±24/40/88,
    ±36/28/100, ±48/16/112 — with the last pair being the menu's own limits.
    One byte per semitone, byte 64 for no transposition, hard-limited to
    16-112.

    **This is not the encoding the oscillators use, and the range is not
    theirs either.** OSC 1 and OSC 2 Transpose go through the 49-band CC
    lookup on p.7 over ±24 semitones (manual p.8); byte 105 is linear over
    ±48 (manual p.19, and p.22 for a multi part's `CH/TRANSP`, which is the
    same byte of that part's own 128). The two agree on exactly one value —
    byte 64 is 0 in both — so a control built on the wrong conversion looks
    correct at rest and is wrong everywhere else, by a factor of roughly two
    near the middle and by more at the extremes. `presetTransposeFromByte` /
    `presetTransposeToByte` in `src/protocol/transpose.ts` are the right pair,
    deliberately sitting beside `transposeFromCc` so the difference is visible
    at the point of use. See `panel-layout.md` Finding 3.
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
19. **The device pipelines, the 16ms is a latency rather than a rate, and a
    bulk read should keep four requests in flight** — this entry stays
    numbered here rather than moving to the confirmed section below so the
    cross-references to "#19" keep resolving.

    **Hardware-confirmed 2026-08-22**, serial #361, over USB, driven from
    Node over CoreMIDI. Read-only throughout: Read Memory and Read Serial
    Number, nothing written to the instrument.

    The serial figure holds over a long run. 150 Read Memory calls sent one
    at a time, each after the previous answer arrived, round-tripped in
    **15.4ms min / 15.6ms median / 16.7ms max**, 16.6ms per read counting the
    host's own turnaround, with every answer carrying the block its own
    request asked for. So the smoke test's 15.7-16.0ms was not a nine-sample
    artifact.

    **But it is the cost of waiting, not the cost of answering.** Read Serial
    Number sent 64 deep with no waiting drew all 64 answers, one every
    2.6ms — 6x the sequential rate, on the same path, in the same session.
    Whatever the ~16ms is, it is not a floor on how often the device can
    answer.

    **Read Memory pipelines to a ceiling of five outstanding requests.**
    Bursts of 1 through 5 were answered in full and in order, the first
    answer at ~16ms and each next one ~10.9ms behind it. At six the device
    answers the first five correctly, delivers the sixth as a **truncated
    prefix of its own answer** — correct bytes, cut off mid-frame, terminated
    with `F7` like any complete frame — and drops every request after it. A
    64-deep burst behaves exactly like a 6-deep one: five answers, one
    fragment, 58 requests unanswered. The fragment's length varies with how
    fast the burst was sent (13, 14, 28 and 29 bytes observed), and its bytes
    always decode as a prefix of the block that request asked for, so the
    request arrived intact and the response was cut on the way out.

    That ceiling belongs to Read Memory rather than to the transport, since
    64 serial reads queued on the same path in the same session lost nothing.

    **A sliding window sustains it indefinitely.** Holding 2, 3 or 4 requests
    in flight and sending the next as each answer lands ran **8192 reads —
    the size of a full preset-memory backup — in 89.1s, none missing, none
    out of order**, a steady 10.9ms per read with no drift over the run. A
    window of 2 already reaches that rate, so depth beyond it buys nothing; a
    window of 5 sits on the ceiling and fails within the first few answers.

    **Nothing was ever seen out of order, at any depth.** That is a stronger
    statement than the harness alone can make: per #3 a response names
    nothing, so every answer here was checked by its bytes against the same
    blocks read one at a time first, and a swap between two blocks holding
    identical bytes is the only reordering this could not have seen.

    So, for BULK's bulk reads: **keep four Read Memory requests in flight**.
    Four rather than two for slack against host jitter, and never five. At
    10.9ms per 16-byte read that puts a group at ~0.7s, a bank at ~5.6s, and
    all of preset memory at **~1min 29s** against a sequential read's 2min
    11s floor — 2min 16s at the rate the 150-call run actually held. Still a
    progress bar and still an operation the user walks away from, but a third
    off it. Three things the window has to do, all
    from the failure above: fill in order and credit each answer to the
    oldest outstanding request, since correlation is positional and nothing
    else identifies an answer; treat any frame that is not exactly 34 bytes
    as a lost answer rather than a decode error, because that is what
    over-filling looks like; and fail the whole window on a missing answer
    rather than shifting the pairing, since a drop silently re-pairs every
    answer behind it.

    Not measured over DIN MIDI — no interface was available (see #21).
20. **The outbound CC rate limit stays at 5ms, and no rate was found that the
    device cannot take** — this entry stays numbered here rather than moving
    to the confirmed section below so the cross-reference to "#20" keeps
    resolving.

    **Hardware-confirmed 2026-08-22**, serial #361, over USB.
    `MIN_CC_INTERVAL_MS` is unchanged at 5. A three-second drag of CC 74
    (FILTER Cutoff) was sent at 32, 16, 8, 5, 2 and 1ms per message while
    byte 70 of the volatile Current Preset (`0x030800`) was read back during
    the drag and after it — three drags at each interval, the whole set run
    twice: 36 drags and 34,542 control changes. The device kept up with every
    one of them. Each sample taken mid-drag read the value most recently
    sent, a lag of zero at all six rates, and the only non-zero reading
    anywhere was the ramp's own advance during the read that measured it —
    one value, occasionally two, which is what a 16ms round trip is worth on
    a ramp moving a value every ~27ms.

    That is not a small margin. Had the device consumed control changes at
    the ~16ms cadence #19 measured, the 5ms drag's 600 messages would have
    arrived three times faster than it could take them: it would have been
    about two thirds of the ramp behind by the last send and needed a further
    ~6.6 seconds to catch up. The settle read taken 17ms later already held
    the landing.

    **The landing is the half that matters**, per the premise this entry was
    raised with — a limiter that is too fast only costs something if the
    value the user lets go on can be lost. Each drag is built so a hit cannot
    be faked: a monotone ramp whose last 16 sends carry one value each, so
    the landing is on the wire exactly once and a dropped final message reads
    as a miss instead of being covered by a repeat of itself. The drags
    landed on 127, 96 and 63 in turn, so a device that merely pinned at the
    top would have failed two in three. 36 of 36 landed exactly. In each,
    byte 70 already held the landing at the first read that could be taken
    after the last send, ~17ms later — that is one read round trip (#19), so
    it is an upper bound on how long the device took, not a measurement of
    it.

    Pushed past the limiter altogether — 3000 control changes handed to the
    port back to back with no pacing, which the host buffers and the wire
    then delivers at its own speed — the landing was still exact, in six
    drags across two runs. What broke there was the **read** path rather than
    the CC path: a Read Memory issued behind that many queued sends drew no
    answer at all, so those runs have no settle time while their final values
    are as good as the rest.

    So the "3x too permissive" reading is withdrawn and 5 stays — not because
    the device needs the throttle, but because nothing found a rate that
    wants a different number. 200Hz per channel/controller pair is already
    past what a pointer drag across a 128-step range can use, so loosening it
    would buy resolution that does not exist; tightening it would throttle a
    device demonstrably able to take five times more. What the limiter earns
    its place doing is host-side coalescing, not protecting the instrument.

    **Two bounds on this.** It measures the parameter byte the device holds,
    not the sound it makes: if the audio path smooths or trails its own
    parameter state, nothing here would see it, and since the display answers
    no incoming CC (confirmed entry 20 below) there is no readout to check
    against either. And it moves one controller at a time — the limiter
    budgets per channel/controller pair, so anything moving several controls
    at once puts a multiple of these rates on the wire, which was not tested.
21. **Every hardware finding here is USB-only.** The smoke test ran over the
    e7's USB port, and so did #19's throughput run. DIN MIDI is a different
    physical path at 31250 baud, where a 34-byte Read Memory response
    occupies ~9ms of wire time rather than being effectively instant — which
    is most of #19's 10.9ms pipelined cadence, so a DIN run could find the
    wire rather than the device setting the rate, and the five-deep ceiling
    reached at a different sending speed. Treat #12, #16, and #19 as settled
    for USB and open for DIN until someone runs the same page through a DIN
    interface.
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

20. **The clock-sync rate divisions are regular 8-wide bands, and the delay's
    run backwards.** The MIDI implementation gives these no table at all; the
    user manual names the 15 divisions and fixes their order (p.14, and p.15
    for the delay, which defers to p.14) but says nothing about which CC
    values select which. Measured on serial #361, both are the same regular
    shape the document's other zoned CCs use — bands of 8, the fifteenth
    division absorbing the 16-value remainder — over the manual's order:

    | | band for division *i* | remainder band |
    |---|---|---|
    | `LfoClockRate` (CC 76) | `[8i, 8i+7]`, ascending from `Whole Note` at 0 | `1/32 Note`, 112-127 |
    | `DelayClockRate` (CC 111) | the same bands, descending from `Whole Note` at 127 | `1/32 Note`, 0-15 |

    So `delayClockRateFromCc(cc)` equals `lfoClockRateFromCc(127 - cc)` at
    every one of the 128 values, and `delay-clock-rate.test.ts` asserts
    exactly that. Both tables are built from that shape rather than listed
    out: the LFO's from `bandedZones`, the delay's by running the LFO's
    through `mirrorZones`. The two are a mirrored axis rather than two
    unrelated orderings — which is visible at the panel, where `Delay Time`
    sweeps from the shortest division to the longest and `LFO 1 Rate` sweeps
    the other way. A control built to sweep both the same direction is wrong
    on one of them.

    Neither table's previously shipped boundaries were right; they came from
    an earlier reverse-engineering pass and drifted by up to eight values.
    Captured by turning each knob against the instrument's own display, since
    **the display answers only to the panel and never to an incoming CC** —
    Filter Cutoff was tested as a control and moved the byte without ever
    lighting the screen. The edit buffer is no help either: byte 54 tracks CC
    76 and byte 116 tracks CC 111 exactly, so nothing readable over MIDI names
    the division. See `fixtures/lfo-clock-rate-zones.wire` and
    `fixtures/delay-clock-rate-zones.wire`.
