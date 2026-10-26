import test from "node:test";
import assert from "node:assert/strict";
import {
  buildElevationCurve,
  cumulativeClimb,
  interpolateAt,
  legCheckpoints,
  pinToCheckpoints,
  scaleToTotal,
} from "../../src/math/elevation-curve.ts";

test("sums climbs without a threshold", () => {
  assert.deepEqual(cumulativeClimb([0, 10, 5, 15], 0), [0, 10, 10, 20]);
});

test("hysteresis ignores noise smaller than the threshold", () => {
  const noisyElevationsMetres = [100, 101, 100, 101, 100, 101, 100];
  assert.equal(cumulativeClimb(noisyElevationsMetres, 0).at(-1), 3);
  assert.equal(cumulativeClimb(noisyElevationsMetres, 2).at(-1), 0);
});

test("hysteresis still counts a real climb in small steps", () => {
  assert.equal(cumulativeClimb([0, 1, 2, 3, 4, 5, 6], 2).at(-1), 6);
});

test("the top of a climb under the threshold is still counted", () => {
  assert.equal(cumulativeClimb([0, 6, 9, 3], 5).at(-1), 9);
});

test("a dip smaller than the threshold keeps the climb going", () => {
  assert.equal(cumulativeClimb([0, 10, 6, 12], 5).at(-1), 12);
});

test("a dip of exactly the threshold ends the climb, so the next rise counts in full", () => {
  assert.equal(cumulativeClimb([0, 10, 5, 12], 5).at(-1), 17);
});

test("a rise of exactly the threshold counts", () => {
  assert.deepEqual(cumulativeClimb([0, 5], 5), [0, 5]);
});

test("threshold 0 sums the rises and ignores flat steps", () => {
  assert.deepEqual(cumulativeClimb([0, 0, 3, 3, 1, 1, 4], 0), [0, 0, 3, 3, 3, 3, 6]);
});

test("small oscillation around a flat line is still ignored", () => {
  assert.equal(cumulativeClimb([100, 101, 100, 101], 2).at(-1), 0);
});

test("output is monotonic", () => {
  const climb = cumulativeClimb([5, 3, 8, 2, 9, 9, 1, 4], 1);
  for (let index = 1; index < climb.length; index++) {
    assert.ok((climb[index] ?? 0) >= (climb[index - 1] ?? 0));
  }
});

test("scaleToTotal scales the endpoint to the page total", () => {
  assert.deepEqual(scaleToTotal([0, 5, 10], 20), [0, 10, 20]);
  assert.deepEqual(scaleToTotal([0, 0], 20), [0, 0]);
  assert.deepEqual(scaleToTotal([0, 5], undefined), [0, 5]);
});

test("interpolateAt interpolates and clamps", () => {
  const positions = [0, 100, 200];
  const values = [0, 10, 30];
  assert.equal(interpolateAt(positions, values, 50), 5);
  assert.equal(interpolateAt(positions, values, 150), 20);
  assert.equal(interpolateAt(positions, values, -5), 0);
  assert.equal(interpolateAt(positions, values, 999), 30);
});

test("interpolateAt returns the lower value across a zero-width step", () => {
  assert.equal(interpolateAt([0, 100, 100, 200], [0, 5, 9, 9], 100), 5);
});

test("buildElevationCurve end to end", () => {
  const curve = buildElevationCurve([0, 1000, 2000], [10, 60, 40], {
    thresholdMetres: 0,
    totalMetres: 100,
  });
  assert.equal(curve.valueAt(2000), 100);
  assert.equal(curve.valueAt(500), 50);
});

test("pinToCheckpoints hits each checkpoint exactly and stays monotonic", () => {
  const distancesMetres = [0, 50, 100, 150, 200];
  const rawCumulativeMetres = [0, 10, 10, 30, 40];
  const checkpoints = [
    { distanceMetres: 0, cumulativeMetres: 0 },
    { distanceMetres: 100, cumulativeMetres: 5 },
    { distanceMetres: 200, cumulativeMetres: 25 },
  ];
  const pinned = pinToCheckpoints(distancesMetres, rawCumulativeMetres, checkpoints);
  assert.equal(pinned[0], 0);
  assert.equal(pinned[2], 5);
  assert.equal(pinned[4], 25);
  assert.equal(pinned[1], 5);
  for (let index = 1; index < pinned.length; index++) {
    assert.ok((pinned[index] ?? 0) >= (pinned[index - 1] ?? 0));
  }
});

test("pinToCheckpoints falls back to distance when raw is flat but the leg climbs", () => {
  const pinned = pinToCheckpoints(
    [0, 50, 100],
    [0, 0, 0],
    [
      { distanceMetres: 0, cumulativeMetres: 0 },
      { distanceMetres: 100, cumulativeMetres: 10 },
    ],
  );
  assert.deepEqual(pinned, [0, 5, 10]);
});

test("legCheckpoints sums paths and rescales to the chart length", () => {
  const legs = [
    {
      paths: [
        { length: 60, elevationGain: 2 },
        { length: 40, elevationGain: 1 },
      ],
    },
    { paths: [{ length: 100, elevationGain: 7 }] },
  ];
  assert.deepEqual(legCheckpoints(legs, 100, "elevationGain"), [
    { distanceMetres: 0, cumulativeMetres: 0 },
    { distanceMetres: 50, cumulativeMetres: 3 },
    { distanceMetres: 100, cumulativeMetres: 10 },
  ]);
});

test("buildElevationCurve scales a pinned curve to a differing headline total", () => {
  const checkpoints = [
    { distanceMetres: 0, cumulativeMetres: 0 },
    { distanceMetres: 1000, cumulativeMetres: 50 },
    { distanceMetres: 2000, cumulativeMetres: 100 },
  ];
  const distancesMetres = [0, 1000, 2000];
  const elevationsMetres = [0, 50, 100];
  const scaled = buildElevationCurve(distancesMetres, elevationsMetres, {
    thresholdMetres: 0,
    checkpoints,
    totalMetres: 120,
  });
  assert.equal(scaled.valueAt(2000), 120);
  assert.equal(scaled.valueAt(1000), 60);
  const unscaled = buildElevationCurve(distancesMetres, elevationsMetres, {
    thresholdMetres: 0,
    checkpoints,
  });
  assert.equal(unscaled.valueAt(2000), 100);
});

test("loss is the climb of the negated profile", () => {
  const elevationsMetres = [100, 80, 90, 60, 70];
  assert.equal(
    cumulativeClimb(
      elevationsMetres.map((value) => -value),
      0,
    ).at(-1),
    50,
  );
  assert.equal(cumulativeClimb(elevationsMetres, 0).at(-1), 20);
});

test("legCheckpoints reads elevationLoss and returns null when the field is absent", () => {
  const legs = [{ paths: [{ length: 100, elevationGain: 3, elevationLoss: 8 }] }];
  assert.deepEqual(legCheckpoints(legs, 100, "elevationLoss"), [
    { distanceMetres: 0, cumulativeMetres: 0 },
    { distanceMetres: 100, cumulativeMetres: 8 },
  ]);
  assert.equal(legCheckpoints([{ paths: [{ length: 100 }] }], 100, "elevationLoss"), null);
});
