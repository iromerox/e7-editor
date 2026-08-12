# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Initial repository scaffolding: single-package TypeScript/Vite/SolidJS
  project, Biome, Vitest, `dependency-cruiser` layering checks, CI workflow.
- `src/protocol/address.ts`: `PresetSlot` and `MultiSlot` memory addressing
  with region constants for preset/configuration/volatile memory.
- `src/protocol/cc.ts`: MIDI CC number constants for every parameter in the
  spec's CC table, and a shared `decodeZoned` helper for the zoned/breakpoint
  CC enums.
- `src/protocol/enums.ts`: `OscShape`, `OscSync`, `LfoShape`, `Lfo3Shape`,
  `LfoMode`, `DelayType`, `ChorusType`, and `OtherMode` enums with `fromCc`/
  `toCc` pairs, plus an `encodeZoned` helper in `cc.ts` to support the
  reverse direction. `OtherMode` rejects the CC 80-127 reserved range with a
  typed error.
- `src/protocol/transpose.ts`: `Transpose` 49-band CC lookup (-24..+24
  semitones).
- `src/protocol/tune.ts`: `Tune`, storing integer millisemitones with a
  `.semitones()` float accessor; CC 63/64 both decode to 0 and canonically
  re-encode to 63.
- `src/protocol/lfo-clock-rate.ts` and `src/protocol/delay-clock-rate.ts`:
  `LfoClockRate` and `DelayClockRate`, separate 15-division musical-rate
  types with different hardware-captured byte layouts despite sharing
  division names.
- `src/protocol/voices.ts`: `Voices`, packing V1/V2 as `16*V1 + V2` on CC 97
  with real read/write accessors. Rejects CC 72-127 and any low-range CC
  whose V2 nibble falls outside 0-7 as reserved.
- `src/protocol/cc.ts`: `FILTER_RESONANCE` (CC 71) constant and a `ccDirection`
  helper marking it inbound-only, so the upcoming CC↔field map can reject
  outbound writes to CCs known not to accept them.
- `src/protocol/preset.ts`: `SinglePreset` (128 bytes) and `MultiPreset`
  (four contiguous parts of 128) byte layouts, decoding and re-encoding every
  byte position verbatim — including the ones the spec leaves unused, which
  are never clobbered on encode. Fields the device reads only from part 1 of
  a multi (name, delay, chorus, stereo, lock) and fields only used when the
  preset is part of a multi (keyboard/velocity zones, MIDI channel and
  filter) are grouped separately from the always-active ones.
- `src/protocol/nibble.ts`: `pack`/`unpack` for the 4-bit-per-byte payload
  form SysEx data travels in, rejecting odd-length payloads and nibbles with
  high bits set with typed errors.
- `src/protocol/sysex.ts`: the `SysExMessage` union covering every documented
  command (All LEDs ON, Read Serial Number, Read/Write Memory, Factory Reset,
  Read/Write Configuration, Initialize preset, Read Autotuning Status) with
  encoding, decoding, and 21-bit address splitting. Commands carry the 5-byte
  manufacturer header; response parsing takes bare data, matching what the
  device actually sends. Lock/Unlock Preset helpers write 0 to unlock and 1
  to lock, per the byte-map text rather than the inverted example labels.
- `src/protocol/config.ts`: `intoConfiguration`, bridging a 4-field Read
  Configuration response into the full 6-field Write Configuration payload
  by supplying the two values Read never returns (Clock Source, MPE Enable).
- `src/protocol/program-change.ts`: Bank Select MSB/LSB + Program Change
  resolution to a preset or multi slot, and the reverse encoding, matching
  the spec's single (Bank MSB 0) and multi (Bank MSB 1) addressing.
- `src/protocol/mpe.ts`: `encodeMcm`/`decodeMcm` for the 9-byte MPE
  Configuration Message (RPN 0x0006 on channel 1), enabling with 1-15
  channels or disabling with 0.
- `src/protocol/cc-map.ts`: bidirectional map between CC numbers and the
  `SinglePreset` fields they drive — `ccToFields`, `fieldToCc`, `readField`,
  `writeField`, and an `applyCc` that returns the updated preset without
  mutating the original. Every mapped field has a real accessor pair,
  including the packed Voices CC 97 that unpacks into the Poly Voice and
  Mono Voice bytes. Performance-only CCs (Mod Wheel, Volume, Hold) and
  LFO2 EG1 Mod (CC 67, which has no preset byte) are deliberately unmapped.
  CC 3 resolves to both `osc1Transpose` and `transpose` and `applyCc`
  reports it as ambiguous rather than guessing, pending a hardware test.
- `src/midi/ports.ts`: MIDI input/output enumeration, each port reported with
  its name and the identifier the browser assigns it for the session, plus
  `resolvePort` for turning a user-supplied specifier into a port — `#N` by
  listing position, then exact name, then a unique case-insensitive
  substring. A substring matching several ports is reported as ambiguous,
  naming the candidates, instead of silently picking one.
- `src/midi/errors.ts`: typed error hierarchy for the MIDI transport
  (`MidiError` base class with a `code` discriminant per failure mode),
  mirroring the protocol layer's.
- `src/midi/connection.ts`: a `Connection` binding an input/output port pair
  and exposing incoming traffic as two independent streams — complete SysEx
  frames and raw CC events (channel, controller, value, timestamp) — so
  request/response traffic and live control forwarding never block or drop
  each other. The SysEx stream admits a single consumer at a time, keeping a
  pending request the sole owner of the frames it is waiting for, while the
  CC stream fans out to every listener. `close()` and an unplugged device
  tear down identically: both streams complete, port listeners are removed,
  and further sends raise a typed closed-connection error rather than
  writing to a dead port. `openConnection()` resolves a pair of port
  specifiers, requesting system exclusive access if Web MIDI is not enabled
  yet and refusing to connect without it.
- `src/midi/request-response.ts`: `requestResponse(connection, command,
  timeout)`, which sends a command and resolves with the decoded response the
  device documents for it. Frames that don't parse as that response — such as
  the short malformed preview frame the device sends ahead of a real Read
  Memory response — are ignored and waited past, so only a genuinely silent
  device produces a failure: a typed timeout error reporting how many frames
  were ignored. The command sent decides the response type the caller gets
  back, and the four commands with no documented response (All LEDs ON,
  Factory Reset, Initialize Preset, Write Configuration) are rejected at
  compile time and raise a typed error at runtime instead of timing out.
- `src/midi/cc-rate-limit.ts`: outbound control changes are capped at 200 Hz
  (5 ms) per channel and controller, so a knob drag can't outrun the device.
  Updates arriving inside that window are coalesced, and only the latest one
  ships when the window opens — the value the user lands on always reaches
  the wire. Values for different channel/controller pairs never coalesce
  against each other, and a lone control change goes out on the spot rather
  than waiting out an interval. `Connection.sendControlChange(channel,
  controller, value)` sends through it, and closing the connection drops any
  value still held back instead of writing to a dead port.
- `src/midi/reassembly.ts`: incoming SysEx is buffered until a complete
  `F0...F7` frame is on hand, so a driver that splits a frame across message
  events can't hand a caller a truncated one, and two frames arriving in a
  single event are delivered as two. An `F0` arriving before the open frame
  closes drops the partial buffer and starts over rather than splicing the
  two together. `Connection.reassembly` reports how many frames arrived
  fragmented and how many partials were discarded, so the hardware smoke
  test can record whether browsers fragment at all.
- Hardware smoke test page, served by the dev server at `/smoke-test.html`
  and left out of the production build. Against a connected e7 it enables
  Web MIDI with system exclusive access, resolves the device's ports, reads
  the serial number, and reads a preset as eight sequential 16-byte Read
  Memory calls, decoding its name. It is read-only — nothing is written to
  the instrument. Every frame that crossed the wire is logged as pasteable
  hex, timestamped from the moment its command went out and marked as either
  the documented response or an unparsed frame, alongside the reassembly
  counters — so a run answers, with evidence, whether the device's
  undocumented preview frame and SysEx fragmentation actually reach a
  browser.
- `Connection.sysexMonitor`, a non-exclusive stream mirroring every complete
  inbound SysEx frame. Logging and diagnostics can watch the traffic without
  taking the single consumer slot on `Connection.sysex` that a pending
  request needs.
- `enableMidi()`, requesting Web MIDI with system exclusive access and
  refusing anything less, so ports can be listed before a connection is
  opened. `openConnection()` now goes through it rather than enabling
  inline.
- `src/store/schema.ts`: the library entry collection schema — what the
  entry is (Single, Multi, Group, Bank, MultiPack or Backup), its name, the
  bank/group/slot it originated from when it has one, when it was captured
  and how (device dump, user import or edit), tags, comment, SHA-256
  hash, the raw SysEx bytes as base64, and a JSON-safe snapshot of the
  decoded preset. Entries carry a generated primary key rather than being
  keyed by content or slot, so the same sound can be stored more than once.
- `src/store/database.ts`: `createLibraryDatabase()`, opening the library on
  IndexedDB through RxDB's Dexie storage. Schema evolution goes through
  RxDB's own `version` + `migrationStrategies`; a version 0 → 1 strategy is
  in place and tested against a database written under the old schema, so
  the migration path is proven before a real schema change needs it.
- `src/store/syx-codec.ts`: `.syx` file contents are parsed into 16-byte
  write-memory blocks and classified purely by the addresses they write —
  Single, Multi, Group, Bank, Backup, or MultiPack for any other set of whole
  presets — never by filename or extension. The result carries the decoded
  presets and their bank/group/slot, so an entry can be stored without
  parsing the file a second time.
- `src/store/errors.ts`: a typed `StoreError` hierarchy for library-side
  failures, so a file with a `.syx` extension holding anything other than
  writes to preset memory — another manufacturer's SysEx, a non-write-memory
  command, an address outside preset memory, a duplicated or partly written
  preset — is rejected with a specific error rather than misclassified.
- `src/store/backup.ts`: `exportLibrary()`/`importLibrary()`, whole-library
  backup and restore over RxDB's JSON dump. The dump travels inside an
  envelope stamped with a format marker, a backup format version, the entry
  schema version and the capture time, so a file written by a newer build is
  refused with a version error naming the marker that disagrees, rather than
  failing on RxDB's opaque schema hash or importing half-understood
  documents. Restore is empty-library-only: importing into a library that
  already holds entries is rejected outright — no merge, no overwrite, no
  partially applied dump — and every entry is validated before a single
  document is written, since RxDB's import bypasses schema validation on its
  way to storage. Exporting a library and importing it into a fresh database
  reproduces every entry unchanged, raw SysEx base64 and decoded snapshot
  included.
- `src/store/import-export.ts`: `.syx` files move between disk and the
  library — `importSyxFromDisk()` reads one or more files through the File
  System Access picker where the browser has one and a hidden file input
  where it doesn't, and `exportEntryToDisk()` writes an entry back out
  through the save picker or, failing that, an object-URL download. A file
  from disk is untrusted input, so its size and F0/F7 framing are validated
  at the boundary before its bytes reach the `.syx` codec: anything that is
  not readable SysEx — a text file, something larger than a whole-instrument
  backup, or well-framed SysEx that writes nothing to preset memory — is
  rejected with a typed error and never reaches the library. An imported
  entry takes its name from the preset bytes for a single or multi and from
  the file name otherwise, carries whichever of bank/group/slot its
  classification pins down, and stores the file verbatim, so exporting it
  again writes back a byte-identical `.syx`.
- `src/store/queries.ts`: the library's reactive views — the whole library,
  one kind, one bank and group, a single entry by id, and the entry count —
  each an observable of plain typed entry data that re-emits on every insert,
  edit and delete, so a pane subscribes once and never asks for a refresh.
  The by-kind view resolves through the declared kind index and answers a
  synthetic 500-entry library measurably faster than reading the collection
  and filtering it. Bank-and-group filtering deliberately does not use an
  index: Dexie storage cannot index an optional field, and an entry captured
  from no slot has no bank or group to index.
- `src/app/theme.ts`: the hardware finish theme — panel tone (blue or black),
  LED color (white or red) and cap color (white or black) as three
  independent axes, each of the eight combinations deriving the full set of
  CSS custom properties the panel replica is drawn from: panel and section
  background, silkscreen and label colors, LED on/off/halo, cap top and
  bottom, knob notch, and the modified-vs-library dot. Defaults to the blue
  panel with white LEDs and white caps, matching the most common shipped
  configuration.
- `src/app/ThemeProvider.tsx`: the app shell now mounts inside a theme root
  that publishes those custom properties to everything below it and repaints
  the moment a finish axis changes, with a selector for the three axes in the
  shell header.
- `src/app/ConnectionBar.tsx`: the shell's connection bar — input and output
  port pickers, connect and disconnect, and the serial number the device
  answers with once connected, read over the connection rather than assumed.
  System exclusive access is requested from the bar on demand instead of at
  page load. The port lists follow the browser's port-change notifications, so
  plugging or unplugging a device updates them with no manual refresh, and a
  selection whose port went away is dropped and named rather than quietly
  pointed at another device. A connect that fails — a port gone between
  selection and connect, a device that never answers the serial number read —
  says so and leaves nothing half-open, and unplugging a connected device
  returns the bar to its disconnected state instead of leaving a stale serial
  number on screen. `src/midi/ports.ts` gained `listPorts()` and
  `watchPorts()` to back it.
- `src/app/LibraryPane.tsx`: the shell's library browser — every stored entry
  with its name, kind, tags and the bank/group/slot it was captured from,
  narrowable to one kind at a time through the store's indexed by-kind query.
  The list follows the library itself, so an entry imported or removed while
  the pane is open appears or disappears with no manual refresh, filter still
  applied. A library with nothing in it says so and says how to fill it, a
  filter that matched nothing says that instead, and neither is confused with
  the library still being read. The library database is opened once at the app
  entry point and handed to the shell.
- `src/app/DevicePane.tsx`: the shell's device browser — Single/Multi tabs over
  a bank row, a group row and a grid of the eight slots they hold, with eight
  banks for singles and the two the multi range reaches. Each slot has a Read
  button that fetches its name and lock state from the device and caches them,
  so a read started on one slot keeps filling in while navigation moves to
  another bank or group, and a slot already read shows its name again without
  a second trip to the hardware. Locked slots are marked as such and drawn
  apart from unlocked ones. Reads are queued one at a time, since the SysEx
  stream takes a single consumer, and a slot the device never answers for
  reports the failure in place while the rest stay readable. With no device
  connected the grid still navigates and says what a connection would add.
  `src/app/device-slots.ts` backs it, resolving a slot to its memory address
  and reading only the three 16-byte blocks the name and lock byte fall in.
  The connection bar now reports the connection it opens or drops, so the
  shell can hand it to the device pane.
- `src/app/app-state.ts`: one typed application state — connection status and
  the selected ports, the ports Web MIDI reports, the library's kind filter
  and its latest results, the cache of slots read from the device, the editor
  and where its preset came from (nothing, a device slot, or a library entry),
  and the undo/redo stacks. It is built once at the app root and reaches the
  rest of the shell through `src/app/AppStateProvider.tsx`, so a change to one
  part of it — a connection notice, say — leaves everything reading the other
  parts untouched.
- `src/app/Led.tsx`: the panel's indicators — a single LED lens, `LedStack`
  for the column beside a selector button, and `LedRow` for the horizontal
  indicator row. Both take the number of LEDs as a prop, so the waveshape
  selectors can differ (5 on LFO 1 and LFO 2, 4 on LFO 3, 3 on each
  oscillator) and the `VOICES` row can be its own 7, and both accept a state
  with no LED lit at all — the oscillators' pulse-only shape is one. Each LED
  in a column can carry the state's name beside it, standing in for the
  waveform glyph the panel silkscreens there. A group that carries a label
  reads its lit state out to assistive technology ("VOICES: 1, 3, 5"); one
  that doesn't is treated as decoration, because the control beside it
  already says the same thing.
- `src/app/ButtonLed.tsx`: the panel's cap buttons — `ButtonLed` for a
  momentary button with a single LED above or beside it, and `DualButton` for
  one that steps a column of LEDs, optionally carrying the panel's shift
  layer as a second set of states with its own labels. Real buttons, so the
  space and enter keys work, and the cap shows itself held down for either.
  The accessible name carries the state the LEDs are showing ("Wave shape:
  Square"). Both are presentational: they report that the button was pressed
  and draw the state they are given, leaving what the next state is to the
  caller that knows the parameter.
- `src/app/LayerLabel.tsx`: the panel's silkscreen under a control, split out
  of the knob so buttons carry it identically — the primary label plain, the
  shift label in its white-filled box, and either selectable when a control
  has both.
- `src/app/AdsrEditor.tsx`: the envelope curve for one EG, spanning the width
  of its section under the knob row where the panel silkscreens its own, with
  the four stages draggable on the curve itself. Four straight segments
  between hard vertices, as the silkscreened curve is drawn, so an instant
  attack is a vertical edge rather than a steep ramp. Attack, decay and
  release are dragged along the curve, sustain up and down it, and each one
  ignores the other axis; the curve redraws from the values it is given, so
  it follows the knobs and the hardware as readily as its own handles. Each
  stage handle sits at the boundary that closes its stage, which puts the
  sustain handle at the moment the key is released — the same point where the
  gate pulse drawn beneath the curve, from the user manual's envelope figure,
  falls. The plateau between the decay and the release is a fixed width for
  that reason: it stands for "as long as the key is held", not for a value.
  Every stage is a focusable ARIA slider with the same keys the knob answers
  to. A stage at zero takes no width at all, so an instant attack rises
  vertically and an instant decay drops straight back down from wherever the
  attack ended; where that stacks two handles on one point, the later stage
  is drawn on top and dragging it clear reveals the other.
- `src/app/control-value.ts`: the value contract every panel control shares —
  bounds, formatted readout, the 200px drag travel, the keyboard steps, and
  an emitter that fires once per distinct value rather than once per pointer
  event. The knob and the envelope curve are both built on it, so the same
  field can be handed to either and behaves identically through both.
- `src/app/EditorPane.tsx`: the first working editor view — the `OSCILLATORS`
  and `MIXER` sections over the preset in hand, sized against each other the
  way the panel sizes them, sharing its horizontal guides so a Mixer knob sits
  on the same line as the Oscillator knob beside it, and reflowing to one
  column when there is no room for two. Every OSC 1, OSC 2 and Mixer parameter
  the instrument has is there; each edit reaches the device as a control
  change the moment it happens, and a control change arriving from the device
  moves the matching control. Saving to the library stays a separate,
  explicit action — nothing here writes to it. CC 3 is left alone in the
  inbound direction, since it names both OSC 1 Transpose and global Transpose,
  while the OSC 1 knob still writes its own field outright; CC 71 is not sent
  at all, since the device is not known to accept it.
- `src/app/OscillatorsSection.tsx` and `src/app/MixerSection.tsx`: the two
  sections themselves, laid out on CSS Grid in the panel's own control order
  and carrying its shift labels — `Tune`/`Transpose`, `LFO1 Mod`/`EG1 Mod`,
  `LFO2 Mod`/`LFO3 Mod`, and hard sync on the shift layer of OSC 2's pulse
  button. Tune and Transpose read out in semitones from the spec's own tables
  rather than as raw bytes, and what a panel label leaves unsaid — which
  oscillator a sub follows, what plugging into External In does to the noise
  generator — is said at the control. The waveform selector and the pulse
  generator drive the one `shape` byte between them. `LFO2 PWM` and `LFO3 PWM`
  get no control: they have a byte and a CC, but no panel control, no entry in
  the user manual, and no effect on the instrument.
- `src/app/FilterSection.tsx` and `src/app/AmplifierSection.tsx`: the `FILTER`
  and `AMPLIFIER` sections, laid out on the same row guides the oscillators
  and the mixer already share, so all four sections' knob rows line up.
  `Cutoff` gets the larger cap the panel gives it, and the panel's stepped
  dotted rule is drawn where it falls — around `Cutoff` and `Resonance`,
  which it separates from the modulation depths and tracking. Every shift
  label the two sections carry is there: `Velocity EG1 Mod`, `LFO3 Mod`,
  `Aftertouch`, `Level`, and the stereo pair, `Stereo spread` and `Stereo
  motion`, which a multi takes from part 1 for the whole instrument.
- `src/app/PanelSection.tsx` and `src/app/panel-rows.ts`: the rounded, titled
  box the panel draws around a group of controls, and the row and column
  guides its sections share, so every section to come is framed and aligned
  the same way.
- `src/app/live-edit.ts`: the editor's live path — a preset field read as a
  control value, the control change each edit sends, and the inbound control
  change that moves it back. An edit always lands in the editor; whether it
  also reaches the device depends on there being a connection, a channel to
  address it on, and a CC the device accepts.
- `src/protocol/enums.ts`: `oscShapeParts`/`oscShapeFromParts`, splitting
  `OscShape` into the waveform and pulse-generator states the panel drives with
  two separate buttons, and rejoining them.
- `src/protocol/config.ts`: `receiveChannel`, reading the configuration's MIDI
  Receive Channel byte as a one-based channel, as Omni, or as one of the values
  the spec calls invalid — never silently as channel 1.
- `src/app/EnvelopeSection.tsx`: the `ENVELOPE GENERATOR 1` and `ENVELOPE
  GENERATOR 2` sections, one component pointed at either envelope rather than
  two copies of the same layout. Each carries all seven of its parameters —
  the four stages plus the shift layers `Attack velocity mod`, `Keyboard
  tracking` and `Release velocity mod` — over the curve widget, so a stage can
  be set from its knob or by dragging the curve, and the two envelopes stay
  independent of each other. Keyboard tracking says at the control that it
  moves attack, decay and release together despite sharing the decay knob, and
  each velocity mod says which stage it belongs to, since the panel prints
  both as `Velocity mod`.
- `src/app/ChorusSection.tsx` and `src/app/DelaySection.tsx`: the `CHORUS` and
  `DELAY` sections, each three knobs with the effect's type on the first
  knob's shift layer, where the panel puts it — Basic and Ensemble across the
  chorus rate knob's travel, and Stereo, Ping-Pong and their two clock-synced
  forms across the delay time knob's, each quarter naming the type it selects
  as the knob passes through it. Each section carries the enable indicator the
  panel prints beside its title, lit whenever Mix is above zero, which is all
  the instrument gives it: there is no on/off parameter behind either effect.
- `src/app/OutputSection.tsx`: the `OUTPUT` section and its Master Volume
  knob. The one panel control with no preset field behind it — it sends and
  follows CC 7 as an instrument level held apart from the preset, so loading
  or saving a preset neither moves it nor captures it.
- The editor now knows which part of a multi the preset in hand is. Chorus,
  Delay and the Amplifier's Stereo spread and Stereo motion are drawn
  read-only on parts 2-4, each saying that a multi takes it from part 1
  alone, instead of accepting edits that reach nothing.
- `src/app/VoicesSection.tsx`: the `VOICES` section, as the two selections the
  instrument's Preset Menu holds — which voices a polyphonic preset may use,
  and which single voice a monophonic one takes — packed into and out of the
  one control change that carries both. The panel's seven-LED row is not
  rebuilt: the instrument never reports which voices are sounding, so the
  section says that where the row would have been rather than lighting lenses
  from a guess.
- `src/app/PortamentoPolyphonySection.tsx`: the untitled block under the
  Mixer — the Mode button stepping the five polyphony modes over four LEDs,
  with Unison lighting alongside ST or MT as it does on the panel and the
  full mode name read out beneath, and the Portamento Time knob carrying Bend
  range on its shift layer. The section is titled from the user manual and
  says so, because the panel prints no title over it.
- The Portamento Time knob now carries the instrument's portamento on/off
  parameter, which no panel control reaches: crossing off zero switches it
  on, returning to zero switches it off, and the knob says so at the control.
  The front panel has a time knob and no switch, so the editor keeps one
  control rather than inventing a second that can contradict it. What value
  counts as "on" follows the general MIDI switch convention and is recorded
  as an open question rather than a fact.
- The device browser can select a preset on the instrument: every slot has a
  `Select` that sends the Bank Select and Program Change addressing it —
  what the panel's numbered buttons do, from the one place in the app that
  also knows the slot's name and lock state. It changes the sound the
  instrument is making and nothing else; the editor keeps the preset it has,
  and the pane says so.
- `Connection.sendProgramChange`: Bank Select MSB and LSB followed by the
  Program Change, written straight to the port rather than through the
  control-change rate limiter, which coalesces and would be free to reorder
  the bank select behind the program it selects.
- Undo and redo over the editor's own edits, from the header buttons or from
  `Ctrl+Z` / `Ctrl+Shift+Z` (`Ctrl+Y` also redoes, and either modifier key
  works). A knob drag is one step, not one per value it passes through:
  successive edits to the same field within 300ms collapse into a single
  entry. History is linear — a fresh edit after an undo drops what was
  waiting to be redone — capped at 100 steps, and forgotten when another
  preset is loaded into the editor. Stepping through it writes the value
  back to the editor and sends the matching control change to the device,
  the same as making the edit by hand. Control changes the device reports
  are not recorded: the panel knob is where it is, and reversing it from
  here would only argue with it.

### Changed

- Consolidated every protocol error class into `src/protocol/errors.ts` as a
  single typed hierarchy (`ProtocolError` base class with a `code`
  discriminant per failure mode), replacing the ad-hoc classes previously
  defined and exported from `address.ts`, `cc.ts`, `mpe.ts`, `nibble.ts`,
  `preset.ts`, `program-change.ts`, and `sysex.ts` individually.
  `ManufacturerHeaderError` and `SysExAddressRangeError` now carry their
  expected header / min-max bounds as structured constructor properties
  instead of baking them into the message string.
- The connection bar, library pane and device pane now read and write the
  shared application state instead of each keeping its own copy, so the state
  survives a pane being unmounted and is visible to the panes that come next.
- Connecting now reads the device's configuration as well as its serial number,
  so live edits go out on the channel the instrument is actually listening on.
  A device that won't answer the configuration read stays connected and says
  so, and edits keep working in the editor with nothing sent.
- Panel controls can carry a description, shown at the control, for what its
  label alone doesn't convey.
- A control bound to a CC the device is not known to accept is now drawn
  read-only — dimmed, and answering neither a drag nor a keypress — rather
  than moving in the editor while nothing reaches the instrument. It still
  follows what the device reports. Filter `Resonance` (CC 71) is the only
  such control today, and stays that way until a hardware test settles the
  direction.
- The envelope curve is drawn as a wide, shallow band rather than a near-square
  one, so a section reads as a row of knobs above a strip the way the panel's
  silkscreen does. Its handles, stroke weights and readout are sized up to
  stay legible and grabbable at the flatter scale.
- The device browser reads a group of slots by itself. Arriving at a group —
  by connecting, or by moving to another bank, group or kind — reads its
  eight slots one at a time and keeps the results, instead of waiting for
  eight presses of a per-slot `Read`. A slot the device never answered for
  keeps a read of its own to retry with.
- Every finish colour that a photograph can source is now calibrated against
  the hardware photography instead of hand-picked: panel and section
  background per finish, skirt, pointer and inlay per cap colour, and the lit
  and unlit lens of the red LED. The white LED keeps its hand-picked values.
  The black panel is a warm near-black rather than a cool one, the blue is a
  deeper and more saturated azure, and black caps are near-black with a
  bright inlay rather than the mid-grey they were. Both label colours now
  clear WCAG AA against both backgrounds on both finishes; the secondary
  label previously fell to 4.44:1 on the blue section background.

### Fixed

- Pinned TypeScript to `^6` — `dependency-cruiser` doesn't parse TS 7's
  (Go-ported compiler) output yet and silently cruises 0 modules against it.
  Revisit once dependency-cruiser publishes TS7 support.
- Each application state now starts on a preset of its own. The empty preset
  was a single shared value, and the store wrote edits through into it, so a
  second application state began wherever the first had left off.
- An inbound control change carrying a value the field's own table reserves
  is ignored instead of taking the editor's update path down with it. CC 97
  above 71 is the reachable case — the packed Voices accessor rejects such a
  value on write — and it previously threw out of the control-change
  subscription, ending live tracking for every other parameter too.

### Documentation

- Architecture and protocol-quirks docs, reference document download
  instructions.
- `docs/hardware-smoke-test.md`: running the smoke test against a real
  device, and how to read each counter in its log against the open questions
  in `protocol-quirks.md` it settles.
- First hardware findings, from a run against serial #361 over USB in
  Brave/Chromium. Neither behavior the transport was built to absorb appears
  in a browser: the device's undocumented preview frame never reached the
  page, and no SysEx frame arrived fragmented. Both guards stay but are now
  documented as defensive rather than load-bearing. Recorded alongside them:
  what the run does not rule out (Chromium may be dropping malformed frames
  itself, and the original sighting may have been a Soft Thru echo), that
  preset names are ASCII padded with spaces to 20 bytes, and that
  undocumented preset bytes are not uniformly zero — preset 1.1.1 holds
  `0xFF` in bytes 125 and 126, confirming they must round-trip verbatim.
- Three open questions the same run raised: the device answers every command
  in a fixed ~16ms, which is device-side rather than browser-side and puts a
  floor of about 2min 11s on reading all preset memory unless the device
  turns out to accept pipelined requests; the outbound CC rate limit of 200Hz
  may be roughly 3x more permissive than a ~62.5Hz device cycle warrants; and
  every one of these findings holds for USB only, DIN MIDI being untested.
- `docs/panel-layout.md`: the front panel derived once from the hardware
  photography, so section work is checked against a written sheet rather than
  against a photo. One table per section in physical control order, with the
  primary silkscreen, the boxed shift-layer label, widget type, and the
  `SinglePreset` field and/or CC each control resolves to. Records the
  discrete counts exactly (5/5/4 LFO waveshape LEDs, 7 `VOICES` LEDs, 10
  Presets LEDs) and the three places where LED count and enum-variant count
  legitimately differ.
- Recorded that the e7's knobs are physical potentiometers, not endless
  encoders — confirmed by the instrument's owner and absent from both
  documents. Explains why 24 of the 48 knobs can carry a shift layer whose
  value the pot's position cannot represent, and why the instrument has a
  Panel mode at all. Whether it uses pickup/soft-takeover is still unknown;
  the editor's knob widget is unaffected either way, being absolute by
  construction.
- `docs/protocol-quirks.md` #5 reopened. The panel has exactly one
  EG1-to-LFO knob, silkscreened on LFO 2, which is evidence the entry's
  runtime-only reading of CC 67 didn't have — byte 55 and CC 67 may be the
  same parameter with one document's LFO number wrong. The reading is now
  marked contested and owned by a hardware task; CC 67 stays unmapped and
  `lfo1.eg1Mod` unrenamed until it is answered. New open question #22 for the
  Chorus and Delay enable LEDs, which no parameter accounts for, and a note
  on #14 that global transpose has no panel control while OSC 1 Transpose
  does — a hint about which field the device associates with CC 3.
- `src/app/Knob.tsx`: the rotary knob widget every editor section is built
  from. Vertical pointer drag sets the value over 200px of travel and
  horizontal movement is ignored outright; a drag emits once per value rather
  than once per pointer event, so it hands the outbound CC rate limiter one
  update per step instead of one per pixel. Focusable and driveable from the
  keyboard — arrows nudge by one, PageUp/PageDown by ten, Home/End jump to
  the ends — and it exposes itself as an ARIA slider with the parameter's own
  formatted readout. Knobs that carry a silkscreened shift label take a
  second layer with its own value, range and range formatting; the two labels
  are both visible, the shift one in the panel's white-filled box, and
  selecting one points the cap at that layer's value.
- Knob rendering measured off the panel photography rather than assumed: a
  300° tick arc from -150° to +150° with 21 ticks at 15°, long ticks at the
  30° multiples and short ones between. The knob is drawn as the hardware is
  built — a 7-lobe fluted skirt carrying the knob's colour, a brushed-metal
  inlay disc set into its top, and the pointer on the skirt between the two,
  where it inverts against the skirt. Turning the knob rotates the whole
  body, lobes and mark together, leaving only the silkscreened tick arc
  behind. Colours come entirely from the theme's custom properties.
- `src/app/theme.ts`: `--e7-knob-inlay-top` and `--e7-knob-inlay-bottom` for
  the knob's metal inlay disc, the one knob surface the finish variables did
  not yet cover. Constant across all eight finish combinations — the inlay is
  the same part on the white-knob and black-knob units, and only the skirt
  beneath it changes colour.
- `docs/panel-layout.md`: knob construction — the skirt/inlay/pointer split,
  which surface carries the finish colour, sampled values for each, and the
  7-lobe flute count. Records that measuring the flute count off the
  photography returns a confident and wrong answer of 12, because the scan
  window reaches into the tick ring and locks onto its 15° pitch.
- `docs/panel-layout.md`: the tick arc's measured geometry, recorded so it is
  read once — including that angles have to be measured about the arc centre
  found from the tick lines, not about the cap, whose projected centre is
  displaced by parallax enough to make the spacing look uneven.
- Six findings from that pass, each raised rather than reconciled: the
  panel's only EG1-to-LFO knob is silkscreened on LFO 2 while the byte map
  names byte 55 LFO 1, which is new evidence against the reading that CC 67
  is runtime-only; `Master Volume` is the one knob whose value is not part of
  a preset; five parameters have a CC but no hardware control; and the Chorus
  and Delay enable LEDs have no parameter behind them at all.
- `docs/panel-layout.md`: the silkscreened ADSR curve under each Envelope
  Generator — four equal bands split by five vertical dashed lines, four
  straight segments rather than an exponential shape, and the dash geometry.
  Corrects the sheet's earlier claim that the curve's segment boundaries line
  up with the four knobs: measured against the photography, each knob is
  centred over its own band to within 3px, so the dividers fall between the
  knobs. Records that the panel has no gate-pulse trace — that is the user
  manual's figure (p.12), not the instrument's silkscreen.
- `docs/panel-layout.md`: button and LED construction — the buttons take the
  same finish colour as the knobs and never change appearance when pressed,
  an unlit LED is the lit colour unlit rather than a neutral grey, and each
  control's LEDs sit either in a column down the right of the cap, one
  silkscreen per lens, or centred above it on the `PRESETS` row.
- `docs/panel-layout.md`: the Filter's dotted rule is stepped rather than
  straight — down between `Cutoff` and `EG1 Mod`, one column right, then down
  again past `Resonance` — which is the panel grouping the filter's own two
  parameters apart from the modulation depths and tracking. The sheet also
  now records how the unwritable `Resonance` knob was resolved, and that the
  section's bottom row is offset half a knob pitch from the row above.
- `docs/off-panel-parameters.md`: the complement of the panel layout sheet —
  every parameter, configuration value and device command the front panel
  gives no control for, with what reaches each one and whether it is real,
  menu-only, contested, or an address with nothing behind it. Written because
  the MIDI implementation lists addresses and the user manual describes
  controls, and an address the manual never mentions is not evidence that a
  parameter exists. `docs/panel-layout.md` records the same distinction where
  it bites: `LFO2 PWM` and `LFO3 PWM` have a byte and a CC apiece, no panel
  control, no manual entry, and no effect on the instrument.
- `docs/panel-layout.md`: how the Voices and Portamento / Polyphony sections
  were built and why each departs from the panel where it does — the
  seven-LED voices row left undrawn for want of anything to drive it, the
  portamento switch folded into the time knob rather than given a control of
  its own, and the Mode button's handling of a reserved value. Records why
  the `PRESETS` block is the one panel section with no box in the editor: the
  device browser is the same picker with the slot names in it, so the panel's
  numbered buttons became a `Select` action there.
- `docs/protocol-quirks.md` open question #23: nothing in either document says
  what value byte 48 holds when portamento is on. The editor writes 127 on the
  general MIDI switch convention, which is the only evidence there is for it,
  and the entry records the hardware check that would settle it.
- `docs/panel-layout.md`: the finish colours behind `src/app/theme.ts`, how
  each was sampled, and what the sampling settled — the black unit has black
  skirts rather than white ones, a section box is an outline and not a fill,
  and both photographs are saturation-boosted in post. Records the two places
  the shipped theme departs from its samples, that a button's finish colour
  is independent of the knobs', and that the white LED is the one value no
  available photograph can source.
