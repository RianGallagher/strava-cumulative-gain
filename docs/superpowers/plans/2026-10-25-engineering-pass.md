# Engineering Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the extension as strict TypeScript modules with enforced naming, full tests and the eight review fixes, without changing what users see.

**Architecture:** New modules are written beside the legacy `src/*.js` (which keeps running from the manifest) and tested on their own. Task 11 switches the manifest to the esbuild bundle and deletes the legacy files. Page-specific knowledge sits behind a `StravaPage` interface with three adapters; tooltip mutation and Strava-total rules each live in one deep module.

**Tech Stack:** TypeScript 6.0.3, esbuild 0.28.2, Node 24 test runner (native `.ts`), jsdom 30.1.3, ESLint 10.13.0 + typescript-eslint 8.72.0, Prettier 3.9.10.

**Spec:** `docs/superpowers/specs/2026-10-25-engineering-pass-design.md`

## Global Constraints

- No single-letter or abbreviated identifiers anywhere (src, test, scripts). ESLint `id-length` min 3 (exception `id`), `id-denylist`: `lo hi el elem attr attrs btn sig opts res cur num idx val tmp cfg ctx evt err elev dist ele pts nd cs fn cb arr obj str`.
- Numbers with units carry the unit in the name (`distanceMetres`, `durationSeconds`).
- Only `src/main.ts` and `src/settings.ts` may read `document`, `window`, `location`, `localStorage` or `fetch`. Other modules take them as parameters and create nodes with `element.ownerDocument`.
- Files under ~250 lines. No runtime dependencies.
- Stored settings unchanged: `cumulative-gain:climbs` = `on`/`off`, `cumulative-gain:splits` = `gainloss`/`net`, `cumulative-gain:debug` = `1`.
- Marker attribute stays `data-cumulative-gain`.
- `tsconfig`: `strict`, `module: "preserve"`, `moduleResolution: "bundler"`, `allowImportingTsExtensions`, `noEmit`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`. Relative imports use `.ts` extensions.
- Every task ends with `npm run check` passing and a commit. Commit messages end with the session's Co-Authored-By line.

## Review Focus

- **Imperial units** (mi/ft in tooltips, "MI" splits header): tests in Tasks 2 and 10.
- **Activity without altitude** (treadmill, indoor): Task 8 test, no profile and no exception.
- **Navigating between Strava pages without a reload** (activity → route): Task 11 test, old page data never shown on the new page.
- **Profiles with no climbs, and two-point profiles**: Tasks 4, 5 and 10 tests ("No climbs detected" row, no throw).
- **Strava removing and re-creating the tooltip** (React unmount on mouse leave): Task 7 test, rows re-added once, not duplicated.

---

### Task 1: Tooling, standards and test harness

**Files:**
- Modify: `package.json`, `.gitignore` (add `build/`)
- Create: `tsconfig.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `scripts/build.mjs`, `CLAUDE.md`, `test/support/dom.ts`, `test/support/dom.test.ts`

**Interfaces:**
- Produces: `createTestDocument(html: string, url?: string): { window: DOMWindow; document: Document }` (jsdom with `pretendToBeVisual`, `SVGElement.prototype.getBBox` stubbed to `{ x: 0, y: 0, width: 100, height: 13 }`); `setBoundingRect(element: Element, rect: { left: number; top: number; width: number; height: number }): void`; `flushFrames(window): Promise<void>` (resolves after two animation frames).
- Produces: npm scripts `build`, `dev` (esbuild watch), `typecheck` (`tsc`), `lint` (`eslint .`), `format`, `format:check`, `test` (`node --test "test/**/*.test.ts"`), `check` (typecheck + lint + format:check + test).

- [ ] **Step 1:** Add devDependencies at the pinned versions above plus `@types/jsdom@30.0.0`, `@types/node@26.6.5`, `@eslint/js@10.0.1`; run `npm install`.
- [ ] **Step 2:** Write `tsconfig.json` (Global Constraints values; `include: ["src/**/*.ts", "test/**/*.ts"]`), `eslint.config.js` (recommended + typescript-eslint `strictTypeChecked`, the naming rules, ignores `src/*.js`, `test/*.test.js`, `build`, `dist`, `scripts/*.py`), Prettier config (`printWidth: 110`).
- [ ] **Step 3:** `scripts/build.mjs`: esbuild `src/main.ts` → `build/content.js`, `bundle: true`, `format: "iife"`, `target: "chrome120"`, `--watch` flag for `dev`. `src/main.ts` is a placeholder with no side effects until Task 11.
- [ ] **Step 4:** Write `CLAUDE.md` with the coding standards (naming, unit suffixes, globals rule, module size, tests at module interfaces, `npm run check` before commit). Use the `mattpocock-skills:writing-for-agents` skill.
- [ ] **Step 5:** Write `test/support/dom.test.ts`: `getBBox` returns width 100 on an `<text>` created by `createTestDocument`; `setBoundingRect` makes `getBoundingClientRect().left` return the set value; `flushFrames` resolves.
- [ ] **Step 6:** Run `npm run check`. Expected: all pass (legacy JS ignored by lint/tsc; legacy `test/*.test.js` not matched by the `.ts` glob, so also run `node --test test/*.test.js` once to confirm the 26 legacy tests still pass).
- [ ] **Step 7:** Commit `chore: add TypeScript, ESLint, Prettier, esbuild and coding standards`.

### Task 2: Units and tooltip text

**Files:**
- Create: `src/units.ts`, `src/tooltip/tooltip-text.ts`, `test/units.test.ts`, `test/tooltip/tooltip-text.test.ts`

**Interfaces:**
- Produces (`units.ts`): `type DistanceUnit = "km" | "mi"`; `type ElevationUnit = "m" | "ft"`; `METRES_PER_UNIT: Readonly<Record<"km" | "mi" | "m" | "ft", number>>`; `formatElevation(metres: number, unit: ElevationUnit): string`; `formatDistance(metres: number, unit: DistanceUnit, decimalPlaces: number): string`; `formatGrade(ratio: number): string`; `formatDuration(seconds: number): string`.
- Produces (`tooltip-text.ts`): `interface ShownDistance { metres: number; unit: "km" | "mi" | "m" | "ft"; resolutionMetres: number }`; `parseShownDistance(text: string): ShownDistance | null`; `parseElevationUnit(text: string): ElevationUnit | null`; `isProfileTooltip(text: string): boolean`.

- [ ] **Step 1:** Port `test/parse.test.js` to the two new test files with the new names (same assertions, including the activity / route / builder / imperial tooltips and the stats header that must not match). Add: `parseShownDistance("Dist: 6.0 km…").resolutionMetres === 100`; `formatElevation(1328.6, "m") === "1,329 m"`; `formatDistance(1609.344, "mi", 1) === "1.0 mi"`.
- [ ] **Step 2:** Run `npm test` — FAIL (modules missing).
- [ ] **Step 3:** Implement both files from `src/parse.js`, regexes unchanged, names per constraints.
- [ ] **Step 4:** `npm run check` — PASS. Commit `feat: units and tooltip text modules`.

### Task 3: Distance and elevation curve (fixes review 5 and 7)

**Files:**
- Create: `src/math/distance.ts`, `src/math/elevation-curve.ts`, `test/math/distance.test.ts`, `test/math/elevation-curve.test.ts`

**Interfaces:**
- Produces (`distance.ts`): `interface LatLon { latitude: number; longitude: number }`; `haversineMetres(start: LatLon, end: LatLon): number`; `cumulativeDistances(points: readonly LatLon[]): number[]`.
- Produces (`elevation-curve.ts`):
  - `interpolateAt(positions: readonly number[], values: readonly number[], position: number): number` (clamps at ends; zero-width step returns the lower value)
  - `cumulativeClimb(elevations: readonly number[], thresholdMetres: number): number[]`
  - `scaleToTotal(values: readonly number[], totalMetres: number | undefined): number[]`
  - `interface Checkpoint { distanceMetres: number; cumulativeMetres: number }`
  - `pinToCheckpoints(distances: readonly number[], values: readonly number[], checkpoints: readonly Checkpoint[]): number[]`
  - `interface RoutePath { length: number; elevationGain?: number; elevationLoss?: number }`; `interface RouteLeg { paths: readonly RoutePath[] }`
  - `legCheckpoints(legs: readonly RouteLeg[], chartLengthMetres: number, field: "elevationGain" | "elevationLoss"): Checkpoint[] | null`
  - `interface ElevationCurve { valueAt(distanceMetres: number): number }`
  - `buildElevationCurve(distances: readonly number[], elevations: readonly number[], options: { thresholdMetres: number; checkpoints?: readonly Checkpoint[] | null; totalMetres?: number }): ElevationCurve` — pin to checkpoints if given, then scale to total if given.

- [ ] **Step 1:** Port `test/gain.test.js` (all 13 cases, new names). Add the review-5 case: `cumulativeClimb([0, 6, 9, 3], 5).at(-1) === 9`, and `cumulativeClimb([100, 101, 100, 101], 2).at(-1) === 0` (noise still ignored).
- [ ] **Step 2:** `npm test` — FAIL.
- [ ] **Step 3:** Implement from `src/gain.js`. `cumulativeClimb` uses a two-state hysteresis: while *descending*, a rise counts only once it exceeds the threshold above the lowest point; once *climbing*, every further rise counts immediately until the elevation drops more than the threshold below the climb's highest point.
- [ ] **Step 4:** `npm run check` — PASS. Commit `feat: elevation curve module; count the top of every climb`.

### Task 4: Climb detection (review 7)

**Files:**
- Create: `src/math/climbs.ts`, `test/math/climbs.test.ts`

**Interfaces:**
- Consumes: `interpolateAt` (Task 3).
- Produces: `interface Climb { startMetres: number; endMetres: number; lengthMetres: number; riseMetres: number; averageGrade: number; maximumGrade: number }`; `interface ClimbDetectionOptions { sampleSpacingMetres; smoothingWindowMetres; minimumRiseMetres; minimumGrade; minimumLengthMetres; allowedDipMetres; allowedDipFraction; flatEdgeGrade; flatEdgeWindowMetres; maximumGradeWindowMetres; plateauLengthMetres; plateauToleranceMetres }` (all `number`, defaults 10, 60, 30, 0.03, 200, 10, 0.1, 0.02, 30, 100, 800, 6); `findClimbs(distances: readonly number[], elevations: readonly number[], options?: Partial<ClimbDetectionOptions>): Climb[]`.

- [ ] **Step 1:** Port `test/climbs.test.js` (7 cases). Add: two-point profile `[0, 100]`/`[0, 50]` returns one climb without throwing; empty arrays return `[]`.
- [ ] **Step 2:** `npm test` — FAIL. **Step 3:** Implement from `src/climbs.js`, resampling through `interpolateAt` (delete the private copy). **Step 4:** `npm run check` — PASS. Commit `feat: climb detection module`.

### Task 5: Elevation model (architecture 1, review 4)

**Files:**
- Create: `src/elevation-model.ts`, `test/elevation-model.test.ts`

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces:
  - `interface ProfileSource { distances: readonly number[]; elevations: readonly number[]; times?: readonly number[] | null; legs?: readonly RouteLeg[] | null; headlineGainMetres?: number }`
  - `interface NumberedClimb extends Climb { number: number; gainMetres: number; durationSeconds: number | null; verticalMetresPerHour: number | null }`
  - `interface ElevationModel { gain: ElevationCurve; loss: ElevationCurve; climbs: readonly NumberedClimb[] }`
  - `buildElevationModel(source: ProfileSource): ElevationModel` — threshold 1 m; gain pinned to leg `elevationGain` checkpoints, loss to `elevationLoss`; if `headlineGainMetres` is set it wins for gain, and the loss total is `headline − (last elevation − first elevation)`; climb gain read off the gain curve.
  - `cachedElevationModel(source: ProfileSource): ElevationModel` — cached per `source.elevations` array *and* `headlineGainMetres`.

- [ ] **Step 1:** Tests: headline 120 with legs summing 100 → `gain.valueAt(end) === 120`; legs only → equals leg sum (192.8 case: `[{paths:[{length: 9382, elevationGain: 192.8, elevationLoss: 240}]}]`); no legs and no headline → raw cumulative climb; loss total = headline − net change; climb `durationSeconds` and `verticalMetresPerHour` from `times`, `null` without; `cachedElevationModel` returns the same object for the same array and headline, a new one when the headline changes from `undefined` to 270 (review 4); two-point profile builds without throwing.
- [ ] **Step 2–4:** FAIL → implement from `profilesFor` in `src/content.js` → `npm run check` PASS. Commit `feat: elevation model module`.

### Task 6: Settings

**Files:**
- Create: `src/settings.ts`, `test/settings.test.ts`

**Interfaces:**
- Produces: `MARKER_ATTRIBUTE = "data-cumulative-gain"`; `type SplitsView = "net" | "gain-loss"`; `interface Settings { climbsEnabled(): boolean; setClimbsEnabled(enabled: boolean): void; splitsView(): SplitsView; setSplitsView(view: SplitsView): void; debugLog(...values: unknown[]): void }`; `createSettings(storage: Storage, console: Pick<Console, "log">): Settings`.

- [ ] **Step 1:** Tests with an in-memory `Storage`: defaults off / `"net"`; `setSplitsView("gain-loss")` stores `"gainloss"` under `cumulative-gain:splits`; existing `"on"` reads as enabled; `debugLog` only logs when `cumulative-gain:debug` is `"1"`.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: settings module`.

### Task 7: Tooltip rows and crosshair (architecture 3, review 6)

**Files:**
- Create: `src/tooltip/tooltip-rows.ts`, `src/tooltip/crosshair.ts`, `test/tooltip/tooltip-rows.test.ts`, `test/tooltip/crosshair.test.ts`

**Interfaces:**
- Consumes: `isProfileTooltip`, `ShownDistance` (Task 2), `MARKER_ATTRIBUTE` (Task 6).
- Produces (`tooltip-rows.ts`): `interface ExtraRow { key: "gain" | "loss" | "climb"; label: string; value: string }`; `findProfileTooltips(root: Element): Element[]`; `findElevationRow(tooltip: Element): Element | null`; `interface TooltipRows { show(tooltip: Element, rows: readonly ExtraRow[]): void }`; `createTooltipRows(onStravaChange: () => void): TooltipRows`. `show` takes pending attribute records (Strava's writes) before writing and discards its own with `takeRecords()` after; callers have no ordering rules.
- Produces (`crosshair.ts`): `crosshairDistance(chart: SVGSVGElement, tooltip: Element, shown: ShownDistance): number | null`.

- [ ] **Step 1:** Tests (jsdom fixtures copied from the activity tooltip — `y` rows, `<rect>` height 79 — and the route tooltip — `transform="translate(6, 22)"` rows):
  - Gain and Loss rows inserted under Elevation, later rows shifted 32, rect height 79 → 111 (activity) and route equivalents.
  - **Collision:** Strava shows two more rows and sets rect height to exactly 111 → height becomes 143, rows in order (the scratchpad `sim3` scenario).
  - Strava removes a row's `y` attribute → no `NaN` written (review 6).
  - Label containing a digit: `{ key: "climb", label: "Climb 4", value: "2.7 km · 14.0%" }` renders `Climb 4: 2.7 km · 14.0%` with no leftover elevation.
  - Climb row removed when the next `show` omits it; Elevation `display="none"` mirrored onto extra rows.
  - HTML tooltip (route builder style `<div>` rows) gets rows after Elevation in order.
  - Tooltip removed and re-created → rows added once (Review Focus).
  - `crosshairDistance` with `setBoundingRect` ticks "0.0 km" at left 381 and "2.0 km" at 486.32 and the crosshair line at 699.5 → ≈ 6048; a gridline whose distance disagrees with the label beyond the resolution → `null`.
- [ ] **Step 2–4:** FAIL → implement from `content.js` (relabel, fill, renderSvg, renderHtml, base tracking; `noteBases` deletes `data-cg-base-*` when the value is `null`) → PASS. Commit `feat: tooltip rows module with Strava-write tracking`.

### Task 8: Strava data readers and loader (reviews 2 and 3)

**Files:**
- Create: `src/strava/chart-props.ts`, `src/strava/embedded-route.ts`, `src/strava/activity-streams.ts`, `src/strava/route-gpx.ts`, `src/strava/loader.ts`, matching tests under `test/strava/`

**Interfaces:**
- Consumes: `ProfileSource`, `RouteLeg` (Tasks 3, 5), `cumulativeDistances` (Task 3).
- Produces:
  - `readChartProps(chart: Element): { distances: number[]; elevations: number[]; legs: RouteLeg[] | null } | null` (walks `__reactFiber*`, max 40 levels, by prop shape; returns React's own arrays so `cachedElevationModel` can key on them)
  - `readEmbeddedRoute(document: Document, routeId: string): ProfileSource | null`
  - `fetchActivityStreams(activityId: string, fetchFunction: typeof fetch): Promise<ProfileSource | null>`
  - `fetchRouteGpx(routeId: string, fetchFunction: typeof fetch, parser: DOMParser): Promise<ProfileSource | null>`
  - `interface Loader<Result> { start(onReady: () => void): void; result(): Result | null }`; `createLoader<Result>(load: () => Promise<Result | null>, options?: { retryDelaysMs?: readonly number[]; schedule?: (callback: () => void, delayMs: number) => void }): Loader<Result>` (defaults `[2000, 5000, 15000]`, `setTimeout`)
- [ ] **Step 1:** Tests: fake fiber chain with props at depth 3 and legs at depth 6 is found, missing props → `null`; embedded route with a different id → `null`; streams with `altitude` missing or a different length → `null`, never throws (review 3); 404 → `null`; GPX fixture of 3 `trkpt` → distances from haversine; loader retries on `null` and on throw at 2000/5000/15000 then stops, calls `onReady` once on success, `start` twice doesn't double-load (review 2).
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: Strava data readers with retrying loader`.

### Task 9: Page adapters (architecture 2, review 1)

**Files:**
- Create: `src/pages/page.ts`, `src/pages/activity-page.ts`, `src/pages/route-page.ts`, `src/pages/route-builder-page.ts`, `test/pages/*.test.ts`

**Interfaces:**
- Consumes: Task 8 readers and loader, `ProfileSource`.
- Produces (`page.ts`):
  - `interface ClimbsPlacement { position: "before" | "after" | "beside"; anchor: Element; sectionClassName: string; headingClassName: string; tableClassName: string; horizontalPaddingPixels: number }`
  - `interface StravaPage { readonly kind: "activity" | "route" | "route-builder"; prepare(onReady: () => void): void; profileSource(chart: SVGSVGElement): ProfileSource | null; climbsPlacement(chart: SVGSVGElement): ClimbsPlacement | null; splitsTable(): HTMLTableElement | null }`
  - `interface PageDependencies { document: Document; fetch: typeof fetch; schedule?: (callback: () => void, delayMs: number) => void }`
  - `detectPage(pathname: string, dependencies: PageDependencies): StravaPage | null` — `/activities/<id>` → activity, `/routes/<id>` → route, `/routes/new`, `/routes/<id>/edit`, `/maps/create…` → route builder.
- Behaviour per adapter: **activity** — streams via loader; profile only for a chart inside `#elevation-chart`; `headlineGainMetres` read from the "Elevation" stat each call; placement after `#elevation-profile` with table class `dense hoverable`, padding 20; splits table `#splits-container table`. **Route** — chart props + embedded legs and headline; when chart props are missing, embedded route, then GPX via loader (review 1); placement before the "Segments" section copying its classes, else after the chart; no splits. **Route builder** — chart props only; placement beside the "Hide/Show Elevation" button; no splits, no table.
- [ ] **Step 1:** Tests with jsdom fixtures per page: `detectPage` for each pathname (and `/dashboard` → `null`); activity profile `null` for a chart outside `#elevation-chart`; route falls back to embedded data when chart props are missing (review 1) and to GPX when that's missing too; builder `splitsTable()` is `null`; each placement points at the right anchor.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat: Strava page adapters`.

### Task 10: Climbs and splits UI (review 8)

**Files:**
- Create: `src/ui/climb-bands.ts`, `src/ui/climbs-panel.ts`, `src/ui/splits-toggle.ts`, `test/ui/*.test.ts`

**Interfaces:**
- Consumes: `ElevationModel`, `NumberedClimb` (Task 5), `ClimbsPlacement` (Task 9), formatting (Task 2), `MARKER_ATTRIBUTE`, `SplitsView` (Task 6).
- Produces:
  - `drawClimbBands(chart: SVGSVGElement, climbs: readonly NumberedClimb[], chartStartMetres: number, chartEndMetres: number): void`; `removeClimbBands(chart: SVGSVGElement): void`; `highlightClimbBand(chart: SVGSVGElement, climbNumber: number | null): void`
  - `renderClimbsPanel(chart: SVGSVGElement, climbs: readonly NumberedClimb[], placement: ClimbsPlacement, options: { enabled: boolean; onToggle(enabled: boolean): void }): void`
  - `renderSplitsToggle(table: HTMLTableElement, model: ElevationModel, chartEndMetres: number, options: { view: SplitsView; onToggle(view: SplitsView): void }): void`
- [ ] **Step 1:** Tests: bands inserted immediately before the area path's top-level group via one `childOfPlotGroup` helper (review 8), not reinserted when nothing changed; checkbox labelled and checked from `enabled`; table only when enabled, with `scope="col"` headers, Time/VAM only when durations exist, "No climbs detected" for none; splits button toggles, Enter on the focused button calls `onToggle`, net view restores Strava's original cell HTML exactly, imperial "MI" header uses 1609.344 m splits and ft values.
- [ ] **Step 2–4:** FAIL → implement from `content.js` → PASS. Commit `feat: climbs and splits UI modules`.

### Task 11: Wiring and switch-over

**Files:**
- Create: `src/main.ts` (replace placeholder), `test/main.test.ts`
- Modify: `manifest.json` (`js: ["build/content.js"]`), `scripts/package.sh` (run `npm run check && npm run build`, zip `manifest.json build icons`), `package.json` (`"type": "module"`), `README.md` (install now needs `npm install && npm run build`; architecture section), `scripts/make_icons.py`, `scripts/make_store_images.py` (naming), `CHROMEWEBSTORE.md` (version history note)
- Delete: `src/gain.js`, `src/parse.js`, `src/climbs.js`, `src/content.js`, `test/*.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `start(environment: { document: Document; window: Window; location: Location; storage: Storage; fetch: typeof fetch }): { stop(): void }` exported from `main.ts`; the bundle's top level calls it with the real globals.
- [ ] **Step 1:** End-to-end jsdom tests through `start`: activity fixture + fake streams → hovering tooltip gets Gain/Loss; route fixture with chart props → Gain matches the headline at the end; navigating from an activity to a route path (Review Focus) shows route data, never the activity's; climbs off → no bands/table, toggling on adds them; `stop()` disconnects observers.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Rename Python script variables to the standard; regenerate icons and store images and confirm byte-identical icons (`git diff --stat icons` shows none).
- [ ] **Step 6:** `npm run package`; confirm the zip lists exactly `manifest.json`, `build/content.js`, three icons.
- [ ] **Step 7:** Commit `refactor: switch to the TypeScript bundle and remove legacy scripts`.

### Task 12: Live verification in Chrome

**Files:** Modify `CHROMEWEBSTORE.md` (asset status), `store/captures/activity-splits.png` + regenerated `store/images/screenshot-3-splits.png` if anything changed.

- [ ] **Step 1:** User reloads the unpacked extension (after `npm run build`).
- [ ] **Step 2:** On the trail-run activity, Waterville and Howth routes and the route builder, verify: Gain/Loss rows and values (Waterville ends at ~1,329 m, builder at 1,309 m, Howth at 193 m); chart-line toggles on/off keep all rows inside the box; climbs checkbox on/off on all three pages; splits toggle by click, Tab+Enter, Tab+Space, with a visible focus ring; console free of errors with `cumulative-gain:debug` = `1`. Restore the user's settings afterwards.
- [ ] **Step 3:** Recapture screenshot 3 if the splits table changed; mark it ✅ in `CHROMEWEBSTORE.md`. Commit `docs: verified 1.0.0 build in Chrome`.
