# Cumulative Elevation for Strava

Chrome MV3 extension, strict TypeScript, bundled by esbuild into `build/content.js`. No runtime dependencies.

## Before every commit

Run `npm run check` (typecheck, lint, format check, tests). Commit only when it passes.

## Naming

Every identifier is a full word, at least 3 characters, in src, tests and scripts. ESLint enforces the length and a denylist of abbreviations (`el`, `rect`, `elem`, `btn`, `idx`, `val`, `err`, `dist`, `elev`, `pts`, ...). Write `element`, `index`, `error`, `distanceMetres`.

A number carries its unit in the name: `distanceMetres`, `durationSeconds`, `gainFeet`.

## Globals

Only `src/content-entry.ts` touches `document`, `window`, `location`, `localStorage` or `fetch`. Every other module receives them as parameters and creates nodes with `element.ownerDocument`.

## Modules

- Keep files under about 250 lines; split by responsibility when one grows past that.
- Import relatively with the `.ts` extension: `import { start } from "./main.ts"`.
- Keep the stored setting keys and the `data-cumulative-gain` marker attribute unchanged.

## Temporary

The `test` script passes `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`; remove it once `"type": "module"` lands in package.json (Task 11).

## Tests

Test each module through its exported interface, in `test/` mirroring `src/` (`src/gain.ts` is tested by `test/gain.test.ts`). Build DOM fixtures with `createTestDocument` from `test/support/dom.ts`.
