# Engineering pass — design

> 2026-10-25. Source: architecture review (codebase-design), correctness review
> (`/code-review src/ high`), security pass, and the user's readability
> requirements. Implemented by
> `docs/superpowers/plans/2026-10-25-engineering-pass.md`.

## Goal

Keep the extension's behaviour exactly as shipped in 1.0.0 (plus the bug
fixes below), while making it a well-engineered project: strict TypeScript,
small deep modules with their own tests, enforced naming and formatting, and
no shared globals.

## Decisions

### Stack
- TypeScript 6.0 (`strict`), bundled by esbuild 0.28 into one IIFE content
  script `build/content.js`. TypeScript 7 is out but typescript-eslint 8.72
  supports `<6.1.0`, so 6.0 is pinned.
- Tests: Node 24's built-in runner on `.ts` files (native type stripping), jsdom
  30 for anything that touches the DOM. No Jest/Vitest.
- ESLint 10 (flat config) + typescript-eslint, Prettier 3. `npm run check`
  runs type-check, lint, format check and tests; packaging runs it first.
- No runtime dependencies. No UI framework: injected UI stays plain DOM.

### Readability (enforced)
- No single-letter identifiers and no abbreviations. ESLint `id-length`
  (min 3, exception `id`) and `id-denylist` (`lo hi el elem attr attrs btn sig
  opts res cur num idx val tmp cfg ctx evt err elev dist ele pts nd cs fn cb
  arr obj str`).
- Units are spelled into names where a number has one: `distanceMetres`,
  `durationSeconds`, `climbRiseMetres`.
- Same rules for tests and `scripts/*.py`.

### Module layout

```
src/
  main.ts                    entry: observers, scan loop, page switching
  settings.ts                marker attribute, stored settings, debug log
  units.ts                   unit conversion and number formatting
  math/distance.ts           haversine, cumulative distance
  math/elevation-curve.ts    cumulative climb, pinning, scaling, interpolation
  math/climbs.ts             climb detection
  elevation-model.ts         source -> { gain, loss, climbs }  (pure, cached)
  tooltip/tooltip-text.ts    reading Strava's tooltip text
  tooltip/tooltip-rows.ts    adding rows to Strava's tooltip
  tooltip/crosshair.ts       distance under the crosshair
  strava/chart-props.ts      chart data from React props
  strava/embedded-route.ts   route data from __NEXT_DATA__
  strava/activity-streams.ts activity streams request
  strava/route-gpx.ts        route GPX request
  strava/loader.ts           load-once-with-retry
  pages/page.ts              StravaPage interface + detectPage
  pages/activity-page.ts, pages/route-page.ts, pages/route-builder-page.ts
  ui/climb-bands.ts, ui/climbs-panel.ts, ui/splits-toggle.ts
```

Rules: only `main.ts` and `settings.ts` read globals (`document`, `window`,
`location`, `localStorage`, `fetch`); every other module takes elements and
dependencies as parameters and creates nodes via `element.ownerDocument`.
Files stay under ~250 lines.

> As built (ruling R1): a separate `src/content-entry.ts` is the bundle's entry
> and the only module that reads globals; `main.ts` exports `start(environment)`
> so tests can drive it, and `settings.ts` takes its storage as a parameter.
> ESLint's `no-restricted-globals` enforces this for the rest of `src/`. The
> marker attribute and other shared DOM names live in `src/dom-markers.ts`,
> and `strava/chart-props.ts` became `strava/chart-properties.ts`.

### Seams
- **StravaPage** (three real adapters: activity, route, route builder) holds
  everything page-specific: where profile data comes from, where the climbs
  UI goes, whether there is a splits table. Strava redesigning one page
  changes one file.
- **Tooltip rows** owns the "Strava's own attribute value" tracking. Callers
  call `show(tooltip, rows)`; no ordering rules leak into the scan loop.
- **Elevation model** is pure: given a `ProfileSource` it returns the gain
  and loss curves and numbered climbs. All Strava-total rules live here.

## Bug fixes (from the correctness review)

1. Route page backup data is used when the chart's React props can't be read
   (embedded route data, then GPX).
2. Failed loads retry (2 s, 5 s, 15 s) instead of giving up until navigation.
3. Activity streams need numeric `distance` and `altitude` of equal length,
   else no profile (no exceptions every frame).
4. A headline total that appears after first render is picked up (model cache
   is keyed by elevation array *and* headline total).
5. Cumulative climb no longer drops up to one threshold at the top of each
   climb: `[0, 6, 9, 3]` with threshold 5 gives 9.
6. A tracked attribute that Strava removes clears its stored base instead of
   storing `"null"` (no `NaN` positions).
7. One interpolation function, shared by curves and climb detection.
8. Band insertion uses one "child of the plot group" helper.

Not accepted: per-frame tooltip search and chart pass cost (measured 0.2–0.7 ms
and 0.06 ms against a 50 ms long-task budget).

## Compatibility
- Stored settings keep their keys and values: `cumulative-gain:climbs` =
  `on`/`off`, `cumulative-gain:splits` = `gainloss`/`net`,
  `cumulative-gain:debug` = `1`.
- Manifest permissions unchanged (content script on `https://www.strava.com/*`,
  `world: MAIN`); only the script path changes to `build/content.js`.
- Version becomes 1.1.0 only if 1.0.0 has been published by then; otherwise
  it stays 1.0.0 (unpublished).
