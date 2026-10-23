# b-side

One record pressed every night. Each date in Chișinău gets a jazz-label sleeve, about a minute and
a half of jazz-hop, and a cut-paper title sequence cut to the music. Nothing is stored: the date is
the seed, and the same night always gives the same record.

![The title sequence of record no. 1, The Velvet Key](docs/demo.gif)

<sub>Record no. 1, drawn frame by frame by the site itself (`node scripts/media.mjs`). The GIF has no sound.</sub>

**Listen:** [iliev-blnk.github.io/b-side](https://iliev-blnk.github.io/b-side/). Tonight's record
is at the top and every earlier night is on the shelf below. Any night has its own link, like
[`#2026-10-23`](https://iliev-blnk.github.io/b-side/#2026-10-23).

## How a night becomes a record

- **The pressing.** The date seeds a small PRNG (cyrb128 into sfc32), forked into separate streams so
  that changing one decision never shifts another. It picks a mood (noir, chase or sad), a title and
  two more track names from a word bank, a palette from eight paper colours, and one of four sleeve
  layouts.
- **The music.** Each mood sets a tempo range (noir 66–74 bpm, chase 92–100, sad 62–70), a swing and
  a set of progressions. The score has an intro, an A section, a bridge and an outro, voiced for
  drums, bass, piano or electric piano, and sometimes a lead (tenor sax, vibraphone or harmonica). It plays
  through recorded samples and a lo-fi chain built in Web Audio: lowpass, tape saturation, wow and
  flutter, a small room, a compressor and vinyl crackle.
- **The picture.** The score marks its hits, the beats where something lands, and the title sequence
  cuts on them: a cold open, the title card when the tune comes in, a montage with the band
  credited on the first shots, and an end card when the outro starts. Shots hold for a bar or more
  (two in sad records) unless a new section forces the cut. Everything is drawn on a canvas as
  cut paper: scissor-rough edges, paper shadows, a side light and grain, re-laid at 12 frames a
  second the way stop-motion is shot on twos.

With reduced motion turned on, the record plays over its sleeve and nothing moves.

## Old records never change

The generator is versioned. When it changes after launch, the new version takes over from a given
date and the old one stays in `src/record/press.ts`, so every earlier night still plays exactly as
it was first pressed. `test/episode.test.ts` pins hashes of the first pressings to hold this.

## Running it

Node 24 and pnpm.

```sh
pnpm install
pnpm dev          # the site
pnpm test         # dates, titles, scores, cut lists, pinned pressings
pnpm smoke        # plays records in Chromium like a visitor would
pnpm render       # renders records offline and checks their levels
node scripts/stills.mjs 2026-10-23 --size=540x960   # frames and sleeves, for looking without playing
```

The scripts that open a browser expect Chromium at `/usr/bin/chromium` (or set `CHROMIUM`).

## Credits

The samples come from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL)
(CC0); see [CREDITS.md](CREDITS.md). The type is [Jost](https://github.com/indestructible-type/Jost)
(OFL). Code under the [MIT licence](LICENSE).
