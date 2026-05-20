# vediogen

A Remotion experiment for generating vertical marketing/poster videos with scrolling typography, a translucent ribbon path, BGM, and palette changes.

## Preview

The main composition is `MarketingRibbonVideo`:

- 1080 x 1920
- 30 fps
- 18 seconds
- BGM-driven color scheme changes
- Horizontal full-screen poster layout scrolling
- Single animated ribbon with text following the path

## Getting Started

Install dependencies:

```bash
npm install
```

Open Remotion Studio:

```bash
npm run dev
```

Render the video:

```bash
npm run render
```

Render a still frame:

```bash
npm run still
```

Run checks:

```bash
npm run lint
```

## Project Structure

- `src/Composition.tsx` - the video composition, typography layout, ribbon motion, BGM, and palette timing.
- `src/Root.tsx` - Remotion composition registration.
- `public/hazy-after-hours.mp3` - demo BGM used by the composition.
- `public/BGM_SOURCE.txt` - source and license note for the demo BGM.

## BGM

The bundled demo track is "Hazy After Hours" from Mixkit free stock music.

- Source: https://mixkit.co/free-stock-music/tag/fashion/
- Asset URL: https://assets.mixkit.co/music/132/132.mp3
- License: https://mixkit.co/license/

The MIT license in this repository applies to the source code. The bundled music remains under Mixkit's license.

## License

MIT
