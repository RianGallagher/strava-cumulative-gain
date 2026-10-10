const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDistance, parseElevationUnit, isProfileTooltip, formatGain } = require("../src/parse.js");

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

test("formats gain", () => {
  assert.equal(formatGain(134.4, "m"), "134 m");
  assert.equal(formatGain(100, "ft"), "328 ft");
});
