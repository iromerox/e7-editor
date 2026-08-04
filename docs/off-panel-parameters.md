# Parameters with no front-panel control

`panel-layout.md` is the inventory of what the front panel has. This is its
complement: everything the instrument exposes that the panel gives **no
control for**, and what reaches it instead.

It exists because the two documents disagree about what a parameter is. The
MIDI implementation is a byte map and a CC table — it lists addresses. The
user manual describes controls. A row that appears in the first and nowhere
in the second is not automatically a parameter, and the difference decides
whether the editor should offer a control for it. Each entry below therefore
carries what it actually is, not just where it lives.

The editor covers the panel first. Nothing here is built yet, and the four
rows marked **not a parameter** should never be built.

---

## How to read the status column

| Status | Means |
|---|---|
| **Real** | The instrument has the parameter; only a panel control is missing. Reachable over MIDI or SysEx today. |
| **Menu-only** | The instrument has it and reaches it from a menu, not from a labelled control. |
| **Contested** | Sources disagree about what it is or what drives it. Resolve before building anything on it. |
| **Not a parameter** | An address with nothing behind it. Round-trip the byte; give it no control. |

---

## Preset parameters

Fields of `SinglePreset` (see `src/protocol/preset.ts`) that no panel control
touches.

| Field | Byte | CC | Reached from | Status |
|---|---|---|---|---|
| `portamento.on` | 48 | 65 | Nothing — the panel has `Portamento Time` and no on/off | Real |
| `transpose` | 105 | 3 | Preset Menu (Shift + button 5) | Contested — see below |
| `monoVoice` / `polyVoice` | 106 / 107 | 97, packed as `16*V1 + V2` | Preset Menu; the `VOICES` LED row is an indicator, not a control | Menu-only |
| `part1Only.name` | 0-19 | — | The save flow: `Bank`+`Shift`, then character entry on buttons 1-5 | Menu-only |
| `part1Only.lock` | 127 | — | Not reachable from the panel at all — SysEx only | Real |
| `partSettings.keyboardZoneLower` | 109 | — | Multitimbral mode (Shift + button 6) | Menu-only |
| `partSettings.keyboardZoneUpper` | 110 | — | " | Menu-only |
| `partSettings.velocityZoneLower` | 111 | — | " | Menu-only |
| `partSettings.velocityZoneUpper` | 112 | — | " | Menu-only |
| `partSettings.midiChannel` | 113 | — | " | Menu-only |
| `partSettings.midiFilter` | 114 | — | " | Menu-only |
| `lfo1.eg1Mod` | 55 | 67 | The `EG1 Mod` shift layer of LFO 2's `Rate` knob — if that knob and this byte are the same parameter | Contested |
| `osc1.lfo2Pwm` | 31 | 27 | Nothing | **Not a parameter** |
| `osc1.lfo3Pwm` | 32 | 28 | Nothing | **Not a parameter** |
| `osc2.lfo2Pwm` | 45 | 44 | Nothing | **Not a parameter** |
| `osc2.lfo3Pwm` | 46 | 45 | Nothing | **Not a parameter** |

`partSettings` is only used when the preset is part of a multi, so a single
preset carries six bytes that do nothing until it becomes a multi part.

### The four PWM addresses

Each oscillator has four PWM-source addresses — `EG1 PWM`, `LFO1 PWM`,
`LFO2 PWM`, `LFO3 PWM` — in both the CC table and the byte map. The panel has
knobs for the first two. The user manual describes the first two (p.8) and
never mentions the other two. The instrument's owner confirms they do nothing.

Treat them as the byte map reaching past the firmware. They are decoded,
re-encoded and preserved verbatim like every other byte, and the editor gives
them no control. This is the reason the status column exists: `portamento.on`
and `osc1.lfo2Pwm` look identical in the MIDI implementation, and only the
manual tells them apart.

### `transpose` versus `osc1.transpose`

Both plausibly claim CC 3, unresolved — see `protocol-quirks.md` #14, owned by
HW-04. `cc-map.ts` maps CC 3 to both and `applyCc` reports it as ambiguous
rather than guessing. The oscillator section writes `osc1Transpose` by name,
so the ambiguity only blocks the *global* transpose, which needs a home in the
editor outside any panel section.

### `lfo1.eg1Mod`

The byte map calls byte 55 `LFO1 EG1 Mod`; the CC table, the manual and the
panel all attribute the one EG1→LFO control to LFO 2. Owned by HW-08 —
`protocol-quirks.md` #5. Don't wire a control to CC 67 until it is answered.

---

## Global configuration

Not preset data. It lives in configuration memory (`0x020000`-`0x0203FF`), is
read and written with the Read/Write Configuration SysEx commands, and the
panel reaches it from Global Configuration (Shift + button 8).

| Value | In the read response | Reached from | Notes |
|---|---|---|---|
| MIDI Receive Channel | yes | Config menu | 0-15 for channels 1-16, 16 for Omni. `receiveChannel()` in `src/protocol/config.ts` decodes it; the app reads it on connect to know what channel to send live edits on. |
| MIDI Transmit Channel | yes | Config menu | Same encoding, except 16 means Off. Nothing reads it yet. |
| MIDI Filter | yes | Config menu | Which of Pitch Bend / Program Change / Control Change the instrument accepts. **The editor's live edits are Control Changes, so this can switch them off at the instrument.** |
| MIDI Soft Thru | yes | Config menu | |
| MIDI Clock Source | **no** | Config menu | Read Configuration never returns it, so a Write Configuration has to supply it — `intoConfiguration()` exists for exactly that. `protocol-quirks.md` #2. |
| MPE Enable | **no** | Config menu, or an MPE Configuration Message | Same gap as Clock Source. `src/protocol/mpe.ts` encodes and decodes the MCM; nothing sends one. |

A configuration editor is the one item on this page with a real hazard behind
it: Write Configuration takes all six values at once, and two of them can't be
read back. Writing a configuration without carrying those two forward silently
changes them.

---

## Device commands

Actions rather than parameters. Every one of these is a SysEx command in
`src/protocol/sysex.ts`; none has a control in the editor.

| Command | Panel equivalent | Notes |
|---|---|---|
| Initialize Preset | — | Loads a default basic preset into the edit buffer. |
| Factory Reset | Global Configuration menu | Overwrites every **unlocked** preset with a default basic preset. Locked presets survive. Destructive; needs confirmation in front of it. |
| All LEDs ON | — | A lamp test. Useful for confirming a connection reaches the instrument. |
| Read Autotuning Status | — | Reports progress of a calibration run in flight. |
| Lock / Unlock Preset | — | Writes byte 127. Locking is panel-facing only: it stops the *panel* overwriting a preset, and the lock byte does not prevent any SysEx write. |

**Autotuning is the gap in the other direction.** The panel runs it from the
shift layer of OSC 1's pulse button, the manual documents it (p.7), and the
MIDI implementation defines a command to read its *status* but none to start
it. So the editor can watch a calibration the user starts on the instrument
and cannot start one itself.

---

## Performance controls, deliberately not editor parameters

| CC | What it is |
|---|---|
| 1 | Mod Wheel — a player control. Its *depth* per destination is a preset parameter (`lfo3.modWheelMod`, `filter.modWheelMod`); the wheel position is not. |
| 7 | Volume — `Master Volume` on the panel, and the only panel knob with no preset byte behind it. Global output level; not saved, not restored. See `panel-layout.md` Finding 2. |
| 64 | Hold — a pedal. Not stored. |

Aftertouch and Pitch Bend are the same case: depths are preset parameters,
the gestures are not.

---

## Not addressable at all

The reserved bytes: 56, 57, 61, 62, 63, 69, 100-104, 125, 126. No CC, no
documented meaning, and no way to reach them from the panel. `SinglePreset`
carries them so that decoding and re-encoding a preset returns the bytes the
device sent, unchanged.
