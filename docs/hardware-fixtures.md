# Hardware fixtures

A wire log fixture is a committed record of bytes that crossed the wire: what
went out, what came back, and how long apart. `docs/hardware-console.md`
describes the page that watches a session; this describes the file that outlives
one, so a test can be written against traffic an instrument produced rather than
against bytes somebody typed.

Fixtures live in `fixtures/` at the repository root, one capture per file, named
`*.wire`. They are read by `parseWireLog` in `src/midi/wire-log.ts` and written
by `formatWireLog` in the same module — the console's **Capture** section is
what calls it; see `docs/hardware-console.md`.

## The format

```
e7 wire log v1
device   GS Music e7, serial 361
input    e7 MIDI 1
output   e7 MIDI 1
date     2026-08-18
session  Reading preset 1.1.1 back a block at a time

# the instrument was idle until the first send
    +0.0ms  -->  F0 00 21 62 01 10 0E 00 00 00 F7
   +14.6ms  <--  F0 0F F7
   +16.1ms  <--  F0 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 F7
```

The first line names the format and its version. Then a header of five fields,
one per line, each a key and the rest of the line as its value; then a blank
line; then one line per event. Lines beginning with `#` are comments and may
appear anywhere below the first line, including between events, which is where
an operator's note about what they were doing belongs. Leading and trailing
whitespace on a line is not significant, so the columns above are alignment and
nothing more.

The header fields are all required:

| Field | What it holds |
|---|---|
| `device` | The instrument, specifically enough to tell two apart — serial number, firmware, whatever distinguishes it |
| `input` | The MIDI input port the capture was taken on |
| `output` | The MIDI output port sends went out of |
| `date` | The day of the session, `YYYY-MM-DD` |
| `session` | What the session was doing — the sentence a reader needs to know what they are looking at |

`input` and `output` are separate fields rather than one `port` because the
console connects to two, and a capture that names one is ambiguous about which
end it was listening to. Over USB they are usually the same name twice; over a
DIN interface they are usually not, and `protocol-quirks.md` #21 is the reason
that distinction is worth carrying.

An event line is three things: the time since the capture opened, the direction,
and the bytes.

- **Time** — `+<milliseconds>ms`, relative to the start of the capture, so the
  first event is `+0.0ms`. Elapsed time between frames is the measurement worth
  keeping — `protocol-quirks.md` #19 turns on a 16ms gap — and a wall clock in
  every line would make a diff between two sessions noisy for no gain. Times
  must not run backwards; a capture is in arrival order.
- **Direction** — `-->` for a send, `<--` for something that arrived. The same
  arrows the console prints.
- **Bytes** — space-separated two-digit hex, uppercase by convention, the same
  spelling the console prints and its send fields accept, so a line can be
  pasted from one to the other. Lowercase is read back too, since these files
  get hand-edited.

## What a fixture deliberately does not store

**No reading.** A fixture stores no decode of what a frame was. Responses omit
the manufacturer header (`protocol-quirks.md` #3), so a bare-data frame carries
nothing identifying which command drew it, and `memory-data` accepts any
even-length nibble payload — most inbound frames decode as several documented
responses at once. Storing one of them would be storing a guess, and a wrong
guess committed to a file is worse than no guess at all. The bytes are the
record; anything read off them is computed on load by the same code that reads
live traffic, which is what makes a fixture a test of that code.

**No pairing.** Which command a response answers is likewise not a field. It is
positional and stays that way: a reader computes it from the log the way
`replies` in `src/app/wire-monitor.ts` does, by looking at what was sent last.
The consequence for whoever takes a capture is that a session worth committing
is one where the sends are in the same file as the answers — a capture of
inbound frames alone cannot be fully interpreted later, by anyone.

**No frame validation.** A line is one transport event, not one MIDI message.
The loader will not check that bytes start with `F0` or end with `F7`, because
the case that most needs capturing is the one where they don't: a driver
delivering one frame in several pieces, which is what `src/midi/reassembly.ts`
exists for and what `protocol-quirks.md` #16 is waiting to see. A frame that no
decoder accepts — the preview frame of `protocol-quirks.md` #12 — is stored the
same way, as the bytes that arrived.

## Why plain text

These files are committed, and the next session's capture will be compared
against this one by eye long before it is compared by code. Line-oriented text
diffs one event per line; JSON would put an array of numbers on each line and
spend its diff on punctuation. The header is the same shape a `git log` reader
already knows how to skim, and a comment line can sit next to the frame it
explains, which is not expressible in JSON at all.

## Reading one

```ts
import { parseWireLog } from "../midi";

const capture = parseWireLog("preview-frame.wire", text);
```

`parseWireLog` takes the file's name and its text and returns a header plus a
`WireLogEvent[]` — `atMs`, `direction`, `bytes` — which is the shape the
console's own events already extend, so a loaded capture can be fed to anything
that reads live traffic. Tests get one off disk with `wireLogFixture` from
`src/test-wire-log.ts`, which takes the fixture's name without its extension.

Anything malformed throws `WireLogFormatError`, carrying the file name, the line
number and what was wrong with it — a missing or duplicated header field, a date
that is not a calendar date, a line that does not open with a time, times that
run backwards, a missing direction, a byte that is not two hex digits, a header
with no events under it. Nothing partial is returned: a capture parses whole or
not at all, because a fixture silently missing its last few events would be a
test that passes for the wrong reason.

## Writing one

`formatWireLog` takes a capture and returns the file's text, one event per
line, and takes an optional list of notes it writes as comments above the
events — which is how a log that dropped events says so in the file rather
than only on the screen it was dropped from.

Times are written to a tenth of a millisecond. A capture built from the
console's own log is snapped to the same tenth with `wireLogTime` before it is
written, so what a file says is exactly what the capture held: a saved capture
and the one read back from it are the same events, not the same events rounded.
Anything finer would be recording the timer's noise as if it were a
measurement.

## Taking one

The header is provenance, and provenance is the part that cannot be
reconstructed later. Fill it while the instrument is still plugged in, and be
exact about `device` and `session` — "serial 361, USB" and "sweeping Filter
Cutoff by hand" are what make a capture usable a year later; "e7" and "testing"
are not. The console refuses a save that leaves one of the five blank, and
names the file after the date and the session note, so what was typed there is
what a directory listing shows.

Fixtures written by hand — because the case is one no instrument here has
produced — sit in the same directory and are told apart by their header saying
so. `device: none - hand-written` and a `session` line naming what the bytes
were transcribed from is the honest form; nothing else marks a file as
synthetic, and a hand-written capture that claims a serial number is
indistinguishable from a measurement.

Eight are committed today. Two are hand-written:

- `fixtures/fragmented-frame.wire` — one frame delivered in three pieces, the
  bytes `src/midi/reassembly.test.ts` used to build inline.
- `fixtures/preview-frame.wire` — the two-frame answer to one Read Memory that
  `protocol-quirks.md` #12 describes, with the response data zeroed so nothing
  in it can be mistaken for a measurement. Kept as the shape the entry was
  written from, not as evidence for it; the two captures below are what the
  instrument actually did.

Six came off serial 361:

- `fixtures/read-memory-clean.wire` — preset 1.1.1 read a block at a time, one
  frame per command and every frame a documented response. The normal case, and
  what `protocol-quirks.md` #12 now rests on.
- `fixtures/stale-frame-tail.wire` — one Read Memory drawing two frames, the
  first of them short and undecodable, on a session that opened while an
  earlier one's answer was still pending. #12's shape with no device behavior
  behind it.
- `fixtures/lfo-clock-rate-zones.wire` and `fixtures/delay-clock-rate-zones.wire`
  — each knob turned by hand across its whole travel, twice, while the value was
  read back a block at a time. These are what `protocol-quirks.md` #20 rests on,
  and they are the first captures here whose point is not in the bytes: the
  divisions were read off the instrument's display by eye, so the header notes
  carry the readings and the frames only carry where the knob was. A capture
  whose meaning lives in its comments is unusual enough to say out loud —
  nothing loads those notes, and no test can check them.
- `fixtures/withheld-frame-tail.wire` — one Read Memory answer stalling
  twenty-four bytes into its thirty-four, packet by packet as a raw CoreMIDI
  client sees it. `protocol-quirks.md` #24 rests on it.
- `fixtures/untried-read-commands.wire` — Read Autotuning Status, a Write
  Memory echo and a Lock/Unlock echo, each sent alone and repeated: the three
  commands `protocol-quirks.md` #15 had never seen a frame from. It is also
  where #24 stopped reproducing, since every command in it answered its own
  send with nothing held back.

All were taken from Node over CoreMIDI rather than through the console, which
their `device` line says, because a browser that will not grant SysEx has no way
to reach the instrument. They were written by `formatWireLog` all the same, so
what is committed is the same shape the console saves.
