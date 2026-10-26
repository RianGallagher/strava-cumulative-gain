import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const deniedAbbreviations =
  "lo hi el elem attr attrs btn sig opts res cur num idx val tmp cfg ctx evt err elev dist ele pts nd cs rect fn cb arr obj str".split(
    " ",
  );

// Abbreviations inside longer names, which id-denylist (whole names only) misses:
// a "Ms"/"_MS" unit suffix, "max"/"Max"/"MAX" or "prop(s)"/"Prop(s)"/"PROP(S)"
// as a word part, and `init`.
const deniedWordParts = [
  "Ms$",
  "(^|_)MS$",
  "^max([A-Z_]|$)",
  "Max([A-Z]|$)",
  "(^|_)MAX(_|$)",
  "^props?([A-Z]|$)",
  "Props?([A-Z]|$)",
  "(^|_)PROPS?(_|$)",
  "^init$",
].join("|");

// Names React and Next.js (Strava's page data) choose; our fixtures mirror them.
const externalNames = "^(memoizedProps|props|pageProps)$";

// Only the bundle's entry point may read the browser's globals.
const browserGlobals = [
  "document",
  "window",
  "location",
  "localStorage",
  "fetch",
  "setTimeout",
  "clearTimeout",
  "requestAnimationFrame",
  "navigator",
];

export default tseslint.config(
  {
    ignores: ["build", "dist", "scripts/*.py", "node_modules"],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "id-length": ["error", { min: 3, exceptions: ["id"], properties: "never" }],
      "id-denylist": ["error", ...deniedAbbreviations],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "default",
          format: null,
          custom: { regex: deniedWordParts, match: false },
        },
        {
          // External keys are allowed as properties only, never as our own variables.
          selector: ["objectLiteralProperty", "typeProperty"],
          format: null,
          filter: { regex: externalNames, match: true },
        },
        {
          // id-length doesn't check type parameters, so `T` is caught here.
          selector: "typeParameter",
          format: null,
          custom: { regex: `^.{1,2}$|${deniedWordParts}`, match: false },
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/content-entry.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...browserGlobals.map((name) => ({
          name,
          message: "Only src/content-entry.ts reads browser globals; take it as a parameter.",
        })),
      ],
    },
  },
  {
    // node:test's test() returns a promise the runner tracks itself.
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
);
