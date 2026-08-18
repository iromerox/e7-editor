# Hardware console

A dev-only page that logs every byte a connected e7 sends, as it arrives, for
as long as the page is open. Where `docs/hardware-smoke-test.md` covers one
fixed nine-command script that ends when the script does, this log belongs to
no particular request: it starts when you connect and keeps running while you
play the instrument, turn its knobs, or drive it from something else.

It is read-only. The page never sends, so it is safe to leave open against an
instrument holding presets you care about.

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
**Clear** empties the log and resets the drop count.

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

     1  <--        +0.0ms  command read-memory               F0 00 21 62 01 10 0E 00 00 00 F7
     2  <--       +14.6ms  unparsed                          F0 0F F7
     3  <--       +16.1ms  response memory-data              F0 0F 04 00 07 05 06 0E 06 F7
     4  <--      +812.4ms  ch1 CC 74 = 96 filterCutoff       B0 4A 60
     5  <--      +812.9ms  ch1 CC 2 = 99 unmapped            B0 02 63
```

Each line is a sequence number, a direction arrow, the arrival time in
milliseconds since the connection was opened, what the app made of the event,
and the raw bytes. Every arrow on this page is `<--`: the page never sends, so
everything it logs arrived. The log records direction because the module
underneath it takes outbound events too, and the arrow is what tells them
apart once something writes them. The reading never replaces the bytes — a decode that is wrong
is visible next to the evidence rather than in place of it, which is the point
of the page.

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
  channel it arrived on (the device's own Transmit Channel is configurable, so
  this is not always 1), the controller number, the value, and the preset
  fields the CC map binds that controller to. A controller the map has no
  field for is logged all the same, marked `unmapped`. This is the difference
  from the editor's live path, which reads an inbound CC as a field move and
  has nothing to say about a controller it doesn't recognise.

`fragmented`, `discarded` and `pending bytes` are the SysEx reassembler's own
counters, shown live: the same three numbers the smoke test prints, and what
`protocol-quirks.md` #16 is waiting on. Bytes left pending while nothing
arrives is the bad case that entry describes.

## Bounds

The log keeps the most recent 2000 events and drops the oldest past that, so a
session left open through an hour of knob-turning cannot exhaust memory. The
header says how many were dropped; the sequence numbers keep counting through
a drop, so a gap between what the header claims and the first line shown is
never silent.

Nothing is written to disk — the log lives in the page and a reload loses it.
