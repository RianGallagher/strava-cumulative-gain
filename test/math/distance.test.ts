import test from "node:test";
import assert from "node:assert/strict";
import { cumulativeDistances, haversineMetres } from "../../src/math/distance.ts";

test("one degree of latitude is about 111 km", () => {
  const distances = cumulativeDistances([
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ]);
  assert.equal(distances[0], 0);
  assert.ok(Math.abs((distances[1] ?? 0) - 111195) < 50);
});

test("haversineMetres is zero for identical points", () => {
  const point = { latitude: 51.5, longitude: -0.12 };
  assert.equal(haversineMetres(point, point), 0);
});

test("cumulativeDistances of no points is empty", () => {
  assert.deepEqual(cumulativeDistances([]), []);
});
