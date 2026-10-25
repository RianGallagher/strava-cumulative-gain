import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const deniedAbbreviations =
  "lo hi el elem attr attrs btn sig opts res cur num idx val tmp cfg ctx evt err elev dist ele pts nd cs fn cb arr obj str".split(
    " ",
  );

export default tseslint.config(
  {
    ignores: ["src/*.js", "test/*.test.js", "build", "dist", "scripts/*.py", "node_modules"],
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
