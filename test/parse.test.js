const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDistance, parseElevationUnit, isProfileTooltip, formatElevation } = require("../src/parse.js");

const activity = "33:23Dist: 5.4 kmElev: 95 mGrade: -13.3%Pace: 4:54/km";
const route = "Distance 3.29 kmElevation 138 mGrade 4.1%";
const builder = "Distance 3.50 km\nElevation 133 m\nGrade -12.6%\nSurface Type Not specified";
const imperial = "Distance 2.04 miElevation 453 ftGrade 4.1%";
const statsHeader = "Distance 15.20 km Moving Time 1:17:02 Elevation 95 m";

test("recognises all three tooltips but not the stats header", () => {
  for (const t of [activity, route, builder, imperial]) assert.ok(isProfileTooltip(t), t);
  assert.equal(isProfileTooltip(statsHeader), false);
});

test("parses distance in metres", () => {
  assert.equal(parseDistance(activity).metres, 5400);
  assert.equal(parseDistance(route).metres, 3290);
  assert.ok(Math.abs(parseDistance(imperial).metres - 3283.06) < 0.1);
});

test("parses elevation unit", () => {
  assert.equal(parseElevationUnit(route), "m");
  assert.equal(parseElevationUnit(imperial), "ft");
});

test("formats elevation", () => {
  assert.equal(formatElevation(134.4, "m"), "134 m");
  assert.equal(formatElevation(100, "ft"), "328 ft");
});

const { formatDistance, formatGrade, formatDuration } = require("../src/parse.js");

test("formats distance, grade and duration", () => {
  assert.equal(formatDistance(2710, "km", 2), "2.71 km");
  assert.equal(formatDistance(1609.344, "mi", 1), "1.0 mi");
  assert.equal(formatGrade(0.1402), "14.0%");
  assert.equal(formatDuration(754), "12:34");
  assert.equal(formatDuration(3723), "1:02:03");
});
