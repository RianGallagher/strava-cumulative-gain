# Strava Cumulative Elevation Gain

Chrome extension (MV3) that adds **Gain** and **Loss** rows to Strava's
elevation-profile tooltip: elevation gained and lost from the start up to the
point you're hovering.

Works on activity pages, saved route pages, and the route builder.

It also adds:

- **Climbs**: detected climbs are shaded and numbered on the elevation chart,
  the tooltip shows which climb you're on ("Climb 4: 2.7 km · 14.0%"), and a
  Climbs table lists start, length, gain and average/max grade (plus time and
  VAM on activities). Hovering a table row highlights its band. The builder
  gets the bands and tooltip row only.
- **Split gain/loss**: on activities, click the Splits table's Elev header to
  switch that column between Strava's net value and "+gain/−loss" for each
  split (the net figure hides ups and downs). The choice is remembered.

## Install

1. `chrome://extensions` → enable Developer mode
2. **Load unpacked** → select this folder

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

- **Climb detection** (`src/climbs.js`) resamples to 10 m, smooths over 60 m,
  and grows a climb from a low point while dips stay under max(10 m, 10% of
  the rise so far). Flat run-ins/outs are trimmed, and an 800 m stretch that
  stays within 6 m splits a climb. Climbs need ≥ 30 m, ≥ 200 m long and ≥ 3%
  average. Gain is read off the gain curve, so it agrees with the tooltip.

## Debug

```js
localStorage.setItem("cumulative-gain:debug", "1") // then reload
window.__cumulativeGain.fetched                    // activity / route fallback data
```

## Test

```sh
npm test
```
