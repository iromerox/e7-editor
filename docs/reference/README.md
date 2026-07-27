# Reference documents

This project implements the MIDI specification published by GS Music for the
e7 synthesizer. The official documents are not redistributed in this
repository — download them directly from GS Music.

## Required downloads

Place the following files in this directory (`docs/reference/`):

- `GS-e7_Users_Manual_EN.pdf` — user manual
- `GS-e7_MIDI_implementation.pdf` — MIDI implementation spec

## Where to get them

Both documents are available from the GS Music website:
[gsmusic.com.ar](https://www.gsmusic.com.ar/)

Look for the e7 product page and check the documentation, downloads, or
support section. If the links are hard to find, contact GS Music at
info@gsmusic.com.ar.

## Why these matter

The MIDI implementation document is the authoritative source for all
protocol behavior encoded in `src/protocol`. Every exported type/function
there cites the specific page it derives from.

## Version

This project targets the MIDI implementation dated 2022-09-22. If GS Music
publishes a revised specification, check `CHANGELOG.md` and
`../protocol-quirks.md` for any behavioral differences.
