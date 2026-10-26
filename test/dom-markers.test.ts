import test from "node:test";
import assert from "node:assert/strict";
import { MARKER_ATTRIBUTE, SIGNATURE_ATTRIBUTE, SVG_NAMESPACE } from "../src/dom-markers.ts";

test("the marker and signature attributes keep their names", () => {
  assert.equal(MARKER_ATTRIBUTE, "data-cumulative-gain");
  assert.equal(SIGNATURE_ATTRIBUTE, "data-cumulative-gain-signature");
});

test("the SVG namespace", () => {
  assert.equal(SVG_NAMESPACE, "http://www.w3.org/2000/svg");
});
