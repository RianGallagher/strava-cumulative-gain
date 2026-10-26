import test from "node:test";
import assert from "node:assert/strict";
import { findClimbs } from "../../src/math/climbs.ts";

type Knot = readonly [distanceMetres: number, elevationMetres: number];

// Piecewise-linear profile from knots, sampled every 10 m.
function profile(knots: readonly Knot[]): [number[], number[]] {
  const distancesMetres: number[] = [];
  const elevationsMetres: number[] = [];
  const lastKnot = knots[knots.length - 1];
  for (let distanceMetres = 0; distanceMetres <= lastKnot[0]; distanceMetres += 10) {
    let knotIndex = 0;
    while (knots[knotIndex + 1][0] < distanceMetres) knotIndex++;
    const [startDistanceMetres, startElevationMetres] = knots[knotIndex];
    const [endDistanceMetres, endElevationMetres] = knots[knotIndex + 1];
    distancesMetres.push(distanceMetres);
    elevationsMetres.push(
      startElevationMetres +
        ((distanceMetres - startDistanceMetres) / (endDistanceMetres - startDistanceMetres)) *
          (endElevationMetres - startElevationMetres),
    );
  }
  return [distancesMetres, elevationsMetres];
}

test("finds a single climb and trims the flat run-in and run-out", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [1000, 0],
    [2000, 100],
    [3000, 100],
  ]);
  const [climb] = findClimbs(distancesMetres, elevationsMetres);
  assert.ok(climb);
  assert.ok(Math.abs(climb.startMetres - 1000) <= 60, `start ${String(climb.startMetres)}`);
  assert.ok(Math.abs(climb.endMetres - 2000) <= 60, `end ${String(climb.endMetres)}`);
  assert.ok(Math.abs(climb.averageGrade - 0.1) < 0.01);
});

test("ignores bumps below the minimum rise", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [500, 20],
    [1000, 0],
  ]);
  assert.equal(findClimbs(distancesMetres, elevationsMetres).length, 0);
});

test("a short dip inside a climb does not split it", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [1000, 100],
    [1100, 95],
    [2000, 200],
  ]);
  const climbs = findClimbs(distancesMetres, elevationsMetres);
  assert.equal(climbs.length, 1);
  assert.ok((climbs[0]?.riseMetres ?? 0) > 180);
});

test("a real descent splits two climbs", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [1000, 100],
    [2000, 40],
    [3000, 150],
  ]);
  const climbs = findClimbs(distancesMetres, elevationsMetres);
  assert.equal(climbs.length, 2);
  assert.ok((climbs[0]?.endMetres ?? Infinity) < (climbs[1]?.startMetres ?? 0));
});

test("maximum grade reflects the steepest stretch", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [1000, 40],
    [1300, 100],
    [2000, 120],
  ]);
  const [climb] = findClimbs(distancesMetres, elevationsMetres);
  assert.ok(climb);
  assert.ok(climb.maximumGrade > 0.15, `max ${String(climb.maximumGrade)}`);
  assert.ok(climb.averageGrade < climb.maximumGrade);
});

test("gentle drags under the minimum grade are not climbs", () => {
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [5000, 50],
  ]); // 1%
  assert.equal(findClimbs(distancesMetres, elevationsMetres).length, 0);
});

test("a long flat splits a bump from the real climb", () => {
  // 25 m bump, 2 km flat, then a 200 m climb (the Waterville start).
  const [distancesMetres, elevationsMetres] = profile([
    [0, 0],
    [500, 25],
    [2500, 22],
    [5000, 220],
  ]);
  const climbs = findClimbs(distancesMetres, elevationsMetres);
  assert.equal(climbs.length, 1);
  assert.ok((climbs[0]?.startMetres ?? 0) > 2300, `start ${String(climbs[0]?.startMetres)}`);
  assert.ok((climbs[0]?.averageGrade ?? 0) > 0.07);
});

test("a two-point profile returns one climb without throwing", () => {
  const climbs = findClimbs([0, 1000], [0, 50]);
  assert.equal(climbs.length, 1);
});

test("empty input returns no climbs", () => {
  assert.deepEqual(findClimbs([], []), []);
});
