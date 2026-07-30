# Hardware smoke test

A dev-only page that exercises the whole transport against a real e7 —
enable Web MIDI with SysEx, resolve the device's ports, read the serial
number, then read one preset as eight sequential 16-byte Read Memory calls
— and prints every byte that crossed the wire.

It is read-only. Nothing is written to the device, so it is safe to run
against an instrument holding presets you care about.

## Running it

```bash
bun run dev
```

Then open <http://localhost:5173/smoke-test.html> in Chrome, Edge, Opera, or
Firefox 108+, click **Enable Web MIDI**, and grant the permission prompt.
Web MIDI with system exclusive access always requires an explicit human
grant, so this page cannot be driven by an automated browser — the prompt
has to be accepted by hand.

Pick the e7's input and output ports (the first port whose name contains
"e7" is preselected) and click **Run smoke test**.

The page is served by the dev server only; it is not part of `bun run build`
output.

## Reading the log

Illustrating the shape only — these are not numbers any run produced:

```
input            <input port>
output           <output port>
serial number    <serial>
preset 1.1.1     "<name>"

unparsed frames  8 across 8 of 9 steps
fragmented       0
discarded        0
pending bytes    0

Read Serial Number  (3.4ms)
  --> F0 00 21 62 01 10 20 F7
  <-- +2.9ms response  F0 49 01 F7
Read Memory 0x000000  (21.7ms)
  --> F0 00 21 62 01 10 0E 00 00 00 F7
  <-- +4.1ms unparsed  F0 0F 04 00 07 05 06 0E F7
  <-- +20.3ms response  F0 0F 04 00 07 05 06 ... F7
```

Every inbound frame is timestamped from the moment its command was sent and
marked `response` or `unparsed` — `unparsed` meaning the frame did not decode
as the response that command documents.

The four counters are what the open questions in `protocol-quirks.md` are
waiting on:

- **unparsed frames** answers #12. A non-zero count against Read Memory means
  the undocumented preview frame is real in-browser, and the tolerance in
  `requestResponse` is load-bearing rather than defensive. Zero means the
  browser never surfaced it.
- **fragmented** and **pending bytes** answer #16. Both zero means no browser
  ever split a frame across message events and the reassembly guard is pure
  insurance. A run that times out with **pending bytes** above zero is the
  bad case that entry warns about: a continuation fragment carrying no status
  byte never surfaced as a `sysex` event at all, so what feeds the
  reassembler has to change, not just the reassembler.

Record what a run observed in `protocol-quirks.md` against the entry it
settles, with the raw log, and note the firmware serial number it was
observed on — these behaviors are per-firmware, not per-model.

## What the first run found

Serial #361 over USB, Brave/Chromium, reading preset 1.1.1: all four counters
zero. Nine commands, nine responses, one frame each, every one parsing as the
documented response, Read Memory answering a consistent 15.7-16.0ms after its
command.

So neither behavior the transport was built to absorb showed up in a browser:
no preview frame (#12) and no fragmentation (#16). Both guards stay — they
cost nothing and no other driver has been tried — but neither is load-bearing,
and nothing may be built on the assumption that either fires. See those two
entries for what the run does and doesn't rule out.

### What ~16ms per request costs

The latency is a fixed per-command cost, the same for a 2-byte serial
response as for a 34-byte memory response, and `requestResponse` pays it
serially. Every Read Memory call moves 16 bytes, so:

| Operation | Read Memory calls | Floor |
|---|---:|---:|
| One single preset (128 bytes) | 8 | ~0.13s |
| One group, 8 slots | 64 | ~1s |
| One bank, 64 slots | 512 | ~8.2s |
| All preset memory, `0x000000-0x01FFFF` | 8,192 | **~2min 11s** |

Those are floors, not estimates — they assume the device answers instantly
after its 16ms and the app adds nothing. Whether pipelining can beat them is
open question #19, and it wants answering before the bulk read operations are
designed against these numbers.
