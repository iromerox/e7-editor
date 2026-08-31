# Protocol quirks

Discrepancies between the printed GS Music *e7 MIDI Implementation* document
(dated 2022-09-22) and either real hardware behavior or an implementation
decision worth flagging. Each entry is a decision the implementation should
make that a careful reader of the spec should know about. Page numbers refer
to the printed page numbers of the PDF, not the PDF page indices.

Much of this has since been checked against a real instrument — serial #361,
over USB, between 2026-08-19 and 08-23 — and the *Confirmed against hardware*
section below holds observations the printed document never states at all.
Each entry says for itself whether hardware backs it, with the date and what
was measured; trust it exactly that far. Several deliberately do not: #9 is an
implementation policy, and #11 is a reading of the memory map that #30
contradicts on the one part of it anybody has tried. One bound covers all of
it — #21 holds every hardware finding here to USB, DIN being a different
physical path nobody has run.

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
bytes; Write also takes an MPE Enable byte not in that map. Model the
asymmetry directly rather than trying to force a single shared shape.

**Read genuinely does not surface ClockSource — hardware-confirmed** on serial
#361 over USB: Read Configuration comes back as exactly `00 00 07 01`, four
bytes, with neither ClockSource nor MpeEnable among them. That is the same
reading #12 took its Soft Thru byte from, so the asymmetry is the
instrument's own rather than a gap in the document.

**Whether MpeEnable is accepted by Write but not persisted is closed without
an answer, deliberately.** Read never returns the byte, so it cannot be read
back, and settling it would mean observing MPE behaviour with an MPE
controller — which this project does not have. Treat MpeEnable as write-only
and build nothing that depends on reading it back.

**And nothing has ever been seen to come of the write half — see #10.** The
asymmetry above is still the shape to model, because it is the shape the
document describes and the shape a frame has to have. But on the one
instrument this has been run against, Write Configuration changes nothing,
which puts a question over any editor control built on it.

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

## 5. EG1 Mod: CC 67 is LFO 2's, and lives at byte 61 — which the map reserves

**CC 67 turned out to be one of seven, not a lone exception — see #27.** The
sweep that settled #14 found the same shape at six more controllers, LFO 1's
own EG1 Mod among them.

**Hardware-confirmed 2026-08-23**, serial #361, over USB, both directions.
The entry stays numbered here rather than moving to the confirmed section
below so the cross-references to "#5" keep resolving.

Nobody's candidate was right. **CC 67 drives byte 61**, which the byte map
(p.25) prints as reserved, and **byte 55 never moves**. Sending CC 67 on the
receive channel put 40, 100 and 127 into byte 61 of the edit buffer —
volatile `0x030800`, the Current Preset — each landing on the value sent with
no scaling. CC 76 and CC 62 were the positive controls and moved bytes 54 and
60 the same way; CC 102, which the CC table does not assign, moved nothing.

The run diffed the **whole 128-byte image** around every send rather than the
two named candidates, which is the only reason byte 61 was found: watching
bytes 55 and 60 alone would have returned a null and been read as confirming
the runtime-only theory. Ask "which byte does this drive" of the whole image
whenever "none of them" is one of the answers on offer.

What that exposes is a byte map that is self-consistent after all — the two
LFO runs are parallel, and its only error is leaving byte 61 unnamed:

| | Shape | Rate | EG1 Mod | Mode |
|---|---|---|---|---|
| LFO 1 | 53 | 54 | **55** (named) | 58 |
| LFO 2 | 59 | 60 | **61** (printed `-`) | 64 |

So there are **two** EG1 Mod bytes, one per LFO, and the disagreement was
never about which LFO — the CC table describes LFO 2's, the byte map named
LFO 1's, and each is right about its own. Both earlier readings are
withdrawn: the parameter is not runtime-only, and the one-knob-one-CC-one-byte
reading from the panel photography was wrong to collapse the three.

**The parameter is LFO 2's**, confirmed twice over. The instrument refuses it
from the panel with `EG1 Mod N/A` / `Not available in Clk Sync LFO Mode` when
**LFO 2** is in Clock Sync or Monophonic, and never when LFO 1 is in either —
so the instrument itself ties the knob to LFO 2's mode. Independently, with
every other LFO 1 and LFO 2 destination silenced (both oscillators' pitch and
PWM, the filter, the amplifier) and EG1 Mod at maximum, the vibrato speed
moves across a held note only when LFO 2 is the one reaching the pitch. The
manual (p.14) is right, the CC table (p.5) is right, and the panel silkscreen
is right.

**The mode gate is the panel's, not the byte's.** CC 67 was accepted in every
mode tested, including the two the panel refuses — all five writes landed. So
byte 61 can hold a non-zero value the instrument is not acting on, and an
editor control has to mirror the panel's disabled state from LFO 2's mode
rather than treat a stored value as live.

`lfo1.eg1Mod` at byte 55 keeps its name, because it was never the wrong one.

**It is live, and it does have a controller — both answered since.**
Hardware-confirmed 2026-08-27, serial #361, over USB. The sweep in #14 found
**CC 57 drives byte 55**, undocumented and storing the value verbatim (#27),
which removed the reason this was untestable: the byte can be set in the
volatile Current Preset over MIDI rather than only by writing a preset to
flash and loading it. With that, **EG1 modulates LFO 1's rate.** A single
oscillator, all eighteen LFO destinations silenced and exactly one opened per
round, EG1 falling from maximum across a five-second note:

| round | carries the pitch | EG1 Mod byte | vibrato speed |
|---|---|---|---|
| 1 | LFO 1 | 55 = 0 | steady |
| 2 | LFO 1 | 55 = 127 | **moves** |
| 3 | LFO 2 | 61 = 0 | steady |
| 4 | LFO 2 | 61 = 127 | moves |

Rounds 3 and 4 are the positive control, and they are what make round 2 worth
reading: byte 61 was already known to modulate LFO 2's rate, so a pair that
came back steady/steady would have meant the method could not hear the effect
rather than that byte 55 does nothing. Each round set its byte and read the
whole image back before the note, so no round was judged on a value the
instrument had not stored.

So the byte is a real parameter the engine acts on, not a name for a
modulation the hardware never wired. It is **not** the same shape as byte 105
in #14 any more: that one has no controller in either direction, while this
one has an undocumented controller and a live path — what it still has is no
panel control and no row in any printed table.

**Whether LFO 1's mode gates it is not measured.** The panel refuses LFO 2's
EG1 Mod in Clock Sync and Monophonic, and that gate was found by watching the
panel refuse its own knob. LFO 1 has no knob to refuse, so the same question
has no cheap form here; both LFOs were Polyphonic throughout. Don't assume the
gate generalises, and don't assume it doesn't.

See `panel-layout.md` Finding 1 and `off-panel-parameters.md`.

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

**The controller number this is built on is wrong — see #28.** Hardware drives
the voice bytes from CC 47, and ignores CC 97 entirely. The cap below is about
the encoding rather than the controller, but nothing in the pair reaches the
instrument as shipped.

CC 97 packs `V1*16 + V2`. V1 above 4 and V2 above 7 are reserved, capping
the maximum legal CC value at 71. Values 72-127, and low values whose V2
nibble falls in the reserved range, should be treated as errors.

## 9. Reserved-range policy: errors, not silent fallback

For every enum with a reserved/invalid range (`OtherMode` 80-127, `Voices`
>71, `MidiFilter` >7, `SoftThru` >15, `RxChannel`/`TxChannel` >16,
`ClockSource` >1, MCM channel count >15), fail loudly rather than coercing to
a nearest valid variant. Callers that want to recover can do so explicitly.

## 10. Write Configuration does nothing, which leaves its pad byte unsettled

Page 20 shows a trailing `0x00` after the six configuration fields. Always
emit 0; reject non-zero padding on decode. Both halves of that are still an
implementation decision rather than an observation — but not for the reason
this entry used to give. The write that was supposed to settle them found
something else: **the command has no effect on the instrument at all.**

**Hardware-measured 2026-08-30**, serial #361, over USB. Write Configuration
(`0x0D`) was sent with the pad at `0x00`, `0x01`, `0x40` and `0x7F`, each
carrying the four fields Read Configuration had just returned with the
Transmit Channel deliberately changed so that "the write took" and "nothing
happened" could not read alike. The p.20 example frame
`F0 00 21 62 01 10 0D 00 00 07 00 00 00 00 F7` was sent verbatim as well.
Nothing moved for any of them: Read Configuration answered `00 00 04 0f`
before and after every write, the panel's own Tx. Ch. page still read Ch. 1,
and a power cycle brought the instrument up on Ch. 1 — so the write is not
quietly reaching the EEPROM that p.24 says the startup values are loaded from,
either.

**The run was controlled, which is what makes the null worth anything.** A
flash write to a preset slot's name byte took and restored all 128 bytes in
the same session, and reads answered throughout, so the instrument was
accepting system exclusive writes while refusing these. The MIDI Filter is not
the cause: its three switches are PB/PC/CC (#29), and both the reads and the
flash write went through with it at 4. No panel control was touched during the
run.

**So the pad question cannot be answered by writing.** A non-zero pad is
indistinguishable from a zero one when neither does anything. The decode-side
rejection therefore stays exactly as it is, with its reason replaced rather
than confirmed: not that the instrument is known to refuse non-zero padding,
but that nothing sent by this command is known to be accepted, so the
strictest reading of the document costs nothing. Re-ask it the moment a Write
Configuration is seen to land — over DIN, which #21 excludes from every
hardware finding here, or on firmware other than serial #361's.

## 11. Configuration EEPROM is 1024 bytes; only 5 are documented

Memory map (p.24): `0x020000–0x0203FF` is 1024 bytes of configuration
memory. The documented layout (p.27) covers only the first 5 bytes. The
remaining 1019 bytes are untyped, and the obvious way to them would be generic
Read/Write Memory — **which does not reach this region at all, see #30.** So
they are untyped and, from here, unreadable.

## 12. The "preview frame" is a stale tail, not a prelude

This entry used to say the device sends an undocumented short frame before
each Read Memory response. **It does not.** Nothing the instrument transmits
has ever been shown to be malformed, and the claim is withdrawn: read the
paragraphs below as the correction, not as a caveat on a standing claim.

What was originally observed against serial #361 was a single Read Memory
command producing **two** SysEx frames ~16ms apart — a short frame no decoder
accepts, then the real spec-shaped response. The shape is real. What produces
it is the tail of an *earlier* answer, ten bytes the instrument had withheld
and shipped only when the next command gave it something to push them out
with (#24) — not a prelude to the response behind it.

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
3. **A stale tail, arriving as a frame of its own — this is what it was.**
   Originally read as a native-MIDI-client artifact, on the grounds that a
   client talking to CoreMIDI directly receives a frame in pieces where Web
   MIDI delivers it whole. The pieces are real and that half stands, but the
   cause is the instrument's, not the client's: it withholds the last ten
   bytes of everything it transmits until ten more are queued behind them
   (#24). Those ten bytes are the stale frame. A browser is subject to the
   same withholding — it is one answer behind on the same sequence — and
   differs only in reassembling the pieces before handing them over.

**The mechanism reproduces on demand.** Every answer trails its command by
one — on every transport, browsers included (#24) — so a session that sends a
command and exits leaves ten bytes undelivered, and no amount of *waiting*
drains them, because only further output from the device pushes them out. The
next session to open the port receives that tail as a frame of its own, and
its first real response behind it. That is one short undecodable
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

## Questions the implementation raised

Places where code shipped on an assumption nobody had verified. **Most are
answered now.** An entry stays numbered here once hardware settles it rather
than moving to another section, so that every `#N` reference to it keeps
resolving — which makes this a mixed section by design rather than a list of
things outstanding. Each entry states where it stands, and where hardware
answered it, the date and what was measured:

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
    outbound writes — was half right and is withdrawn. The editor sends CC 71
    like any other controller and the `Resonance` knob turns. This was the
    only controller ever modelled one-way; with it withdrawn and no later
    hardware run turning up another, the direction model that carried it was
    removed rather than kept empty.

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

    **No undocumented CC drives it either — all 128 were tried.**
    Hardware-confirmed 2026-08-27, serial #361, over USB. The way *out* was
    already evidence: sweeping the byte across its whole range from the Preset
    Menu transmitted nothing at all, where a comparable sweep of the `Tune`
    knob transmits a continuous run of CC 3. The way *in* is now measured
    rather than inferred. Every controller 0-127 was sent on the receive
    channel and the whole 128-byte image of the volatile Current Preset was
    diffed against a fixed baseline around each one — not byte 105 alone,
    since #5 established that watching named candidates returns nulls that
    look like answers. **Byte 105 never moved.**

    Three things make that null worth the word. Every controller was sent
    twice where once was not enough — 100 first, then 40 to the 28 that stayed
    silent, because a byte already holding the value sent moves nothing and
    reads as inert, and no byte can hold both. Each controller's byte was put
    back to baseline before the next was tried, so no reading was taken
    through the accumulated state of the controllers before it — a mode byte
    left somewhere else gates later parameters and would have turned real
    findings into nulls. And CC 97 was re-asked with values its own encoding
    accepts (#8 caps it at 71, so both sweep values had been *refused* rather
    than ignored); it stayed silent on those too.

    The controls behaved: CC 74 moved byte 70, CC 102 moved nothing, and
    nothing arrived inbound that the run had not itself sent. The channel mode
    messages, 120-127, were sent last as their own pass so that nothing
    measured could be spoiled by them, with Read Configuration taken before
    and after: none moved a preset byte and the configuration was unchanged.
    Bank Select was swept like any other controller because it is latched and
    inert until a Program Change acts on it, and none was ever sent.

    So byte 105 has no controller in either direction, and the constraint
    below is not provisional.

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
15. **The three untried commands are captured, and none of them sends a
    prelude.** The question was whether Read Autotuning Status, the
    Lock/Unlock echo and the Write Memory echo exhibit the prelude #12 used to
    describe, which was already **mostly moot** once #12 became a stale tail:
    there is no device prelude for any command to exhibit, and what precedes a
    given answer is whatever the command before it left withheld. Read Serial
    Number and Read Configuration were confirmed clean earlier — the smoke
    test recorded a single response frame for the first, and HW-02's Node
    session recorded a single 6-byte frame (`F0 00 00 07 01 F7`) for the
    second.

    **Hardware-captured 2026-08-30**, serial #361, over USB, in
    `fixtures/untried-read-commands.wire`. Each command was sent alone and
    repeated, with nothing awaited between sends, and each drew exactly one
    frame per send:

    | Command | Frame it drew | Documented |
    |---|---|---|
    | Read Autotuning Status | `F0 00 04 FC 00 00 7B F7`, then a lone `F7` | `F0` + on/off + 7 voice bytes + `F7`, 10 bytes |
    | Write Memory echo | the 34-byte nibble payload sent back verbatim | as documented, p.15 |
    | Lock/Unlock echo | `F0 00 00 F7` | as documented, pp.16-17 |

    So two of the three are exactly what the document says, and the answer to
    Read Autotuning Status is not — see #31, which owns that. Nothing in the
    capture arrived ahead of the command it answered, and no answer arrived
    split across two of them.

    **The reading the capture was taken for did not apply.** The expected
    shape was a tail belonging to the *previous* answer sitting under each
    command, per #24. Nothing was withheld at all in this session: every
    command answered its own send in one whole frame, ~6ms later, including
    Read Memory, which is where #24 was measured. That is a contradiction of
    #24 rather than a confirmation of it, and #24 carries where it stands.
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
22. **The Chorus and Delay enable LEDs are `mix > 0`, and they answer an
    incoming CC** — this entry stays numbered here rather than moving to the
    confirmed section below so the cross-references to "#22" keep resolving.

    **Hardware-confirmed 2026-08-23**, serial #361, over USB. There is no
    enable gesture to find. Driving `Chorus Mix` (CC 13) and `Delay Mix`
    (CC 12) from MIDI over 0, 1, 64, 127 and back to 0 lit each section's
    lamp at every non-zero value and darkened it at zero, on both effects,
    and the threshold sits exactly where it has to for `mix > 0` to be the
    whole rule: **1 lights it and 0 does not**. There is no band of low
    values that reads as off, and so nothing left for a separate state to
    account for.

    Every step read the mix byte of the volatile Current Preset
    (`0x030800`) back beside the answer — byte 122 for Chorus, byte 118 for
    Delay — and all ten landed on the value sent, so "the lamp did not move"
    was separable from "the send never arrived" at each one. CC 74 (Cutoff)
    was the positive control, and the run reported nothing inbound while it
    measured, so no panel touch can be mistaken for the instrument
    answering.

    So of the two readings this entry was raised with, the second is right
    and the first is withdrawn: no panel gesture, no state without a
    parameter, and nothing for a sweep of the undocumented controllers to
    look for. Two consequences for the editor. The indicator has a real
    binding — `mix > 0`, on a field that already exists — and the warning
    against inventing an `enabled` field stands for a better reason than
    before: not that there is no byte to persist it in, but that the byte it
    would duplicate is `mix`. And **persistence needs no separate
    measurement**: the lamp renders a preset byte, so it is saved, loaded,
    copied and restored exactly as `mix` is, and an editor drawing it from
    `mix` cannot come to disagree with the panel about it.

    **These lamps answer an incoming CC where the display does not**
    (confirmed entry 20). Worth keeping apart from the finding itself,
    because the display invites the generalisation that the panel's readouts
    follow physical controls only — and these do not. A run driving a
    parameter from MIDI can watch them and trust what it sees, which is a
    cheaper observable than the display for anything they cover. See
    `panel-layout.md` Finding 6.
23. **Byte 48 stores CC 65 verbatim and the engine reads it as `>= 64`, and
    the instrument never writes 0 there** — this entry stays numbered here
    rather than moving to the confirmed section below so the
    cross-references to "#23" keep resolving.

    **Hardware-confirmed 2026-08-23**, serial #361, over USB. Three findings,
    and the third is the one that matters.

    **The byte is a raw store, not a flag.** CC 65 sent at 127, 64, 63, 1 and
    0 put exactly those values in byte 48 of the volatile Current Preset
    (`0x030800`) — it tracks the controller with no normalisation, so there
    is no canonical "on" value to read off it. CC 5 was the positive control
    and moved byte 49; CC 102 moved nothing; nothing arrived inbound while
    the run measured.

    **The engine reads it as a zone, and the zone is the one the spec prints
    for the instrument's other boolean.** With a time of 100 and the
    instrument monophonic, a two-octave legato pair glided at byte 48 =
    127 and 64 and did not at 63, 1 or 0 — the boundary sits between 63 and
    64, which is what the CC table gives OSC2 Sync on CC 51 (`0-63: OFF,
    64-127: ON`, p.4) and never gives CC 65. A round with the time at zero
    was the ear's control and did not glide. **So CC 65's missing zone table
    is an omission, not a different convention**, and the general MIDI
    reading the editor was built on lands in the right half by luck rather
    than by rule.

    **The byte is load-bearing, and only MIDI can clear it.** With byte 48
    forced to 0 and the physical `PORTAMENTO TIME` knob turned to 127, the
    same pair did not glide. The knob transmits CC 5 alone and left byte 48
    at 0, so the panel writes the time and never the switch — meaning an
    instrument holding 0 there has no control that can turn portamento back
    on. The way it stays usable is that **it never holds 0**: all 64 preset
    slots of bank 1 read byte 48 = 127, including the 47 whose time is 0 and
    the 17 that set a real glide time. The instrument leaves the switch on
    permanently and lets `time == 0` mean "no glide".

    That last point inverts what this entry was raised to check. The value
    the editor wrote for **on** was right; the value it wrote for **off**
    was the defect, and not because the device rejects it — because a preset
    saved with byte 48 = 0 cannot be rescued from the panel. The editor now
    writes 127 as the time leaves zero and leaves the byte alone as it
    returns, which is what every factory preset does, and it writes 127
    whenever the byte is below 64 with a time set, which repairs a preset
    that arrives unable to glide. See `panel-layout.md` Finding 5 and
    `off-panel-parameters.md`.

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

24. **The instrument withholds the last ten bytes of everything it transmits,
    until ten more bytes are queued behind them.** Its MIDI output retains a
    ten-byte residue and ships only the excess. A Read Memory answer is 34
    bytes: twenty-four arrive 5-10ms after the command, paced at MIDI's own
    31250 baud, and the remaining ten — the `F7` among them — are not sent.
    Waiting does not release them; five seconds of silence changes nothing,
    and neither system realtime nor a control change is enough on its own.
    What releases them is ten further bytes of the device's own output, which
    in practice is the next answer, arriving ahead of itself.

    **A client that reassembles `F0...F7` therefore reads the previous
    command's answer.** The answer is never late and never wrong — only its
    terminator is missing — but a frame cannot complete until the send after
    the one it answers, so a run of `requestResponse` calls returns every
    answer shifted by one, with correct-looking bytes and a normal-looking
    round trip. Nothing at the framing layer can see it: a response names
    nothing it answers (#3), so the shift is invisible unless the caller
    already knows the block it asked for.

    Measured on serial #361 over three transports on one machine and cable.
    A raw CoreMIDI client with no reassembly sees the stall directly, in the
    driver's own packets — that capture is
    `fixtures/withheld-frame-tail.wire`. RtMidi over Node and **Chrome over
    Web MIDI** are each one behind on the same sequence, six sends out of six,
    which is what rules out the transport. Another USB-MIDI device on the same
    CoreMIDI driver withholds nothing, which rules out the driver.

    Two consequences worth carrying. **The length of an answer decides whether
    a doubled send beats it**: sending a command twice queues a second copy of
    the answer behind the first, which clears ten bytes only when the answer
    is itself at least ten bytes long. Read Memory's 34 qualify; Read Serial
    Number's 4 and Read Configuration's 6 do not, and take four copies before
    the first surfaces. **And continuous traffic hides it entirely**, because
    something is always queued behind every answer — which is why the
    pipelining and CC-rate measurements in #19 and #20 saw no such shift and
    stand as taken.

    **It did not reproduce on 2026-08-30**, on the same serial #361 over the
    same USB cable, with the owner reporting the instrument neither
    power-cycled nor reconfigured since the session above. Nothing was
    withheld: single sends were answered whole, ~6ms later, one frame per
    send. Three independent checks, two of them the ones that measured this
    entry in the first place. `pipeline.ts serial 40` — the byte-checked run
    that returned 40 answers one request back, 40 times out of 40 — returned
    40 carrying the block just asked for and **0 one request back**, at a
    15.6ms median round trip. `fixtures/untried-read-commands.wire` (#15) has
    four commands of three different answer lengths, 4 bytes to 34, each
    drawing its own answer on its own send. And the raw CoreMIDI probe counted
    exactly 170 inbound bytes for five 34-byte Read Memory answers, with a
    process that sent once and exited leaving nothing at all for the next one
    to open the port — which is the residue itself, measured directly, at
    zero.

    So the retention is **a state rather than a standing property**, which is
    what HW-06 originally reported and what the session above withdrew. That
    withdrawal is now itself in doubt rather than restored: three sessions
    have measured this path and two of them disagree with the third, and what
    puts the instrument into one state or the other is not known. Nothing here
    is retracted — the mechanism was measured on three transports and explains
    what it explains — but a client may not assume either behaviour, which is
    the same conclusion the entry already forces and the reason
    `requestResponse` has to attribute an answer rather than count on one.

27. **Seven controllers drive the LFO blocks' unnamed bytes, and the printed
    CC table assigns none of them.** Hardware-confirmed 2026-08-27, serial
    #361, over USB, found by the whole-image sweep that settled #14. Each
    landed on the value sent, with no scaling, from a baseline of `0`:

    | CC | byte | what the byte map (p.25) calls it |
    |---|---|---|
    | 57 | 55 | `LFO1 EG1 Mod` |
    | 58 | 56 | reserved |
    | 59 | 57 | reserved |
    | 67 | 61 | reserved — this is #5's finding, listed for the shape |
    | 68 | 62 | reserved |
    | 69 | 63 | reserved |
    | 84 | 69 | reserved |

    **The shape is per-LFO and regular.** LFO 1's block is bytes 53-58 and
    LFO 2's is 59-64, the same five slots each; the consecutive controllers
    57/58/59 drive LFO 1's last three bytes and 67/68/69 drive LFO 2's, ten
    apart, slot for slot. Byte 69 is the last slot of LFO 3's block (65-69)
    and CC 84 drives it. So #5 was not an isolated exception — CC 67 is one
    member of a block the document omits entirely.

    **CC 57 is LFO 1's EG1 Mod**, which is the one of the seven whose byte the
    document already names. That closes the asymmetry #5 opened from the other
    side: the CC table lists an EG1 Mod for LFO 2 and none for LFO 1, the byte
    map names byte 55 for LFO 1 and reserves LFO 2's, and the instrument has
    both, each with its own controller. It also means `lfo1.eg1Mod` is
    reachable over MIDI, which is what the question of whether it does
    anything at all needs in order to be asked.

    **What the other five bytes are is not measured here.** All that was
    established is that each accepts a controller and stores it verbatim in
    the edit buffer; none of them is a byte the document names, and no ear
    test or panel gesture was involved. Nothing in the repo maps them.

28. **Voices is CC 47, not CC 97, and the shipped map cannot reach it.**
    Hardware-confirmed 2026-08-27, serial #361, over USB. Sending CC 47 moved
    **bytes 106 and 107** — `Mono Voice` and `Poly Voice` (p.25) — together,
    and sending CC 47 a value of `0` put them back. **CC 97 moved nothing at
    all**, at 100, 40, 71 or 0; the last two are values the packed encoding
    accepts, so this is not #8's cap refusing the write.

    The printed CC table's OTHER section (p.4) says `Voices 97`, and `cc.ts`
    and `cc-map.ts` both encode that. The table's other OTHER row is right —
    CC 116 moved byte 99 (`Mode`) in the same sweep — so this is one wrong
    row rather than a wrong section. As shipped, the editor's Voices control
    sends a controller the instrument ignores.

    **The value mapping is not characterised and must not be guessed.** CC 47
    at 100 put `4` into *both* bytes, which is not `16*V1 + V2` — that would
    be `V1 6, V2 4`, and 6 is outside the range #8 documents. Whether CC 47 is
    zoned, clamped, or sets the two counts from one axis needs its own run.
    Until then the pair `Voices`/`VOICES` describes an encoding whose
    controller was never verified against the instrument.

29. **Filter Mode's Control Change bit is bit 2, and at 0 the instrument
    answers no controller at all.** Measured 2026-08-27 on serial #361 by
    reading the configuration byte while the panel displayed its own state:
    with the Global Configuration menu's PB/PC/CC page (manual p.17) reading
    `PB: OFF, PC: OFF, CC: On`, byte `0x020002` reads **4**. So Control
    Change reception is the high bit of the three, not the low one the page's
    name order suggests, and the p.27 table's three columns are not in
    PB/PC/CC order.

    Worth knowing before any CC-driven measurement, because the failure is
    silent and looks like data: at Filter Mode `0` the instrument accepts no
    control change, so a sweep of every controller returns a clean null for
    every one of them — which for a question of the form "does any controller
    do X" is indistinguishable from the answer. Read the configuration and
    check the bit before sending, and keep a positive control in the run.
    `7` accepts all three (p.19).

30. **Configuration memory does not answer Read Memory.** Page 24 lists
    `0x020000–0x0203FF` as configuration memory, and #11 read the 1019
    undocumented bytes in it as reachable through generic Read/Write Memory.
    They are not. Measured 2026-08-30 on serial #361 over USB: Read Memory at
    `0x020000`, `0x020010` and `0x0203F0` each answered with sixteen `0xFF`
    bytes, while Read Configuration in the same session returned
    `00 00 04 0f` — so those four bytes exist and hold values, and the generic
    read simply does not surface them. The read path was working: a Read
    Memory at `0x030800` in the same run came back with real preset data.

    Two consequences, and the second is the one that bites. The undocumented
    1019 bytes cannot be inspected from here at all. And Clock Source, which
    Read Configuration does not return (#2), cannot be recovered by reading
    its documented address `0x020004` either — so it is genuinely unreadable
    over MIDI, and a Write Configuration assembled from a read is genuinely
    blind in that field rather than merely inconvenient. The front panel's
    CLK/MPE page (manual p.17) is the only place to read it.

31. **Read Autotuning Status does not answer in the documented shape, and the
    shipped decoder rejects what it does answer.** Page 22 gives the response
    as `F0` + an on/off byte + seven voice bytes + `F7`, ten bytes, with each
    voice carrying a progress value from `0x00` to `0x0F`, and prints
    `F0 00 0F 0F 0F 0F 0F 0F 0F F7` as the example. Measured 2026-08-30 on
    serial #361 over USB, an idle instrument answers
    **`F0 00 04 FC 00 00 7B F7`, followed by a lone `F7`** — byte-identical on
    every send, across three processes and two MIDI backends. See
    `fixtures/untried-read-commands.wire`.

    Three things are wrong with it against the page. It is **eight bytes, not
    ten**, so there are six data bytes where eight are documented. It carries
    **`0xFC`**, which is not a legal SysEx data byte at all — CoreMIDI
    delivers it in a packet of its own, being a System Real Time Stop status,
    while RtMidi's reassembler leaves it inline; a client will see it in one
    place or the other, and neither is a value in `0x00`-`0x0F`. And a
    **second `F7`** arrives about half a millisecond after the terminator,
    which reassembles as a frame with nothing in it or desynchronises whatever
    reads next, depending on where a session starts.

    `decodeAutotuningStatusResponse` throws `SysExPayloadLengthError` on it —
    "payload of 6 bytes is invalid, expected 8" — so the editor cannot read
    autotuning status from this instrument today. **Nothing yet says which
    side is wrong.** The readings were all taken with autotuning idle, and
    nobody has watched the frame while a run is in progress; a firmware whose
    answer differs from its own documentation and a shape that only makes
    sense mid-run are both open. Whether the response is meant to be nibble
    packed like memory data (`00 04` would then be `0x40`) is likewise
    unasked.
