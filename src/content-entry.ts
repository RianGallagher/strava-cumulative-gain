// The bundle's entry point and the only module that reads the browser's globals.
import { start } from "./main.ts";

start({
  document,
  window,
  location,
  storage: localStorage,
  fetch: window.fetch.bind(window),
});
