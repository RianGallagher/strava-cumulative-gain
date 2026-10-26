# Cumulative Elevation for Strava

Chrome extension (MV3) that adds **Gain** and **Loss** rows to Strava's
elevation-profile tooltip: elevation gained and lost from the start up to the
point you're hovering.

Works on activity pages, saved route pages, and the route builder.

Also:

- **Climbs** (opt-in): tick the small "Show climbs" checkbox (under the chart on
  activities, above Segments on routes, beside "Hide Elevation" in the
  builder). The choice is saved in localStorage and applies everywhere.
  Detected climbs are shaded and numbered on the elevation chart,
  the tooltip shows which climb you're on ("Climb 4: 2.7 km · 14.0%"), and a
  Climbs table lists start, length, gain and average/max grade (plus time and
  VAM on activities). Hovering a table row highlights its band. The builder
  gets the bands and tooltip row only.
- **Split gain/loss**: on activities, click the Splits table's Elev header to
  switch that column between Strava's net value and "+gain/−loss" for each
  split (the net figure hides ups and downs). The choice is remembered.

## Install

1. `npm install && npm run build` (writes `build/content.js`, the bundled
   content script the manifest loads)
2. `chrome://extensions` → enable Developer mode
3. **Load unpacked** → select this folder

After changing the sources, run `npm run build` again (or keep `npm run dev`
running, which rebuilds on save) and reload the extension.

## How it works

- **Data**
  - Route page and route builder: the `distance`/`elevation` arrays React
    passes to Strava's chart, plus the route's legs, each carrying Strava's own
    `elevationGain`. In the builder this updates live as you edit. On the
    route page the legs come from `__NEXT_DATA__`; the 200-point GPX export is
    only a last resort.
  - Activities: `/activities/:id/streams` (distance + altitude), scaled to the
    page's "Elevation" total.
- **Gain** is computed with a 1 m hysteresis threshold (ignores noise), then
  pinned to Strava's figures: at every route leg boundary (~50 m apart), and to
  the headline total where the page shows one. Hover values therefore agree
  with Strava's own numbers.
- **Loss** is the same calculation on the inverted profile, pinned to the legs'
  `elevationLoss`. Where Strava only shows a gain total (activities, route
  page), the loss total is derived from it so that gain − loss equals the net
  elevation change.
- **Hover position** comes from the crosshair's x position against the axis
  ticks (pixel-precise), falling back to the tooltip's rounded "Dist" label.
- **Tooltip**: found by its text (Distance + Elevation + Grade), not by CSS
  classes. "Gain" and "Loss" rows are cloned from the Elevation row, the rows
  below are shifted down and the box is grown to fit.

- **Climb detection** (`src/math/climbs.ts`) resamples to 10 m, smooths over 60 m,
  and grows a climb from a low point while dips stay under max(10 m, 10% of
  the rise so far). Flat run-ins/outs are trimmed, and an 800 m stretch that
  stays within 6 m splits a climb. Climbs need ≥ 30 m, ≥ 200 m long and ≥ 3%
  average. Gain is read off the gain curve, so it agrees with the tooltip.

## Architecture

Strict TypeScript in `src/`, bundled by esbuild into one content script,
`build/content.js`, that runs in the page's main world (so it can read the
props React passes to Strava's charts). No runtime dependencies.

- `content-entry.ts` is the bundle's entry and the only file that reads the
  browser's globals; it calls `start()` in `main.ts` with them.
- `main.ts` wires everything: one MutationObserver schedules at most one pass
  per animation frame; each pass decorates every elevation chart and fills
  every profile tooltip. A client-side navigation gets a fresh page adapter.
- `pages/` holds one adapter per Strava page (activity, route, route builder)
  behind the `StravaPage` interface: where the profile comes from, where the
  climbs UI goes, whether there is a splits table. A Strava redesign of one
  page changes one file.
- `strava/` reads Strava's data: chart props, the embedded route, activity
  streams, the GPX export, and a load-once-with-retry loader.
- `math/` is pure: distances, the cumulative gain curve with its pinning and
  scaling, and climb detection. `elevation-model.ts` turns a profile into gain
  and loss curves and numbered climbs, cached per profile.
- `tooltip/` reads Strava's tooltip text, finds the crosshair, and adds the
  rows while tracking Strava's own attribute values.
- `ui/` draws the climb bands, the climbs panel and the splits toggle.
- `settings.ts` holds the stored settings and the debug log; `units.ts` the
  unit conversion and formatting.

Coding standards (naming, units in names, globals) are in `CLAUDE.md`.

## Debug

```js
localStorage.setItem("cumulative-gain:debug", "1") // then reload; errors are logged
localStorage.removeItem("cumulative-gain:climbs")   // reset climbs to off
localStorage.removeItem("cumulative-gain:splits")   // reset splits to net
```

## Test

```sh
npm run check   # type-check, lint, format check and tests
npm test        # tests only
```

## Publishing

```sh
npm run package   # runs the checks, builds, then zips dist/cumulative-elevation-for-strava-<version>.zip
```

Upload that zip in the Chrome Web Store Developer Dashboard. Listing copy,
permission justification, privacy answers, asset status and version history
are in `CHROMEWEBSTORE.md`; the privacy policy is `PRIVACY.md`.

Regenerating assets (needs Pillow: `pip install pillow`):

```sh
python scripts/make_icons.py         # icons/icon{16,48,128}.png
python scripts/make_store_images.py  # store/images/* from store/captures/*
```

Bump `version` in `manifest.json` for each new upload.
