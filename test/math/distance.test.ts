import test from "node:test";
import assert from "node:assert/strict";
import { cumulativeDistancesMetres, haversineMetres } from "../../src/math/distance.ts";

test("one degree of latitude is about 111 km", () => {
  const distancesMetres = cumulativeDistancesMetres([
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
  ]);
  assert.equal(distancesMetres[0], 0);
  assert.ok(Math.abs((distancesMetres[1] ?? 0) - 111195) < 50);
});

test("haversineMetres is zero for identical points", () => {
  const point = { latitude: 51.5, longitude: -0.12 };
  assert.equal(haversineMetres(point, point), 0);
});

test("cumulativeDistancesMetres of no points is empty", () => {
  assert.deepEqual(cumulativeDistancesMetres([]), []);
});
