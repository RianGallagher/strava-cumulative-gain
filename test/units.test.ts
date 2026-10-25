import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatGrade,
  METRES_PER_UNIT,
} from "../src/units.ts";

test("metres per unit", () => {
  assert.deepEqual(METRES_PER_UNIT, { km: 1000, mi: 1609.344, m: 1, ft: 0.3048 });
});

test("formats elevation", () => {
  assert.equal(formatElevation(134.4, "m"), "134 m");
  assert.equal(formatElevation(100, "ft"), "328 ft");
  assert.equal(formatElevation(1328.6, "m"), "1,329 m");
});

test("formats distance, grade and duration", () => {
  assert.equal(formatDistance(2710, "km", 2), "2.71 km");
  assert.equal(formatDistance(1609.344, "mi", 1), "1.0 mi");
  assert.equal(formatGrade(0.1402), "14.0%");
  assert.equal(formatDuration(754), "12:34");
  assert.equal(formatDuration(3723), "1:02:03");
});
