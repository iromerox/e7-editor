# Architecture

Single TypeScript package, one Vite/SolidJS app. Module boundaries are
folders under `src/`, not separate packages — the one-directional dependency
graph below is enforced by `dependency-cruiser` in CI rather than by package
manifests.

```
src/
  protocol/   pure logic, zero I/O — may not import midi/store/app
  midi/       webmidi wrapper — may import protocol only
  store/      RxDB-backed local library — may import protocol only
  app/        SolidJS UI — may import protocol, midi, store
```

## `src/protocol`

Encodes the e7's MIDI spec as TS types and pure functions: memory-map
addressing, CC number constants and typed enums (zone-table decoding), the
128-byte single-preset layout and 512-byte multi-preset layout, SysEx
message framing (nibble pack/unpack, header rules), configuration EEPROM
shape, program-change → slot mapping, MPE configuration message, and the
bidirectional CC↔preset-field map. No MIDI I/O, no browser APIs — testable
in complete isolation against fixture data transcribed from the printed
spec.

## `src/midi`

Thin `webmidi` wrapper: port enumeration/resolution (by index, exact name, or
unique substring), a `Connection` exposing two independent streams — SysEx
frames (for request/response) and raw CC events (for live forwarding), plus
a non-exclusive monitor stream mirroring every SysEx frame for logging — and
a `requestResponse(command, timeout)` helper that tolerates the device's
undocumented preview frame before real responses (see
`protocol-quirks.md`, #12). Outbound CC is rate-limited/coalesced to avoid
flooding the device during a knob drag. Inbound SysEx passes through a
reassembly guard that buffers until a complete `F0...F7` frame is on hand —
defensive only: whether any browser actually fragments a frame is unverified
(see `protocol-quirks.md`, #16), so don't build further on it until the
hardware smoke test says it happens — `docs/hardware-smoke-test.md` covers
running that test against a real device.

No worker-thread isolation: the browser's event loop is already
non-blocking around MIDI I/O, so a dedicated worker thread for the
transport layer isn't necessary. Revisit only if profiling shows a specific
operation (e.g. decoding a large bulk read) causing UI jank.

## `src/store`

RxDB-backed local preset library (IndexedDB via the Dexie storage plugin):
schema for library entries (kind, name, originating slot, capture metadata,
tags, hash, raw SysEx bytes, decoded snapshot), a `.syx` codec that
classifies file contents by parsing frame addresses (never by filename), and
JSON-dump backup/restore via `RxDBJsonDumpPlugin`. RxDB's reactive queries
drive UI updates directly — no filesystem watcher needed, since there's no
filesystem to watch in the browser.

## `src/app`

SolidJS UI: connection bar, library browser, device browser (bank → group →
slot), the editor view (per-section panels mirroring the physical front
panel layout), and bulk-operation progress UI. State is a single Solid
`createStore` (connection, ports, library query, slot cache, editor state,
undo/redo) — Solid's fine-grained reactivity is sufficient, no external
state library needed.

## Sync model

Library is canonical for organization and persistence. Device is canonical
for "the sound I'm hearing right now." Sync is always explicit and
user-initiated — no background sync, no merge semantics: load-to-device and
save-from-device are distinct actions, live edits write through to the
device immediately without touching the library, and hardware knob movement
updates the editor view without auto-saving.
