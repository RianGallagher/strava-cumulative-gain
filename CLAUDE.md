# Cumulative Elevation for Strava

Chrome MV3 extension, strict TypeScript, bundled by esbuild into `build/content.js`. No runtime dependencies.

## Before every commit

Run `npm run check` (typecheck, lint, format check, tests). Commit only when it passes. Node 24 or later.

## TypeScript projects

- `tsconfig.json` checks `src/` with the DOM libraries only (`"types": []`), so extension code can't use Node APIs.
- `test/tsconfig.json` extends it, adds Node's types and checks `test/` with `src/`.
- `npm run typecheck` runs both.

## Naming

Every identifier is a full word, at least 3 characters, in src, tests and scripts (type parameters too: `ElementType`, not `T`). Write `element`, `index`, `error`, `properties`, `maximumGrade`, `requestOptions`. ESLint enforces this:

- `id-length` (minimum 3) and `id-denylist` reject whole names such as `el`, `rect`, `elem`, `btn`, `idx`, `val`, `err`, `dist`, `elev`, `pts`.
- `@typescript-eslint/naming-convention` rejects abbreviations inside longer names: a `Ms`/`_MS` suffix, `max`/`Max`/`MAX` or `props`/`Props` as a word part, `init`, and type parameters shorter than 3 characters. Property names that mirror React or Next.js data (`memoizedProps`, `props`, `pageProps`) are allowed as properties only.

A number carries its unit in the name: `distanceMetres`, `durationSeconds`, `delayMilliseconds`, `gainFeet`; so do arrays of them (`distancesMetres`). Strava's own data keys (`distance`, `altitude`, `elevation`, `legs`, `length`, `elevationGain`) are read as they are.

## Globals

Only `src/content-entry.ts` touches `document`, `window`, `location`, `localStorage`, `fetch`, timers, `requestAnimationFrame` or `navigator` (ESLint `no-restricted-globals` enforces it for the rest of `src/`). Every other module receives them as parameters and creates nodes with `element.ownerDocument`.

## Modules

- Keep files under about 250 lines; split by responsibility when one grows past that.
- Import relatively with the `.ts` extension: `import { start } from "./main.ts"`.
- Keep the stored setting keys and the `data-cumulative-gain` marker attribute (`src/dom-markers.ts`) unchanged.

## Tests

Test each module through its exported interface, in `test/` mirroring `src/` (`src/units.ts` is tested by `test/units.test.ts`). Build DOM fixtures with `createTestDocument` from `test/support/dom.ts`.
