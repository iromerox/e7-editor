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
  command coming back, which is what Soft Thru does. `protocol-quirks.md` #12
  once had an echo of this shape as a candidate for the "preview frame" and
  ruled it out: serial 361 replicates no inbound USB SysEx to its USB output,
  Soft Thru byte notwithstanding.
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
and refuses any whose `ccDirection` is `inbound-only`, while the console
sends whatever number is typed. That is how CC 71 was settled — the editor
would not send it precisely because it was marked inbound-only, which is the
flag the test existed to check (`protocol-quirks.md` #13). Control changes
from here also bypass the outbound rate limiter, so what the log records is
what went out, at the moment it went out.

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

## Repeating a send

One send at a time answers most questions; some need many. The **Repeat**
control at the foot of the Send section sends whatever is staged above it —
the chosen command, or the control change — over and over, either at the
interval typed beside it or, at `0`, all of them back to back with nothing
waiting for an answer. That second form is the point of the control: it is
the only way to ask whether the device will accept a new command while it is
still preparing a response to the last (`protocol-quirks.md` #19), which
`requestResponse` cannot do because it waits.

A finished run prints a report of its own, under the controls. Illustrating
the shape only — these are not numbers any run produced:

```
sends            200 of 200, back to back, none of them awaiting the answer to the last
answers          198 received, 0 out of order, 2 missing, 1 answering nothing outstanding
round trip       min 15.7ms   median 16.0ms   max 31.4ms
pairing          198 paired in arrival order — nothing in these answers names the request they answer, so a reordering among those 198 cannot be seen
first fault      send 41 came back not at all
elapsed          3204.5ms
rate limit       sends bypass it — MIN_CC_INTERVAL_MS (5ms) does not apply
```

An answer counted **out of order** is also counted among the received, so
`received` is every send that got an answer at all. Round trips are a spread
rather than a figure because the question a repeat asks is usually whether the
figure holds: a median matching the smoke test's ~16ms beside a maximum three
times it says something a single average would have hidden. **first fault**
names the first send that went unanswered or came back out of turn, which is
the depth the run is really being asked for.

**What the pairing line is admitting.** An answer carries nothing that says
which command it answers (`protocol-quirks.md` #3), so the run pairs answers
with requests two different ways and says which it used:

- **Named by their own bytes** — a Write Memory is echoed back as exactly the
  bytes it wrote, so an answer identifies its request outright, and an
  answer arriving before the one sent ahead of it is reported as out of
  order. This holds only while the *data* differs from send to send: the echo
  carries the data and not the address (spec p.15), so repeating one write —
  even to a walked address — produces echoes that are all the same bytes,
  which name nothing.
- **Paired in arrival order** — everything else, reads included. The first
  answer is attributed to the first request, and a reordering among them
  cannot be seen at all. The report says how many were paired this way rather
  than presenting the pairing as a match.

**Stepping the address.** A command that takes an address gets a third field:
how far to move the address on each repeat. At `0` the same address is read
two hundred times, which is a strange thing to measure — every answer is
identical, so nothing about the run could ever look wrong. At `16` the run
walks consecutive memory blocks, which is the read a full backup makes and
the one whose throughput is worth knowing. It does not make the answers
identifiable — see the pairing note above — but it does make a reordering
*visible* in the log, since consecutive blocks of a real preset differ from
each other where two reads of one block do not. Read the log rather than the
summary when that is the question being asked, and keep the depth small
enough to read: pipelining fails at 2 or 4 long before it fails at 200.

A stepped **Write Memory** writes to every address it walks, which is a much
larger footprint than repeating one write. The step is capped at 128 bytes,
one preset's worth, and a walk that would run past the top of the 21-bit
address space is refused with the protocol layer's own error before anything
goes out.

An answer counted as **answering nothing outstanding** is a frame that
arrived while the run was going but fits no request still waiting — the
malformed preview frame of `protocol-quirks.md` #12 is one, and so is a
command frame echoed back by Soft Thru. It is counted rather than attributed,
which is what stops a preview frame from being timed as though it were a
response.

**The rate limiter does not apply.** Sends from this page go out past it, the
same as every other send here, so an interval below `MIN_CC_INTERVAL_MS`
(5ms) is delivered as typed rather than coalesced. That is deliberate: a page
whose job is to question the constant cannot be subject to it. The question
it was built for has since been answered — the device kept up with a
sustained drag at every interval down to 1ms and landed on the right value
each time, so 5 stays, and `protocol-quirks.md` #20 carries the measurement —
but the bypass is what any later question about the rate would need too.
Every report says so on its last line.

**Stop** halts the sending; the answers already owed are still waited out, up
to the same second `requestResponse` waits, so what a stopped run reports is
what it measured rather than an estimate. Sends never reached are reported as
not sent, and are not confused with sends the device failed to answer.

Two cautions:

- A repeat that carries a control change **writes to the instrument once per
  repeat**, and leaves the parameter wherever the last one put it. A
  pipelined read is read-only, however deep it goes.
- A long run fills the log with its own sends. The log holds 2000 events
  (see Bounds), so a run of 2000 read commands and their answers pushes
  everything before it out, including the sends from the beginning of the
  same run. Save the capture you care about before starting one.

Repeats are capped at 8192 — a full pass over preset memory, 16 bytes at a
time — the interval at 10 seconds, and the step at 128 bytes; the buttons stay
disabled while any of the three holds something else.

## Saving a capture

The **Capture** section writes what the log is showing to a `.wire` file —
the fixture format `docs/hardware-fixtures.md` describes, read back by
`parseWireLog` — through the same file dialog the library's export and backup
go through. What is saved is what is on screen: while the view is paused, the
paused log is the one written, not the traffic that arrived behind it.

Its five fields are the file's header, and they are filled in *before* the
save rather than corrected afterwards, because provenance is the half of a
capture that cannot be recovered from the bytes:

- **Device** and **Session** are typed by whoever is at the instrument.
  "serial 361, USB" and "sweeping Filter Cutoff by hand" are what make a file
  worth reading a year later; "e7" and "testing" are not.
- **Input** and **Output** fill themselves in from the ports on connect, and
  stay editable — a capture kept after disconnecting still names the ports it
  was taken on.
- **Date** opens on today, from the local clock rather than UTC, so a session
  running past midnight in one time zone is not filed under the next day in
  another.

The file is suggested as the date and the session note slugged —
`2026-08-18-sweeping-filter-cutoff-by-hand.wire` — so six captures from one
afternoon are told apart by what they were, not by an ordinal.

Two saves are refused rather than written:

- An empty log. A capture with no events in it is a file that its own loader
  rejects, and the refusal says so before any dialog opens.
- A header with a field left blank. All five are required by the format; the
  refusal names the ones still missing.

A dismissed dialog is reported as nothing written, the same way the library
reports a cancelled export, and the log is untouched either way — saving
neither clears it nor pauses it.

If the log has dropped events (see Bounds below), the file records that as a
comment above the first event, so a truncated capture cannot be read later as
a whole one.

## Bounds

The log keeps the most recent 2000 events and drops the oldest past that, so a
session left open through an hour of knob-turning cannot exhaust memory. The
header says how many were dropped; the sequence numbers keep counting through
a drop, so a gap between what the header claims and the first line shown is
never silent.

A reload loses the log: nothing is kept in the page beyond the session, which
is what **Save capture** above is for.
