import assert from "node:assert/strict";
import test from "node:test";
import { isProfileTooltip, parseElevationUnit, parseShownDistance } from "../../src/tooltip/tooltip-text.ts";

const activity = "33:23Dist: 5.4 kmElev: 95 mGrade: -13.3%Pace: 4:54/km";
const route = "Distance 3.29 kmElevation 138 mGrade 4.1%";
const builder = "Distance 3.50 km\nElevation 133 m\nGrade -12.6%\nSurface Type Not specified";
const imperial = "Distance 2.04 miElevation 453 ftGrade 4.1%";
const statsHeader = "Distance 15.20 km Moving Time 1:17:02 Elevation 95 m";

test("recognises all tooltips but not the stats header", () => {
  for (const text of [activity, route, builder, imperial]) assert.ok(isProfileTooltip(text), text);
  assert.equal(isProfileTooltip(statsHeader), false);
});

test("parses shown distance in metres", () => {
  assert.equal(parseShownDistance(activity)?.metres, 5400);
  assert.equal(parseShownDistance(route)?.metres, 3290);
  assert.ok(Math.abs((parseShownDistance(imperial)?.metres ?? 0) - 3283.06) < 0.1);
});

test("reports the display resolution in metres", () => {
  assert.equal(parseShownDistance("Dist: 6.0 kmElev: 95 mGrade: -13.3%")?.resolutionMetres, 100);
  assert.equal(parseShownDistance(route)?.resolutionMetres, 10);
  assert.ok(Math.abs((parseShownDistance(imperial)?.resolutionMetres ?? 0) - 16.09344) < 1e-9);
});

test("returns null when no distance is shown", () => {
  assert.equal(parseShownDistance("Elevation 95 m"), null);
});

test("parses elevation unit", () => {
  assert.equal(parseElevationUnit(route), "m");
  assert.equal(parseElevationUnit(imperial), "ft");
  assert.equal(parseElevationUnit("Distance 3 km"), null);
});
