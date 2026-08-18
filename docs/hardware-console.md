# Hardware console

A dev-only page that logs every byte crossing the wire to a connected e7, as
it arrives, for as long as the page is open, and sends the commands and
control changes the editor will not. Where `docs/hardware-smoke-test.md`
covers one fixed nine-command script that ends when the script does, this log
belongs to no particular request: it starts when you connect and keeps running
while you play the instrument, turn its knobs, or drive it from something
else.

Watching is safe; sending is not. The **Send** section can overwrite a preset,
leave a slot locked, or replace every unlocked preset with the default one,
and the instrument has no undo for any of it. The section is split in two for
that reason — see [Sending](#sending) below.

## Running it

```bash
bun run dev
```

Then open <http://localhost:5173/hardware-console.html> in Chrome, Edge, Opera,
or Firefox 108+, click **Enable Web MIDI**, and grant the permission prompt.
Web MIDI with system exclusive access always requires an explicit human grant,
so this page cannot be driven by an automated browser — the prompt has to be
accepted by hand.

Pick the e7's input and output ports (the first port whose name contains "e7"
is preselected) and click **Connect**. **Pause** freezes the view without
stopping the recording, so a burst can be read while it is still arriving;
**Clear** empties the log and resets the drop count. The send controls stay
disabled until there is a connection to send on.

The page is served by the dev server only; it is not part of `bun run build`
output.

## Reading the log

Illustrating the shape only — these are not bytes any run produced:

```
input            <input port>
output           <output port>
events           412 kept of 2000 max, 0 dropped
fragmented       0
discarded        0
pending bytes    0

     1  -->        +0.0ms  command read-memory                             F0 00 21 62 01 10 0E 00 00 00 F7
     2  <--       +14.6ms  unparsed (14.6ms after read-memory)             F0 0F F7
     3  <--       +16.1ms  response memory-data (16.1ms after read-memory) F0 0F 04 00 07 05 06 0E 06 F7
     4  <--      +812.4ms  ch1 CC 74 = 96 filterCutoff                     B0 4A 60
     5  <--      +812.9ms  ch1 CC 2 = 99 unmapped                          B0 02 63
```

Each line is a sequence number, a direction arrow, the time in milliseconds
since the connection was opened, what the app made of the event, and the raw
bytes. `-->` is a send from this page, `<--` is something that arrived. The
reading never replaces the bytes — a decode that is wrong is visible next to
the evidence rather than in place of it, which is the point of the page.

An inbound frame that arrives within a second of a send is annotated with the
command it followed and how long it took. That pairing is positional and
nothing more: responses carry nothing that identifies the command they answer
(`protocol-quirks.md` #3), so a frame is named after the last command sent
rather than matched to it. Both frames above are attributed to the same Read
Memory for exactly that reason, which is what makes the preview frame of
`protocol-quirks.md` #12 legible here — two frames, one command, 1.5ms apart.
A frame arriving more than a second after the last send is left unattributed,
the same second `requestResponse` waits before giving up.

The four readings a line can carry:

- **`command <kind>`** — the frame carries the 5-byte manufacturer header, so
  it decodes as a command rather than a response. An *inbound* one is a
  command coming back, which is what Soft Thru does; see `protocol-quirks.md`
  #12, explanation 2, where an echo of this shape is one of the three things
  the "preview frame" could have been.
- **`response <kinds>`** — the frame decodes as at least one documented
  response. Often several, and the line names all of them: responses omit the
  manufacturer header (`protocol-quirks.md` #3), so a bare-data frame carries
  nothing that says which command it answers. `memory-data` in particular
  accepts any even-length nibble payload, so it appears beside most other
  readings. Without the request that drew it, the page cannot narrow this
  further, and it does not pretend to.
- **`unparsed`** — the frame decodes as no documented response at all. It is
  kept and shown, not dropped. The malformed preview frame of
  `protocol-quirks.md` #12 reads this way.
- **`ch<n> CC <number> = <value> <fields>`** — a control change, with the
  channel it travelled on (the device's own Transmit Channel is configurable,
  so an inbound one is not always channel 1), the controller number, the
  value, and the preset fields the CC map binds that controller to. A
  controller the map has no field for is logged all the same, marked
  `unmapped`. This is the difference from the editor's live path, which reads
  an inbound CC as a field move and has nothing to say about a controller it
  doesn't recognise.

`fragmented`, `discarded` and `pending bytes` are the SysEx reassembler's own
counters, shown live: the same three numbers the smoke test prints, and what
`protocol-quirks.md` #16 is waiting on. Bytes left pending while nothing
arrives is the bad case that entry describes.

## Sending

The **Send** section is the half the editor cannot do. Nothing it offers is
filtered by what the app believes about the device: a control change goes out
on the controller, value and channel typed into it, and every command the
protocol layer can encode can be built there. Its correctness is that the
bytes on the wire are the bytes asked for, not that the request was sensible.

The controls are in two groups, and the split is the safety story — there is
no confirmation dialog, because one that appeared on every send would be
clicked through:

- **Commands that read** — Read Serial Number, Read Memory, Read
  Configuration, Read Autotuning Status. These change nothing.
- **Commands that change the instrument — no undo** — Write Memory, Write
  Configuration, Lock Preset, Unlock Preset, Initialize preset, All LEDs ON,
  Factory Reset. Write Memory at a preset address overwrites that preset;
  Lock leaves a slot locked; Factory Reset replaces every unlocked preset.
  Each one says what it does above the fields it takes.

Control changes are their own control, above both groups. They are the reason
the section exists: the editor sends only controllers a preset field maps to,
and refuses outright any whose `ccDirection` is `inbound-only` — which is
exactly CC 71, the controller `protocol-quirks.md` #13 is unverified about.
The console sends it. Control changes from here also bypass the outbound rate
limiter, so what the log records is what went out, at the moment it went out.

Addresses and data bytes are typed as hex (`01FE00`, or `0x01FE00`; data as
space-separated byte pairs, `4F 10 00`, the same form the log prints, so a
line can be pasted back). Lock and Unlock take a bank, group and slot rather
than an address, and compute the lock byte's address themselves.

Nothing is clamped or corrected on the way out. An address past the top of the
21-bit space, a preset slot outside the instrument's eight banks, a
configuration byte that is not a 7-bit value, a controller or CC value past
127 — each is refused, nothing is sent, and the protocol layer's own error is
shown by name (`SysExAddressRangeError`, `AddressComponentRangeError`,
`ControlChangeRangeError`, and so on). Text that is not hexadecimal is refused
the same way.

Every send is recorded in the log as an outbound `-->` event before anything
comes back, so one log is the whole conversation rather than two accounts of
it.

## Bounds

The log keeps the most recent 2000 events and drops the oldest past that, so a
session left open through an hour of knob-turning cannot exhaust memory. The
header says how many were dropped; the sequence numbers keep counting through
a drop, so a gap between what the header claims and the first line shown is
never silent.

Nothing is written to disk — the log lives in the page and a reload loses it.
