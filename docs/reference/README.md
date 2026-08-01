# Reference documents

This project implements the MIDI specification published by GS Music for the
e7 synthesizer. The official documents and product photography are not
redistributed in this repository — download them directly from GS Music.

## Required downloads

Place the following files in this directory (`docs/reference/`):

- `GS-e7_Users_Manual_EN.pdf` — user manual
- `GS-e7_MIDI_implementation.pdf` — MIDI implementation spec

## Optional: panel photography

The editor UI is designed against photographs of the physical instrument.
They are not needed to build or run the app, only to work on the UI. Place
them in `docs/reference/panel/`, named by finish and view:

| File | Use |
|---|---|
| `e7-black-front.webp` | Primary layout reference — near-orthographic, high resolution |
| `e7-black-angle.webp` | Knob cap, pointer, and tick-arc detail |
| `e7-black-back.webp` | Rear panel connectors |
| `e7-black-left.webp`, `e7-black-right.webp` | Chassis and end-cheek detail |
| `e7-blue-front.webp` | Blue-finish color matching only — too low-resolution for layout |

`docs/panel-layout.md` is the derived, committed summary of what the front
photo shows — section grouping, control order, and the silkscreened shift
labels. Work on the UI from that sheet; reach for the photographs when the
sheet is silent or looks wrong, and update the sheet when it does.

## Where to get them

Everything above is available from the GS Music website:
[gsmusic.com.ar](https://www.gsmusic.com.ar/)

Look for the e7 product page — the documents are in its documentation,
downloads, or support section, and the photographs are in the product
gallery on the page itself. The filenames in the table are this project's
own convention, not GS Music's; match them by view when saving. If the
links are hard to find, contact GS Music at info@gsmusic.com.ar.

## Why these matter

The MIDI implementation document is the authoritative source for all
protocol behavior encoded in `src/protocol`. Each task's References section
in the backlog and the fixture/round-trip tests tie an implementation back
to the page it derives from — code itself carries no inline citations.

The photographs play the same role for the UI that the spec plays for the
protocol: they are where the panel's own vocabulary and control layout come
from, rather than names invented here.

## Version

This project targets the MIDI implementation dated 2022-09-22. If GS Music
publishes a revised specification, check `CHANGELOG.md` and
`../protocol-quirks.md` for any behavioral differences.
