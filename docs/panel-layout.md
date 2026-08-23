# Panel layout

The derived, committed summary of the e7's front panel: section grouping,
control order, the silkscreened shift-layer labels, and what each control
binds to in `src/protocol`.

This sheet exists so the panel photography gets read once. Build sections
against it, not against a photograph. When it is silent or looks wrong, open
`docs/reference/panel/e7-black-front.webp` (see `docs/reference/README.md`
for how to obtain it), then **update this sheet** with what you found.

**Not a pixel replica.** The hardware is a 520mm-wide desktop unit and the
browser is not. Use this sheet for information architecture — grouping,
order, adjacency, relative proportion — and let sections reflow.

Sources: `e7-black-front.webp` for everything silkscreened, the user manual
for prose descriptions of behavior (pp.7-24), the MIDI implementation
document for byte offsets and CC numbers, and `src/protocol/preset.ts` /
`src/protocol/cc-map.ts` for the names the app actually binds to.

---

## Reading the tables

Every section below has one table. Controls are listed in the order they
physically appear, left to right and top to bottom.

| Column | Means |
|---|---|
| **Label** | The primary silkscreen, transcribed exactly — including its capitalization, which is inconsistent across the panel (`Keyboard tracking` in Filter, `Velocity EG2 mod` in Amplifier, `EG1 PWM` in Oscillators). |
| **Shift** | The secondary label, printed in a white-filled box under the primary one. Reached by pressing `Shift` first. `—` means the control has no shift layer. |
| **Widget** | What kind of control it physically is. |
| **Binds to** | The `SinglePreset` path and/or CC number, or an explicit note that the control is not addressable. |
| **Notes** | Anything the label alone doesn't convey. |

### Label conventions on the panel

Three silkscreen treatments, and they mean different things:

- **Plain white text** — the control's primary function.
- **White-filled box** — the shift layer, reached by pressing `Shift` first
  (user manual p.6: "the alternative one (highlighted in white), which is
  accessed by pressing the SHIFT button beforehand"). The `Shift` LED stays
  lit while the layer is active.
- **White-filled box, italic** — a function that only exists inside a
  configuration menu, not on the shift layer: `Enter` under the Mode button,
  `Value` under the Portamento Time knob, `Menu` under button 5. Three
  controls carry both a boxed and a boxed-italic label, so a knob can have
  up to three distinct meanings depending on mode.

The editor is not a menu system, so the italic layer is out of scope for the
section widgets — it's recorded here only so nobody mistakes it for a second
shift label.

### Widget vocabulary

| Widget | Description |
|---|---|
| Knob | Standard knob, tick arc silkscreened around it. Two concentric surfaces, not one — see [Knob construction](#knob-construction). A physical potentiometer with a fixed travel — not an endless encoder. See [Knobs are pots](#knobs-are-pots) for what that implies and [The tick arc](#the-tick-arc) for its measured geometry. |
| Knob (large) | Physically larger cap — roughly 1.7x the standard cap diameter. Only two on the panel: Filter `Cutoff` and Output `Master Volume`. Signals prominence, not a different value range. Every other knob on the instrument is the same size, including the LFO `Rate` knobs, which read as larger in the fitted view and measure the same in a crop. The tick arc is identical on both sizes. |
| Button + LED column | Momentary square button that steps through states; a column of LEDs beside it shows which state is current. See [Button and LED construction](#button-and-led-construction). |
| Button + LED | Momentary square button with a single LED above or beside it. Same construction, with a column of one. |
| LED row | Indicator only — no button, nothing to press. |
| Display | The small monochrome OLED. Not a control. |

### Knob construction

Every knob is **two concentric surfaces**, and drawing it as a single disc
gets it visibly wrong:

| Surface | What it is |
|---|---|
| Skirt | The knob body — a fluted ring with **7 lobes**, and the part that carries the knob's colour. Broad rounded lobes with gentle valleys between, not sharp notches. |
| Inlay | A brushed-metal disc set into the top of the skirt, about 60% of the skirt's diameter. Reads near-white under studio lighting (median `#f5f2ee` sampled off `Master Volume`). |
| Pointer | A line **on the skirt**, aligned with a lobe, running from the inlay's edge outward to near the skirt's rim. It does not cross the inlay. |

**The whole body turns.** Skirt, inlay and pointer rotate together with the
value — the lobes travel with the mark. Only the tick arc stays put, because
it is silkscreened on the panel rather than printed on the knob.

**The lobe count is 7, confirmed on the instrument by its owner — do not try
to re-derive it from the photographs.** An autocorrelation of the skirt
silhouette in `e7-black-front.webp` returns a confident, clean answer of 12,
on all three knobs measured, and it is wrong. The scan window reached past
the skirt into the tick ring, so it locked onto the ticks' 15° pitch and its
30° harmonic instead of the skirt's own profile. It is a convincing false
positive: an isolated autocorrelation peak of 0.35-0.65 with every other
pitch at or below zero. Any remeasurement has to stop the scan short of the
tick ring, and should still be checked against the hardware.

The two photographed finishes differ only in the skirt, and the pointer
inverts against it:

| Finish | Skirt | Pointer |
|---|---|---|
| Black unit (`e7-black-front.webp`) | Glossy black — flat regions sample `#0a0604` at the top, `#030301` at the bottom, with highlights to `#423935` | White |
| Blue unit (`e7-blue-front.webp`) | White | Dark |

The inlay is present on both. On the white knobs it is nearly the same value
as the skirt and reads only as a subtle edge ring, which is why it is easy to
miss at fitted scale.

### Button and LED construction

Every button on the panel is a **square cap with softly rounded corners**,
separated from the chassis by a thin dark gap. It takes a finish colour of
its own, and **not necessarily the knobs'** — both front shots happen to
pair them (black with black, white with white), but a close-up of a blue
unit shows white buttons beside black knobs on the same instrument. Don't
infer one from the other. Nothing on the cap changes when the button is pressed
or when its function is active; state is shown entirely by the LED beside or
above it. A cap measures roughly 0.8x the diameter of a standard knob skirt.

LEDs are **round lenses about a quarter of a cap's width**, and an unlit one
is not grey — it is the lit colour, unlit: the red-LED unit's unlit lenses
measure a dark red (`#652e2a`), against `#ef2b1e` lit. A lit LED blooms
visibly into the panel around it. Every close-up available here shows red
LEDs, on both the black and the blue finish; see the white-LED note under
[Finish colours](#finish-colours).

Their arrangement is one of two, and which one is a panel fact per control:

| Arrangement | Where | Detail |
|---|---|---|
| Column beside the cap | LFO 1/2/3 `Wave shape`, both oscillators' waveform and pulse buttons, the `Mode` block | LEDs run down the right side of the cap, one per state, each with its own silkscreen immediately right of the lens — a waveform glyph on the LFO and oscillator selectors, a word (`Poly`, `ST`, `MT`, `Unison`) on `Mode`. A single-LED button like the oscillators' pulse selector is the same arrangement with a column of one. |
| Above the cap | All ten `PRESETS` buttons | One LED centred above the cap. The numbered buttons print their digit immediately left of the lens. |

The editor's equivalent of a waveform glyph is the state's name in text —
the panel can rely on a glyph beside a lens and a browser reads better with
the word.

**The cap is the anchor, not the column.** A cap sits on the centre line of
the knobs in its row — the same line the knob caps' centres sit on — and its
LED column is centred on the cap, overhanging above and below when the
column is taller than the cap. The reverse, letting the column place the
cap, makes a cap's height depend on how many lenses it has: LFO 1's
five-lens button hung 14px below OSC 1's three-lens button on the same row,
and a button's own cap moved when its shift layer swapped one column length
for another.

Two consequences worth knowing before adding a selector: the labels under a
button clear the column's lower overhang rather than the cap's bottom edge,
and a column tall enough reaches into the row above, so check it against
whatever that row holds. On the LFO box that row holds the half's name, and
the two clear each other only because the button is centred in a column
wider than itself.

**A button holds still.** A button centred in its column walks sideways if
its own footprint changes with what it is showing, and two things made it:
switching layers swapped one LED column for another of a different length,
and the spelled-out state under it grew and shrank with the value. So a
button now reserves the space every layer's column needs, and the
spelled-out line is capped at a width narrower than that column and wraps
past it. Keep a state's name short enough to sit on one line — the wrap is
there so a long one costs a line rather than a jump sideways.

### Finish colours

The values in `src/app/theme.ts` are calibrated from the two front shots.
Each is a median over many flat regions of the surface, never a single
dropper hit: the panel figures come from every 9px patch across the panel
face whose standard deviation is under 2, the knob figures from all 48
knobs at once (found by their inlays, sampled as an upper and a lower
sector of the skirt), and the LED figures from every lens on the panel,
split into lit and unlit by whether the lens core clips.

| Surface | Black unit | Blue unit |
|---|---|---|
| Panel | `#3a2f2c` (n=2679 patches) | `#016bad` (n=1394) |
| Silkscreen ink | `#e8e1dc` | `#ece4dc` |
| Skirt, upper / lower | `#140d0b` / `#080402` | `#e5dddb` / `#d1c8c5` |
| Pointer | `#fcf5f0` | `#040001` |
| Inlay | `#f6f3ef` median | `#faf8f5` median |
| LED lit / unlit | `#ef2b1e` / `#652e2a` (red) | not sampled — see below |

The inlay is the one surface that does not take the finish: it measures the
same on both units, and near-flat, so a sector median cannot supply a
gradient for it. `--e7-knob-inlay-top` / `--e7-knob-inlay-bottom` use the
interquartile ends of its own spread instead (`#faf8f5` and `#f1ede9`,
n=73530 pixels), which is what makes the brushed sheen read as the knob
turns. The lit LED figure is a median over the lens pixels that are *not*
clipped — 38% of a lit red lens is blown out in the photograph, so the real
emission is at least that saturated.

Three things the sampling settled that were previously assumed, and one it
turned out not to be able to settle at all:

- **The black unit has black skirts, not white ones.** Its knobs read as
  light at fitted scale because of the near-white inlay in the middle of
  each one, not because of the skirt.
- **The white LED is not sampled from anything.** `#fefae6` / `#403d32` are
  the hand-picked values the theme shipped with, kept deliberately. The
  low-resolution blue shot does read cream at its lit lenses, but a close-up
  of a blue unit shows red LEDs, so what that shot records is a small blown
  lens with its chroma washed out, not a white one. No photograph available
  here shows a white-LED instrument. Replace these the moment one does.
- **The section boxes are outlines, not fills.** Sampling just inside and
  just outside the same border, at the same height, puts the interior
  1-5 luminance units *darker* than the exterior — border shading, not a
  fill; there is one continuous panel surface behind everything.
- **Both shots are saturation-boosted in post.** The same mahogany cheek
  returns a blue channel of 3 in both, which no real wood does under
  neutral light, and the blue panel's red channel is crushed to 1 for the
  same reason.

Two deliberate departures from the samples:

- `--e7-section-background` is a small lift above `--e7-panel` rather than
  the same value. The hardware delineates a section with a silkscreened
  outline on a continuous surface; a 1px browser border does not group as
  strongly at screen size, so the fill carries part of the work. The lift
  is kept to +8 per channel so it stays a hint.
- The blue panel ships at `#0a4a72`, not the sampled `#016bad`: the sample
  desaturated 16% (see the saturation-boost point above) and taken to 72%
  of its value. At the sampled value, `--e7-label-secondary` lands at
  3.36:1 against the panel and fails WCAG AA for small text. Every
  label/background pair now clears 4.5:1 on both finishes, the closest
  being the secondary label on the blue section background at 4.76:1.

### The tick arc

**The arc spans 300°, not the 270° a knob widget usually assumes.** Measured
off `e7-black-front.webp` at full resolution, on three knobs independently —
Mixer `OSC1` (standard), Filter `Cutoff` and Output `Master Volume` (both
large):

| Property | Value |
|---|---|
| Span | 300°, from -150° to +150° — 7 o'clock round the top to 5 o'clock |
| Ticks | 21, evenly spaced at 15° |
| Long ticks | 11, at the 30° multiples including both ends and 12 o'clock |
| Short ticks | 10, one between each pair of long ones, about 60% the length |
| Inner radius | All ticks start at the same radius, just outside the knob skirt |

The three knobs agree to within a degree (mean tick spacing 14.95° / 15.01° /
14.9°, standard deviation 0.19-0.34°), and the standard and large knobs carry
the same 21-tick arc at different scales.

Two cautions if this is ever remeasured. Angles must be taken about the arc's
own centre, found by intersecting the tick lines — **not** about the cap,
whose projected centre sits 8-11px away from it at 2400px, because the cap
stands proud of the panel and the shot is only near-orthographic. Measuring
about the cap makes the spacing appear to drift from 12° to 18° across the
arc. Residual perspective still leaves each tick within about 2° of its
nominal angle, worst on `Master Volume` at the far right of the panel; the
underlying geometry is plainly the exact 15° grid.

### Knobs are pots

Every knob on the instrument is a **physical potentiometer** with a fixed
travel and a pointer that means something — confirmed by the instrument's
owner, and not stated in either document. That is worth writing down because
it makes two things on this panel make sense:

- **A pot can't represent two values, and 24 of the 48 knobs carry a shift
  layer.**
  When `Shift` is held, the pot's physical position has nothing to do with
  the parameter it is now editing. Whether the instrument uses pickup /
  soft-takeover for this — the parameter not moving until the pot passes
  through its stored value — **is not known**, and neither document says.
- **`Panel` mode exists for the same reason.** Loading a preset leaves every
  pot pointing at the wrong value, so the instrument offers a mode
  (Shift + button 7) where the sound follows the pot positions instead of
  the stored preset. That is a pot problem being solved in the UI, not a
  feature the editor needs an equivalent of.

**None of this changes the editor's knob widget.** A widget bound to app
state is absolute by construction and has no travel to run out of, so it
never needs pickup. The open question only describes what the *hardware*
does when someone touches it, and the editor observes that through the CCs
the device sends — it doesn't have to model it.

Two consequences it does have. First, if there is no pickup, nudging a
hardware knob after loading a preset makes the value jump from wherever the
pot happens to be sitting, and the editor will faithfully show that jump —
worth knowing before treating it as a sync bug. Second, don't draw the
editor's knobs as endless encoders: the pointer and the tick arc are real,
and matching them keeps the two instruments legible side by side.

Deliberately not raised as a task. Nothing in the code assumes an answer,
which is the vault's own bar for tracking an open question, and it costs
about a minute to settle during any hardware session — load a preset, nudge
a knob, watch whether the value jumps or picks up.

---

## Section map

The panel is one wide block in three horizontal bands.

**Top band**, left to right:

```
LFO          OSCILLATORS      MIXER    FILTER    AMPLIFIER   OUTPUT
 LFO 1        OSC 1                                          VOICES
 LFO 2        OSC 2
```

`VOICES` sits directly under `OUTPUT` in the same right-hand column, and
`MIXER` is narrower than the rest — its box steps in at the bottom so only
`Noise/Ext` occupies the lowest row.

**Middle band**, left to right: the untitled Portamento / Polyphony block
(under `MIXER`), then `ENVELOPE GENERATOR 1` and `ENVELOPE GENERATOR 2`
side by side, spanning the width under `FILTER` / `AMPLIFIER` / `OUTPUT`.
The OLED display sits in its own small box between the Mixer's `Noise/Ext`
knob and Envelope Generator 1.

**Bottom band**, left to right: `LFO3`, `PRESETS`, `CHORUS`, `DELAY`. The
`MIDI` activity LED sits in the gap above the right end of `PRESETS`,
between the Portamento block and `CHORUS`.

Adjacencies worth preserving when the layout reflows: LFO 1/2 next to the
oscillators they modulate; Mixer between Oscillators and Filter, matching
signal flow; Chorus immediately before Delay; Output last.

---

## Discrete-control counts

Counted from crops of `e7-black-front.webp` at 3x or more, not from the
fitted view — the fitted view miscounts the `VOICES` row as 8.

| Group | Count | Detail |
|---|---|---|
| LFO 1 waveshape LEDs | **5** | triangle, ramp up, ramp down, square, S&H |
| LFO 2 waveshape LEDs | **5** | same five as LFO 1 |
| LFO 3 waveshape LEDs | **4** | triangle, ramp up, ramp down, square — no S&H |
| OSC 1 waveform LEDs | **3** | triangle, saw-tri, sawtooth |
| OSC 1 pulse LED | **1** | on the second button, below the waveform one |
| OSC 2 waveform LEDs | **3** | same three as OSC 1 |
| OSC 2 pulse LED | **1** | same as OSC 1 |
| Polyphony mode LEDs | **4** | Poly, ST, MT, Unison |
| `VOICES` LED row | **7** | The instrument is 7-voice. Anything reading as 8 is a misread at fitted scale. |
| Presets transport buttons | **2** | `Shift`, `Bank`/`Save` — one LED each |
| Presets numbered buttons | **8** | `1`-`8`, digit printed left of each LED — one LED each |
| Presets LEDs, total | **10** | 2 transport + 8 numbered |
| Chorus enable LED | **1** | in the section header, right of the `CHORUS` title |
| Delay enable LED | **1** | in the section header, right of the `DELAY` title |
| MIDI activity LED | **1** | in a small standalone box labelled `MIDI` |

LED counts do **not** equal enum-variant counts in three places, and each
difference is real hardware behavior rather than a miscount:

- **LFO 1 / LFO 2**: 5 LEDs, 6 `LfoShape` variants. The sixth
  (`noise-sample-hold-led-off`, CC 80-127) is the same S&H waveform with no
  LED lit. Only reachable over MIDI; the panel button never selects it.
- **Oscillators**: 4 LEDs across two buttons, 8 `OscShape` variants. The
  waveform LEDs and the pulse LED are independent — `shape` encodes the
  combination, including all-LEDs-off (`off`, CC 48-63, pulse generator
  only) and every waveform+pulse pairing.
- **Polyphony mode**: 4 LEDs, 5 `OtherMode` variants. `Unison` combines with
  `ST` or `MT`, so `unison-single-trigger` lights two LEDs.

---

## LFO 1

Top half of the `LFO` box, far left of the panel.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Wave shape` | `Mode` | Button + LED column (5) | `lfo1.shape` / CC 53; shift: `lfo1.mode` / CC 60 | Shape via `LfoShape`, mode via `LfoMode` (6 variants: mono, poly, KB tracking, KB sync, clock sync, KB+clock sync). |
| `Rate` | — | Knob | `lfo1.rate` / CC 76 | In the clock-sync modes the value reads as a musical division — see `LfoClockRate`: 15 divisions in regular 8-wide bands ascending from `Whole Note` at 0, `1/32 Note` taking the 112-127 remainder. |

The LFO 1 block has **no EG1 Mod control** on the panel. `lfo1.eg1Mod`
(byte 55) exists in the preset layout and has no knob here — see
[Finding 1](#finding-1-eg1-mod-is-silkscreened-on-lfo-2-but-the-byte-is-named-lfo-1).

## LFO 2

Bottom half of the `LFO` box.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Wave shape` | `Mode` | Button + LED column (5) | `lfo2.shape` / CC 61; shift: `lfo2.mode` / CC 70 | Same five LEDs and same enums as LFO 1. |
| `Rate` | `EG1 Mod` | Knob | `lfo2.rate` / CC 62; shift: **contested** — CC 67, and either `lfo1.eg1Mod` (byte 55) or nothing persisted | The shift layer is the panel's only EG1→LFO modulation control. Manual p.14 attributes it to LFO 2. See [Finding 1](#finding-1-eg1-mod-is-silkscreened-on-lfo-2-but-the-byte-is-named-lfo-1) before wiring this knob. |

### How the box was built, and where it departs from the panel

The `EG1 Mod` shift layer is **not built**. The knob carries `Rate` alone,
and a line beside it says the user manual and the byte map name different
LFOs, with the whole disagreement in the knob's own description. A knob that
moves nothing teaches the user nothing; a sentence where the knob would be
tells them what the instrument's own documents disagree about.

`Mode` lights no LEDs of its own. The five lenses on this button belong to
`Wave shape`, and the mode is on the instrument's display, so the shift
layer reads the mode's name under the button rather than inventing a
six-lens column the hardware does not have. The shape's column stays lit
underneath it: the lenses are physical, and holding a shift layer over them
is no reason for the instrument to appear to forget its waveform. A layer
with lenses of its own still shows them — the fallback is to the primary
column, not to it always. The names are the manual's, in its own
abbreviated forms — `KB Tracking` and `KB Sync` are the parenthesised short
names it gives on p.14, and `KB + Clock Sync` follows them — because a name
wider than the button's column costs a second line under it. The full six
are spelled out in the button's description.

**A selector spells its state out only when no lens is lit.** `ButtonLayer`
grew an optional `readout` — always the cap's accessible name, and printed
under the button only while the column is dark. A lit lens already names its
own state, since each has its silkscreen beside it, so printing the value
again beneath is duplication. The two states that need words are the `Mode`
layer, which has no lenses at all, and the sixth `LfoShape`: `S&H (LED off)`
reads under a dark column, which is what the instrument does, and pressing
from there rejoins the cycle at `Triangle`, the button's own cycle being the
five lit positions. Without the words, that state and a column that happens
to be dark would look alike.

**Every cap in the editor moved onto its row's knob centre line** because of
this box: the LFO's five-lens column made the mismatch visible where the
Oscillators' three-lens one had hidden it. See
[Button and LED construction](#button-and-led-construction) for the rule
that replaced it.

**The `Rate` knob sits under its button, not beside it.** The panel puts the
two side by side, but the editor's box is a column two rows deep like the
Oscillators beside it, and stacking them puts each control on a guide the
neighbouring section already uses: the `Wave shape` cap on the centre line
of the oscillator knobs in the upper row, the `Rate` knob on the lower row
with `Pulse Width` and the two PWM knobs. Side by side, the knob had a row
of its own and lined up with nothing.

Stacked, each half is a **single centred column** and the box is the
narrowest in the top band, which is the proportion the panel has. Prose does
not fit a column that narrow beside a control, so the `EG1 Mod` line sits in
a row of its own below the knob, and the box runs taller than the
Oscillators by roughly the height of those few lines. The line is kept short
for that reason; the knob's own description carries the full disagreement.

Each half is named at the left, in the same legend row as `OSC 1` and
`OSC 2` beside it. The five-lens column overhangs into that row, and clears
the name only because centring the button in a column wider than itself
moves the lenses to the right of it.

## LFO 3

Its own box in the bottom band, far left, under the LFO and Oscillator
boxes.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Wave shape` | — | Button + LED column (4) | `lfo3.shape` / CC 72 | `Lfo3Shape` — four variants, no S&H, and 32-wide CC zones rather than the 16-wide zones LFO 1/2 use. |
| `Rate` | — | Knob | `lfo3.rate` / CC 73 | |
| `Mod Wheel` | `Aftertouch` | Knob | `lfo3.modWheelMod` / CC 79; shift: `lfo3.aftertouchMod` / CC 78 | LFO 3's amplitude is zero by default (manual p.14); these two are the only things that raise it, which is why LFO 3 has no `Mode` and no depth knobs of its own. |

LFO 3 has no `Mode` control — the six sync modes are LFO 1/2 only, and
`Lfo3` has no `mode` field to match.

### How the box was built

**The panel's own single row survives here.** Unlike the LFO 1/2 box above,
which stacks each half into a column to stay on the Oscillators' row guides,
this box lines the button and its two knobs up left to right as the
silkscreen does: three controls in a shallow box is the proportion the bottom
band has, and there is no neighbouring section whose knob centres it has to
meet. It sits directly under the LFO box and on its left edge, wider than it
and reaching under the left of the Oscillators, which is where the panel puts
it.

**`Mod Wheel` and `Aftertouch` are described as what makes LFO 3 audible,
not as modulation depths.** Every other `Mod` control in the editor sets how
far one source moves a destination. These two set the LFO's own amplitude,
which is zero by default (manual p.14), so with both at zero the `LFO3 Mod`
knobs on the oscillators, filter and amplifier reach nothing however far they
are turned. The knobs' descriptions say so at the control, and while both
values are zero a line under the row says it in the box, where a user
wondering why LFO 3 does nothing will be looking. The line disappears as soon
as either is raised, so it costs the box no height once the instrument can be
heard.

**`Rate` reads as the raw value with no clock caveat.** LFO 1 and LFO 2's
rate knobs carry a sentence about the MIDI clock, since their sync modes
divide it. LFO 3 has no mode and no clock rate of its own — `Lfo3` holds only
`shape`, `rate`, `aftertouchMod` and `modWheelMod` — so the caveat would be
false here and the description says the rate is a plain frequency instead.

---

## Oscillators

The `OSCILLATORS` box holds `OSC 1` (top) and `OSC 2` (bottom). The two are
laid out identically: a two-button column on the left, then three knobs on the
upper row and three on the lower row.

**The two rules in this box mean different things.** A **dotted** rule runs
across each oscillator between its two knob rows, immediately under the upper
row's shift labels (`Transpose` / `EG1 Mod` / `LFO3 Mod`); a **solid** rule
separates `OSC 1` from `OSC 2`. An earlier reading of this sheet had the
dotted rule between the oscillators, which is wrong in both places — checked
against `e7-black-front.webp` at 3x.

`OSC 1` and `OSC 2` differ in exactly one place — the shift label on the
pulse button (`Autotuning` vs `Sync`).

**Neither button is silkscreened**, so the editor takes their names from the
user manual's own headings (p.7): `Waveform selector` and `Pulse generator`.
The waveform selector's fourth state — no LED lit — has no name in either
document; `OscWaveform`'s `none` variant is this project's word for it, not
GS Music's. Nothing documents how the panel button reaches that state either;
the editor cycles triangle → saw-tri → sawtooth → none, which is the only
4-state cycle a single button can offer, but it is an inference.

### OSC 1

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| (waveform selector, unlabelled) | — | Button + LED column (3) | `osc1.shape` / CC 14 | Selects triangle / saw-tri / sawtooth. All three LEDs off is a valid state: no waveform selected (manual p.7). That alone is `off` (CC 48-63) and silent — pulse-generator-only is the same three LEDs off *with* the pulse LED lit, `pulse` (CC 112-127). |
| (pulse generator, unlabelled) | `Autotuning` | Button + LED | `osc1.shape` / CC 14 (same byte); shift: **not addressable** | The pulse LED and the three waveform LEDs both read from `shape`; `OscShape` encodes the combination in its upper 3 bits — `oscShapeParts`/`oscShapeFromParts` split and rejoin the two buttons' states. Shift runs the ~2s oscillator auto-calibration — a device command with no preset byte, no CC, and no SysEx command either, so the editor has no equivalent of it. |
| `Tune` | `Transpose` | Knob | `osc1.tune` / CC 9; shift: `osc1.transpose` / CC 3 | `Tune` is ±½ semitone via the 128-entry millisemitone table. `Transpose` is ±24 semitones via the 49-band `Transpose` lookup. CC 3 drives this knob and not the preset's own `transpose` — see [Finding 3](#finding-3-cc-3-drives-osc-1-transpose-and-the-presets-own-transpose-has-no-cc). |
| `LFO1 Mod` | `EG1 Mod` | Knob | `osc1.lfo1Mod` / CC 22; shift: `osc1.eg1Mod` / CC 25 | Pitch modulation depth. |
| `LFO2 Mod` | `LFO3 Mod` | Knob | `osc1.lfo2Mod` / CC 23; shift: `osc1.lfo3Mod` / CC 24 | Pitch modulation depth. |
| (pulse width, unlabelled) | — | Knob | `osc1.pulseWidth` / CC 15 | No text label at all — two pulse-waveform glyphs sit below the knob, a narrow one at the left of its travel and a wider one at the right. 10%-50% duty cycle (manual p.8). Label it `Pulse Width` in the UI; the panel can rely on the glyphs and the editor can't. |
| `EG1 PWM` | — | Knob | `osc1.eg1Pwm` / CC 29 | |
| `LFO1 PWM` | — | Knob | `osc1.lfo1Pwm` / CC 26 | |

### OSC 2

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| (waveform selector, unlabelled) | — | Button + LED column (3) | `osc2.shape` / CC 34 | As OSC 1. |
| (pulse generator, unlabelled) | `Sync` | Button + LED | `osc2.shape` / CC 34; shift: `osc2Sync` / CC 51 | `osc2Sync` is a top-level `SinglePreset` field, not an `Oscillator` one — hard-sync is a relationship between the two oscillators, not a property of either. `OscSync`, 0-63 off / 64-127 on. |
| `Tune` | `Transpose` | Knob | `osc2.tune` / CC 31; shift: `osc2.transpose` / CC 30 | As OSC 1, on its own controller. |
| `LFO1 Mod` | `EG1 Mod` | Knob | `osc2.lfo1Mod` / CC 39; shift: `osc2.eg1Mod` / CC 42 | |
| `LFO2 Mod` | `LFO3 Mod` | Knob | `osc2.lfo2Mod` / CC 40; shift: `osc2.lfo3Mod` / CC 41 | |
| (pulse width, unlabelled) | — | Knob | `osc2.pulseWidth` / CC 35 | As OSC 1. |
| `EG1 PWM` | — | Knob | `osc2.eg1Pwm` / CC 46 | |
| `LFO1 PWM` | — | Knob | `osc2.lfo1Pwm` / CC 43 | |

**`lfo2Pwm` and `lfo3Pwm` are not parameters this instrument has.** Both have
a byte and a CC (OSC 1: 27, 28; OSC 2: 44, 45), and that is all they have: no
panel control, and no entry in the user manual, which names EG1 and LFO1 as
the only PWM sources (p.8). Confirmed by the instrument's owner — they do
nothing. The editor gives them no control; the bytes still round-trip
verbatim, as every byte in the layout does. See
[Finding 5](#finding-5-parameters-with-a-cc-and-no-control-behind-it).

---

## Mixer

Five knobs: a 2×2 grid, then `Noise/Ext` alone on a third row. The reading
order matches the field order in `Mixer`.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `OSC1` | — | Knob | `mixer.osc1Level` / CC 20 | |
| `Sub1` | — | Knob | `mixer.sub1Level` / CC 21 | Sub-oscillator **derived from OSC 1** — square wave, one octave below. Neither the field name nor the label says which oscillator it follows, so say it in the tooltip. |
| `OSC2` | — | Knob | `mixer.osc2Level` / CC 36 | |
| `Sub2` | — | Knob | `mixer.sub2Level` / CC 37 | Sub-oscillator **derived from OSC 2**. The user manual's p.8 entry reads "Sub-oscillator 1 level (derived from OSC2)" — the "1" is a typo in the document. Don't propagate the manual's wording. |
| `Noise/Ext` | — | Knob | `mixer.noiseLevel` / CC 52 | Label and field disagree, and both are right: the rear-panel External In disables the noise generator when a signal is plugged into it, and this knob then sets that external signal's level (manual p.8). Label the control `Noise/Ext`; put the reason in the tooltip, because no byte in the preset layout hints at it. |

---

## Filter

Four knobs on the top row (`Cutoff` is large and stands alone, left of a
dotted rule), three on the bottom row, offset half a knob pitch to the left
of the row above.

The dotted rule is **stepped**, not a single straight line: it runs down
between `Cutoff` and `EG1 Mod`, jogs one column to the right under the top
row's shift labels, then runs down again between `Resonance` and `Keyboard
tracking`. What it separates is the filter's own two parameters — `Cutoff`
and `Resonance` — from the modulation depths and tracking that act on the
cutoff.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Cutoff` | — | Knob (large) | `filter.cutoff` / CC 74 | 10 Hz - 25 kHz, 24 dB/oct low-pass. |
| `EG1 Mod` | `Velocity EG1 Mod` | Knob | `filter.eg1Mod` / CC 89; shift: `filter.velocityEg1Mod` / CC 86 | EG1 is the filter-oriented envelope (manual p.9). |
| `LFO1 Mod` | — | Knob | `filter.lfo1Mod` / CC 90 | The manual's LFO1 MOD entry on p.10 says "modulation from the EG1 to the cutoff frequency" — a copy-paste error in the document. It is LFO 1. |
| `LFO2 Mod` | `LFO3 Mod` | Knob | `filter.lfo2Mod` / CC 91; shift: `filter.lfo3Mod` / CC 92 | |
| `Resonance` | — | Knob | `filter.resonance` / CC 71 | CC 71 is bidirectional and undocumented — the printed CC table lists no Resonance at all. See [Finding 4](#finding-4-the-resonance-knob-is-writable-after-all). |
| `Keyboard tracking` | — | Knob | `filter.keyboardTracking` / CC 85 | |
| `Mod Wheel` | `Aftertouch` | Knob | `filter.modWheelMod` / CC 88; shift: `filter.aftertouchMod` / CC 87 | |

Every `Filter` field has a panel control. No gaps.

---

## Amplifier

Four knobs in a 2×2 grid. Every knob carries a shift layer, and the shift
layer of the bottom row is the stereo pair — which belongs to a different
part of the preset, see the notes.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `LFO1 Mod` | `Level` | Knob | `amp.lfo1Mod` / CC 103; shift: `amp.level` / CC 11 | CC 11 is standard Expression, reused here: "Controls amplifier level for current preset/part". Not the same as Master Volume. |
| `LFO2 Mod` | `LFO3 Mod` | Knob | `amp.lfo2Mod` / CC 104; shift: `amp.lfo3Mod` / CC 105 | |
| `Keyboard tracking` | `Stereo spread` | Knob | `amp.keyboardTracking` / CC 93; shift: `part1Only.stereo.spread` / CC 10 | Stereo Spread lives in `part1Only`, not `amp` — in a multi it is global, taken from part 1 only. Centre position = all voices equal in both channels. |
| `Velocity EG2 mod` | `Stereo motion` | Knob | `amp.velocityMod` / CC 94; shift: `part1Only.stereo.motion` / CC 119 | Field is `velocityMod`, panel and CC table both say `Velocity EG2 Mod`. Label from the panel. Stereo Motion is likewise `part1Only` and global in a multi; its depth is relative to Stereo Spread, so it does nothing at spread extremes. |

---

## Output

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Master Volume` | — | Knob (large) | **No `SinglePreset` field.** CC 7 (Volume) | The only control on the panel whose value is not part of a preset — it is a global output level, not saved and not restored by loading a preset. `CC_FIELDS` deliberately has no entry for it. See [Finding 2](#finding-2-master-volume-is-a-control-with-no-preset-field). |

---

## Voices

Directly under `OUTPUT`. **Indicator only** — no button, no knob, nothing to
press on the hardware.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `VOICES` | — | LED row (7) | `polyVoice` (byte 107) + `monoVoice` (byte 106), packed as CC 97 | Shows which of the 7 voices the current preset may use. Set from the Preset Menu (Shift + button 5) on the hardware, never from a panel control. |

The CC is packed: `16*V1 + V2`, where `V1` is the polyphonic selection
(0-4: All, Even, Odd, 1→7, 7→1) and `V2` the monophonic one (0-7: Free, then
voices 1-7). See `Voices` in `src/protocol/voices.ts`; V1 > 4 or V2 > 7 is
reserved, capping the legal CC at 71.

Which LEDs light for a given V1/V2 pair is not documented and not visible in
a still photograph. The editor should present the two selections directly —
a poly option and a mono option — rather than trying to reproduce the LED
row's logic. An `All`/`Free` preset presumably lights all seven; that is an
inference, not an observation.

**Built that way: two selectors, and no LED row at all.** The section draws
`Polyphonic voices` and `Monophonic voice` as menu selectors, because that is
what the parameter is — the panel's row is an output of the instrument's own
voice allocation, and nothing in the protocol reports it. Drawing seven
lenses lit from an inference would be the editor asserting something it
cannot know. The section says so where the row would have been. If hardware
work ever turns up a source for the row, the count to draw is 7.

A reserved pair reaches the editor two ways, and both are handled where they
arise rather than by relaxing `Voices`:

- **From a preset.** Bytes 106/107 are read straight out of device memory, so
  a preset holding `polyVoice` 6 makes even *reading* the field throw. The
  section decodes through `unlessReserved`, shows neither selection, and says
  the value is reserved; picking either selection replaces it.
- **From a control change.** The editor's inbound path ignores a CC value the
  field's own accessor rejects, rather than letting it through and failing
  mid-update. CC 97 above 71 therefore leaves the editor where it was.

---

## Envelope Generator 1

Four knobs in a row, with an ADSR curve silkscreened beneath them.

The curve is divided into four equal bands by five vertical dashed lines,
one band per knob, and **each knob is centred over its own band — the
dividers fall between the knobs, not under them**. Measured on
`e7-black-front.webp`: dividers at x = 1164, 1282.5, 1402, 1521, 1639, so
118.5-119.5px apart, against knob cap centres at 1223, 1345, 1462, 1581.5 —
each within 3px of its band's centre, under 3% of a band width.

The curve itself is **four straight segments**, not an exponential shape:
it rises from the baseline to the peak across the Attack band, falls to the
sustain level across the Decay band, holds flat across the Sustain band, and
falls back to the baseline across the Release band. Every corner is a hard
vertex on a divider. The silkscreen draws the sustain at roughly half the
peak height (16px of 31px), which is illustrative — it is a fixed drawing,
not a depiction of any stored value.

Each dashed line runs the full height of the strip and overshoots the curve
at both ends: from y = 1304, about 6px above the peak, to y = 1355, about
14px below the baseline and level with the section's bottom border. Five
dashes per line, roughly 4-5px long with 7px gaps.

There is no gate-pulse trace under the panel's curve — that appears only in
the user manual's envelope figure (p.12, labelled `ADSR` and `GATE PULSE`).

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Attack` | `Velocity mod` | Knob | `eg1.attack` / CC 16; shift: `eg1.attackVelocityMod` / CC 106 | |
| `Decay` | `Keyboard tracking` | Knob | `eg1.decay` / CC 17; shift: `eg1.keyboardTracking` / CC 117 | Keyboard tracking affects attack, decay **and** release together (manual p.13) — it is not a decay-specific parameter, it just shares the decay knob. |
| `Sustain` | — | Knob | `eg1.sustain` / CC 18 | The only EG knob with no shift layer, in both EGs. |
| `Release` | `Velocity mod` | Knob | `eg1.release` / CC 19; shift: `eg1.releaseVelocityMod` / CC 107 | Two knobs share the label `Velocity mod` on their shift layer; disambiguate in the UI (`Attack velocity mod` / `Release velocity mod`). |

EG1 is oriented to the filter cutoff, EG2 to the amplifier, but both can
modulate several destinations at once (manual p.4).

## Envelope Generator 2

Identical layout and identical labels to EG1.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Attack` | `Velocity mod` | Knob | `eg2.attack` / CC 80; shift: `eg2.attackVelocityMod` / CC 108 | |
| `Decay` | `Keyboard tracking` | Knob | `eg2.decay` / CC 81; shift: `eg2.keyboardTracking` / CC 118 | |
| `Sustain` | — | Knob | `eg2.sustain` / CC 82 | |
| `Release` | `Velocity mod` | Knob | `eg2.release` / CC 83; shift: `eg2.releaseVelocityMod` / CC 109 | |

`Envelope` is one shape used twice, so an `AdsrEditor` widget can be built
once and bound to either `eg1` or `eg2`.

What carries over to the editor is the straight-segment shape, the stage
order, and the strip spanning the width of its section. What does not is the
equal bands — a band's width is how the editor shows a time value, so the
bands move — or the dashed dividers, whose job the draggable stage handles
do instead. A stage at zero collapses its band to nothing and leaves a
vertical edge, which the silkscreen's fixed drawing never has to show.

---

## Chorus

The section header carries an enable LED to the right of the `CHORUS` title.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| (enable indicator) | — | LED (1) | **Nothing.** No field, no CC | There is no chorus on/off parameter anywhere — not in `Chorus`, not in the CC table, and `ChorusType` has only `basic` and `ensemble`, no `off`. See [Finding 6](#finding-6-the-chorus-and-delay-enable-leds-have-no-parameter-behind-them). |
| `Rate` | `Type` | Knob | `part1Only.chorus.rate` / CC 114; shift: `part1Only.chorus.type` / CC 113 | `ChorusType`: 0-63 Basic, 64-127 Ensemble — the two halves of one pot's travel. The editor keeps it on the knob's shift layer rather than substituting a toggle, and names the algorithm in the readout as the travel passes into it. |
| `Depth` | — | Knob | `part1Only.chorus.depth` / CC 115 | |
| `Mix` | — | Knob | `part1Only.chorus.mix` / CC 13 | Dry/wet. |

Chorus lives in `part1Only`: in a multi, the effect is global and only
part 1's values are used.

## Delay

Same shape as Chorus — enable LED in the header, three knobs, first one
carrying the type on its shift layer.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| (enable indicator) | — | LED (1) | **Nothing.** No field, no CC | Same as Chorus. See [Finding 6](#finding-6-the-chorus-and-delay-enable-leds-have-no-parameter-behind-them). |
| `Delay Time` | `Type` | Knob | `part1Only.delay.time` / CC 111; shift: `part1Only.delay.type` / CC 110 | `DelayType`: stereo, ping-pong, stereo-sync, ping-pong-sync — four even quarters of one pot's travel (0-31, 32-63, 64-95, 96-127). Same treatment as the chorus type: it stays on the knob's shift layer, with the type's name as the readout. In the two sync types the time value reads as a musical division (`DelayClockRate`), otherwise 50ms-1.35s. |
| `Feedback` | — | Knob | `part1Only.delay.feedback` / CC 112 | |
| `Mix` | — | Knob | `part1Only.delay.mix` / CC 12 | Dry/wet. |

Delay is `part1Only` for the same reason Chorus is.

**In the sync types, this knob runs backwards relative to LFO 1/2's `Rate`.**
Clockwise here goes from the shortest division to the longest — `1/32 Note` at
minimum, `Whole Note` at maximum — where the LFO rate knobs go the other way.
Both are the same 15 divisions in the same order; the delay's controller axis
is simply reversed, which `protocol-quirks.md` #20 records with the measured
bands. It is real hardware behavior rather than a labelling accident, so a
shared clock-division control that sweeps one direction for both is wrong on
one of them, and the two need opposite mappings from knob angle to value.

---

## Portamento / Polyphony modes

**The panel gives this block no title.** It sits under the Mixer, bounded by
its own rounded box, and holds the Mode button and the Portamento Time knob.
The heading above is the user manual's (p.16), not a silkscreen — don't
present it as one.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Mode` | *`Enter`* (menu only) | Button + LED column (4) | `mode` / CC 116 | LEDs are `Poly`, `ST`, `MT`, `Unison`. Five `OtherMode` variants across four LEDs — `Unison` lights together with `ST` or `MT`. Unison modes are unavailable in a multi (manual p.17). |
| `Portamento Time` | `Bend range`, and *`Value`* (menu only) | Knob | `portamento.time` / CC 5; shift: `pitchBendRange` / CC 50 | The only control with three labels. `pitchBendRange` is a top-level `SinglePreset` field, in semitones. |

**`portamento.on` (byte 48, CC 65) has no panel control.** There is no
portamento on/off button — see
[Finding 5](#finding-5-parameters-with-a-cc-and-no-control-behind-it).

**The editor gives it no control either — the Time knob carries it.** A
switch beside `Portamento Time` was built first and taken out again: it
invents a second control where the instrument has one, and the two can only
ever disagree in ways the user has to reason about (a glide time set with the
switch off does nothing). Instead the knob writes both bytes — crossing off
zero switches portamento on, returning to zero switches it off — so the
control the panel has always means what it says. The switch is only written
when the state actually changes, not on every step of a drag, and the knob's
description says at the control that it does this.

**What "on" is worth in that byte is an assumption, not a spec.** The MIDI
implementation gives CC 65 no zone table and the byte map only names the byte
`Portamento On`, so the editor writes 127 for on and 0 for off on the general
MIDI switch convention. Open question #23 in `protocol-quirks.md` and the HW
task behind it; a hardware session settles it by switching portamento from a
MIDI controller and reading byte 48 back.

Nothing reads byte 48 back into the UI, which is the deliberate half of this:
a preset arriving with the byte and the time disagreeing is left alone until
the user moves the knob, rather than the editor quietly rewriting a byte it
cannot yet interpret.

**The Mode button never writes the reserved range, and survives reading
one.** `OtherMode` reserves CC 80-127 and `mode` is a plain byte, so a device
or a preset can put a reserved value in front of the control. The section
decodes through `unlessReserved`: no LED lights, the readout says `Reserved`,
and the next press leaves it at `Polyphonic` — the first of the five zones —
rather than stepping from a value that has no meaning. Presses always send a
zone minimum (0, 16, 32, 48, 64).

Unison's two modes light two LEDs, which is why `LedStack` takes a set of
indexes rather than a single one. The full mode name sits under the button:
the LED names are the panel's four abbreviations, and `MT, Unison` is not the
same thing as reading `Unison, Multi Trigger`.

---

## Presets

Ten buttons in one row: two transport buttons, a gap, then eight numbered
ones. Every button has its own LED above it; the numbered buttons print
their digit immediately left of the LED.

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `Shift` | — | Button + LED | **Not addressable** | Modifier. Its LED stays lit while the shift layer is active. In the editor there is no shift layer — both labels are visible at once — so this button has no widget equivalent. |
| `Bank` | `Save` | Button + LED | **Not addressable** | `Bank` starts an address entry — three digit presses spelling out `X.Y.Z`. Shift+`Bank` = `Save`; held together it begins the save flow, and the Bank LED flashes while it is running. Saving in the editor is a library action, not this button. |
| `1` | `P1` | Button + LED | Program Change — see below | Shift selects multitimbral Part 1. |
| `2` | `P2` | Button + LED | Program Change | Shift selects Part 2. |
| `3` | `P3` | Button + LED | Program Change | Shift selects Part 3. |
| `4` | `P4` | Button + LED | Program Change | Shift selects Part 4. |
| `5` | *`Menu`* | Button + LED | Program Change | Shift+5 opens the Preset Menu (transpose, voices, copy preset, copy part). Menu-only, italic. |
| `6` | `Multi` | Button + LED | Program Change | Shift+6 enters Multitimbral Mode. |
| `7` | `Panel` | Button + LED | Program Change | Shift+7 returns to Panel Mode — the sound follows the physical knob positions rather than a preset. |
| `8` | `Config` | Button + LED | Program Change | Shift+8 opens Global Configuration (Rx/Tx channel, PB/PC/CC enables, clock source, MPE, soft thru, factory restore). |

Selecting a preset is Bank Select MSB/LSB + Program Change, resolved by
`resolveProgramChange` in `src/protocol/program-change.ts` — not a CC.
Addresses are `X.Y.Z`, from `1.1.1` to `8.8.8` for singles (512) and `1.1.1`
to `2.8.8` for multis (128). Factory presets occupy `1.1.1`-`1.7.8` (56) and
cannot be overwritten, though they can be edited and saved elsewhere. The
multi range has a factory block of its own and a much shorter one:
`1.1.1`-`1.1.8`, eight of the 128, per the manual's own count (p.21). Both
ranges are refused before a write is sent, so the first address a write can
land on is `1.8.1` for a single and `1.2.1` for a multi.

**The editor draws no `PRESETS` box at all.** This is the one panel block
with no section of its own, and the reason is that the app already has a
better version of it. What the numbered buttons do is what the manual gives
them (p.19): "Buttons 1 to 8 allow you to directly change Position" — a
position within the bank already selected. The device browser is exactly that
picker, with the kind, bank and group in front of it and, unlike eight
silkscreened digits, the slot's **name** read off the instrument. A row of
eight buttons in the editor would have been a strict subset of it, addressed
into whichever bank the browser was on anyway.

So the panel's function lives in the browser: every slot cell carries a
`Select` that sends the Bank Select MSB/LSB and Program Change for its
address, and the selected cell is marked.

**The shift layer's other half — `P1`-`P4` — lives in the editor instead.**
Shift + buttons 1 to 4 chooses which of a multi's four parts the panel is
editing (manual p.21), and that is a question about what the editor holds
rather than about which slot is playing, so it is drawn as a `Part` row of
four buttons at the top of the editor, present only while the preset in hand
came out of a multi. It has no LED equivalent to keep: the panel shows the
selected part on its display, and the row's pressed button says the same
thing. Reaching a part is not a read — all four arrived together with the
slot or the entry — so the row is exactly the panel's gesture without the
instrument in the loop. The manual's next sentence in the same paragraph is
what the part-1-only controls draw on: "The only controls that are global …
are the effects and the Stereo Spread and Stereo Motion controls."

**Deliberately not drawn as cap buttons and LEDs.** Building the cells out
of the panel's own widgets — a cap with its LED above and its position digit
under it, the `PRESETS` row's construction — was tried and rejected: the
device browser is a librarian view, not a picture of the panel, and putting
panel hardware in it made a list of names look like an instrument without
reading any better as either. The panel widgets belong in the editor's
sections. This pane stays plain controls.

The eight slots of the group in view are **read automatically** as soon as
they are reachable, one at a time through the same queue a manual read used,
and kept once read. A slot the device never answered for keeps a read of its
own, so one failure is recoverable without putting a read button back on the
other seven.

Three things to keep true of it:

- **It changes the instrument, not the editor.** The editor keeps the preset
  it has; nothing is loaded from the slot selected. Loading is a separate,
  explicit action and belongs to the preset-transfer work. The pane says so
  above the slots.
- **The marked slot is what the editor last selected, not what the instrument
  is playing.** No command reports the current preset, and a press on the
  hardware's own buttons is not transmitted. The mark clears when the browser
  moves to a group that does not hold the selected address.
- **Multi is the browser's kind.** With the browser on Multi the same action
  addresses multis, which is Bank Select MSB 1 — the same distinction the
  panel makes by entering Multitimbral Mode first, and a second reason the
  browser is the right home for this: it already carries the kind.

`Shift` and `Bank`/`Save` have no equivalent for the reasons in the table
above. Their absence is the point: there is no shift layer to hold, and
saving is a library action reached from the library, not a transport button.

**The manual and the code split the three digits differently.** The manual
(p.19) reads them as two parts: "The first two digits refer to the **Bank**
and the third to the **Position**." `PresetSlot` in `src/protocol/address.ts`
names all three separately — `bank`, `group`, `slot`. Same addresses, and
the code's naming is the one the app is built on, but the UI should show
users what the hardware shows them: a `X.Y.Z` address, not three labelled
fields borrowed from the type. Say "Bank" for `X.Y` together and "Position"
for `Z` if either needs a name in the interface.

Buttons 1-5 carry a **third** silkscreen row, a small outlined box under the
shift label, active only during the name-entry step of saving:

| Button | Glyph | Function (manual p.20-21) |
|---|---|---|
| `1` | not legible at photo resolution | Move the cursor back one character |
| `2` | not legible at photo resolution | Move the cursor forward one character |
| `3` | `-` | Previous character |
| `4` | `+` | Next character |
| `5` | `+/-` | Not described in the manual |

The two illegible glyphs are about 15px wide in a 2400px source and don't resolve
at any scale; the functions come from the manual's prose, which describes
what buttons 1-4 do while naming a preset without showing the glyphs.
Button 5's `+/-` appears on the panel and in no manual section. None of this
row matters to the editor — naming a preset in the library is a text field —
so it is recorded for completeness, not to be reproduced.

---

## Display

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| (untitled) | — | Display | **Not addressable** | Small OLED in its own box between `Noise/Ext` and Envelope Generator 1. Shows the parameter last touched — the photographed unit shows `EG1` with an ADSR curve and `A: 67  D: 34  S: 53  R: 37 / V: 36  K: 107  V: 18`, i.e. raw 0-127 byte values, not scaled units. There is no SysEx command to read or write it. |

The editor's equivalent is showing values at the controls themselves, not
one shared readout.

## MIDI activity LED

| Label | Shift | Widget | Binds to | Notes |
|---|---|---|---|---|
| `MIDI` | — | LED (1) | **Not addressable** | Lights on activity at either the DIN or the USB port (manual p.6). Nothing sets it and nothing reads it. The editor's connection bar already shows the same thing from the browser's side. |

---

## Findings

Six places where a control and a name disagree, or a control resolves to
nothing. Each is recorded rather than reconciled.

### Finding 1: `EG1 Mod` is silkscreened on LFO 2, but the byte is named LFO 1

**Raise before building the LFO section.** Four sources, and they don't
agree on which LFO this parameter modulates:

| Source | Says |
|---|---|
| Front panel | `EG1 Mod` is the shift layer of the **LFO 2** `Rate` knob. The LFO 1 block has no such control. |
| User manual p.14 | "EG1 MOD **(2)** — Sets how much the EG1 modifies the frequency of the **LFO2**." |
| MIDI implementation, CC table p.5 | LFO2 EG1 Mod = CC 67. No LFO1 EG1 Mod CC exists. |
| MIDI implementation, byte map p.25 | Byte 55 = "**LFO1** EG1 Mod". No LFO2 EG1 Mod byte exists. |

The byte map is self-consistent for LFO 1 — byte 55 sits inside the LFO 1
run (53 shape, 54 rate, 55 this, 58 mode), and bytes 61-63 in the LFO 2 run
are reserved. Everything else is self-consistent for LFO 2.

`src/protocol/preset.ts` follows the byte map: `lfo1.eg1Mod` at byte 55.
`src/protocol/cc.ts` defines `LFO2_EG1_MOD = 67` but `cc-map.ts` does not
wire it to any field, on the reading recorded as protocol-quirks #5 — that
CC 67 is a runtime-only parameter with no byte behind it.

The panel is new evidence that reading didn't have. There is exactly **one**
EG1→LFO knob on the hardware, **one** CC, and **one** byte. The simplest
explanation is now that all three are the same parameter — EG1 modulating
LFO 2's rate, persisted at byte 55 — and that the byte map's "LFO1" prefix
is the error, not the CC table's "LFO2".

What this blocks: the knob goes in the LFO 2 section either way (the panel
decides that). But if quirk #5 stands, a live edit to it writes an unmapped
CC and reaches the device through nothing, while `lfo1.eg1Mod` stays a
preset byte no control can touch. **HW-08 owns this** — send CC 67, then
read the preset back and watch byte 55. Until it is answered, don't rename
`lfo1.eg1Mod` and don't wire the knob to CC 67. Recorded as
protocol-quirks #5, whose runtime-only reading this pass contests.

The LFO section built to that instruction leaves the shift layer off the
knob entirely and puts the disagreement in a sentence under it, rather than
drawing a layer that writes nowhere.

### Finding 2: Master Volume is a control with no preset field

`Master Volume` is the only knob on the panel whose value is not part of a
preset. It is CC 7, a global output level — loading a preset does not move
it, and saving one does not capture it.

Not a defect; recorded because the UI has to treat it differently from every
other knob. It belongs in the shell (near the connection bar or as a global
strip), not inside a preset editor section that gets swapped when the user
loads a different sound. Writing to it is a device-level action with nothing
to write back to the library.

**Resolved for now: it is an `OUTPUT` section in the editor, where the panel
puts it, and its value lives outside the preset.** What the note above is
really guarding against is the value being conflated with a preset field,
and that is settled by where the value is kept rather than by where the knob
is drawn: master volume is its own slice of application state beside the
preset, never a `CcField`, so loading or saving a preset cannot touch it and
`CC_FIELDS` still has no entry for it. The editor's sections are not swapped
when a preset is loaded either — the preset data behind them changes and the
sections stay mounted — so the drift the note anticipated has nothing to act
on. Drawing it anywhere but the panel's own `OUTPUT` box would cost the one
thing the editor is trying to keep: a user finding a control where the
instrument has it. The knob sends CC 7 as it moves and follows an inbound
CC 7 if the instrument sends one; since nothing can read the level back, it
starts at full and says at the control that it shows what the editor has
sent.

### Finding 3: CC 3 drives OSC 1 Transpose, and the preset's own Transpose has no CC

The `Tune`/`Transpose` knob's shift layer is `osc1.transpose` (byte 20).
There is also a separate global `transpose` field at byte 105 — reachable
only from the Preset Menu on the hardware, with no panel control of its own.

**Both plausibly claimed CC 3; the hardware says it is the knob.** Serial
#361 moves byte 20 to exactly the value an inbound CC 3 carries and leaves
byte 105 alone, and the knob transmits CC 3 and nothing else; see
`protocol-quirks.md` #14 for the measurement. `cc-map.ts` resolves CC 3 to
`osc1Transpose` alone, so the Oscillators section's shift knob follows an
inbound CC 3 like any other control.

What the resolution takes away is the *other* field's controller. Byte 105
is driven by no CC in the printed table, so the editor has no live path to
it: SysEx cannot write volatile memory, which leaves writing a preset to
flash and loading it, or the Preset Menu on the panel. A control for it
still needs a home outside any panel section, and that control cannot behave
like the panel knobs around it.

**It is not the same parameter as the knob in a second way.** The panel's
`Transpose` shift layer is ±24 semitones through the 49-band CC lookup
(manual p.8); the Preset Menu's is **±48**, stored linearly as `64 + n` in
bytes 16-112 (manual p.19, hardware-confirmed — `protocol-quirks.md` #14).
Two controls, two ranges, two encodings, one silkscreened word. Label the
off-panel control so it cannot be read as the oscillator's, and give it
`presetTransposeFromByte` rather than the lookup the section knobs use.

### Finding 4: the Resonance knob is writable after all

`filter.resonance` / CC 71 was modelled **inbound-only** — the device was
understood to report front-panel resonance changes but not to accept them —
and the Filter section drew the knob dimmed and unturnable on that basis.

**The hardware says otherwise.** Serial #361 both receives CC 71 and
transmits it from the panel knob; see `protocol-quirks.md` #13 for the
measurement. `Resonance` is now an ordinary knob, turnable like every other
control in the section, and nothing in the panel is read-only for reasons of
CC direction.

What survives the correction is that **CC 71 is undocumented**: the printed
CC table has no Resonance row, so this controller is known only from the
instrument. Its number cannot be cited to a page the way every other CC in
the section can.

### Finding 5: parameters with a CC and no control behind it

Fields with a byte, a CC, and no hardware control:

| Field | CC | What it is |
|---|---|---|
| `osc1.lfo2Pwm` | 27 | **Not a parameter of this instrument** |
| `osc1.lfo3Pwm` | 28 | " |
| `osc2.lfo2Pwm` | 44 | " |
| `osc2.lfo3Pwm` | 45 | " |
| `portamento.on` | 65 | Real, and only the panel is missing it |

**The two groups are not the same thing, and the difference is what the user
manual says.** It describes `Portamento Time` with no on/off beside it, so
`portamento.on` is a parameter the front panel simply has no button for — an
opportunity the editor can take. It describes only EG1 and LFO1 as PWM
sources (p.8), and the instrument's owner confirms `LFO2 PWM` and `LFO3 PWM`
do nothing: those four are a byte map and a CC table reaching past the
firmware, not a gap in the panel.

So the editor gives the four no control at all, and the oscillator section
has exactly the panel's six knobs and two buttons per oscillator. The bytes
still round-trip, because every byte in the layout does.

Before offering a control for anything in this table, check the manual for
prose describing it. A byte and a CC are not evidence that a parameter
exists.

**`portamento.on` is written, without a control of its own.** The Portamento
Time knob carries it: the byte goes on as the time leaves zero and off as it
returns. It is the only row here the editor writes at all, and the only one
the manual describes as a parameter. The value written rests on the general
MIDI switch convention rather than on anything the e7's documents say — see
the Portamento / Polyphony section and open question #23.

`off-panel-parameters.md` is the full inventory of what the panel gives no
control for — this table, the menu-only parameters, the global configuration,
and the device commands — with what reaches each one.

Genuinely unreachable from the panel and from CC, for contrast:
`part1Only.name`, `part1Only.lock`, the whole of `partSettings` (multi
only), and global `transpose`. Those are SysEx or menu territory.

### Finding 6: the Chorus and Delay enable LEDs have no parameter behind them

Both effect sections carry an LED in their header, and neither `Chorus` nor
`Delay` has an on/off field. The CC table lists no chorus or delay enable.
`ChorusType` is `basic`/`ensemble` and `DelayType` is four delay flavours —
neither enum has an `off` variant.

So either the effect is switched by some panel gesture that isn't a
parameter, or the LED simply indicates a non-zero `mix`. Nothing in the
manual or the MIDI document says which. **HW-09 owns this**, recorded as
protocol-quirks open question #22.

For the editor this is a question about what to draw, not what to send: the
effect sections have no toggle to bind. Either omit the indicator, or drive
it from `mix > 0` and say so. Don't invent an `enabled` field to back it —
there is no byte to persist it in.

**Resolved for now: both sections draw the indicator, lit from `mix > 0`,
and say so at the indicator itself.** It is an indicator on the hardware and
it stays one here — nothing to press, no field behind it. Keeping it costs
nothing and preserves the section's shape; the tooltip is what stops it
reading as a parameter, since a lit LED that no byte backs is otherwise a
claim the editor cannot support. If HW-09 turns up a real enable gesture,
the indicator is already in place to bind to it.

---

## Coverage check

Every field in `SinglePreset`, and where it appears on this sheet:

| Group | Panel controls | Fields with no panel control |
|---|---|---|
| `osc1`, `osc2` | 6 knobs + 2 buttons each | `lfo2Pwm`, `lfo3Pwm` (both oscillators) — bytes only, not parameters, see Finding 5 |
| `osc2Sync` | OSC 2 pulse button, shift | — |
| `mixer` | 5 knobs | — |
| `portamento` | `Portamento Time` | `on` |
| `pitchBendRange` | `Portamento Time`, shift | — |
| `lfo1` | button + `Rate` | `eg1Mod` — contested, see Finding 1 |
| `lfo2` | button + `Rate` (+ shift) | — |
| `lfo3` | button + 2 knobs | — |
| `filter` | 7 knobs | — |
| `amp` | 4 knobs | — |
| `eg1`, `eg2` | 4 knobs each | — |
| `mode` | `Mode` button | — |
| `transpose` | — | Preset Menu only |
| `monoVoice`, `polyVoice` | `VOICES` LEDs (indicator) | Preset Menu only |
| `partSettings` | — | Multi menu only |
| `part1Only.delay` | 3 knobs | — |
| `part1Only.chorus` | 3 knobs | — |
| `part1Only.stereo` | Amplifier bottom row, shift | — |
| `part1Only.name` | Save flow | — |
| `part1Only.lock` | — | SysEx only |
| `reserved` | — | Not a parameter |

Panel controls with no `SinglePreset` field: `Master Volume` (CC 7),
`Autotuning` (device command), `Shift`, `Bank`/`Save`, buttons `1`-`8`
(Program Change), the Chorus and Delay enable LEDs, the display, and the
MIDI activity LED.
