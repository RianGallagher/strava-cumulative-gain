import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/content-entry.ts"],
  outfile: "build/content.js",
  bundle: true,
  format: "iife",
  target: "chrome120",
};

if (process.argv.includes("--watch")) {
  const watchContext = await context(options);
  await watchContext.watch();
  console.log("Watching src/ for changes");
} else {
  await build(options);
}
