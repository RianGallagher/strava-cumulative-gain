# Strava Cumulative Elevation Gain

Chrome extension (MV3) that adds a **Gain** row to Strava's elevation-profile
tooltip: elevation gained from the start up to the point you're hovering.

Works on activity pages, saved route pages, and the route builder.

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
  pinned to Strava's figures: at every route leg boundary (~50 m apart), or to
  the activity total. Hover values therefore agree with Strava's own numbers.
- **Hover position** comes from the crosshair's x position against the axis
  ticks (pixel-precise), falling back to the tooltip's rounded "Dist" label.
- **Tooltip**: found by its text (Distance + Elevation + Grade), not by CSS
  classes. A "Gain" row is cloned from the Elevation row, the rows below are
  shifted down a line and the box is grown to fit.

## Debug

```js
localStorage.setItem("cumgain:debug", "1") // then reload
window.__cumgain.fetched                    // activity / route fallback data
```

## Test

```sh
npm test
```
