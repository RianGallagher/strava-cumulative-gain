import test from "node:test";
import assert from "node:assert/strict";
import { buildElevationModel, cachedElevationModel, type ProfileSource } from "../src/elevation-model.ts";

// A steady 5% climb: 2 km long, 100 m of rise, sampled every 100 m.
const distancesMetres = Array.from({ length: 21 }, (unusedValue, index) => index * 100);
const elevationsMetres = distancesMetres.map((distanceMetres) => distanceMetres * 0.05);

function source(overrides: Partial<ProfileSource> = {}): ProfileSource {
  return { distancesMetres, elevationsMetres: [...elevationsMetres], ...overrides };
}

const legsSummingTo100 = [{ paths: [{ length: 2000, elevationGain: 100, elevationLoss: 30 }] }];

test("the headline gain wins over the leg totals at the finish", () => {
  const model = buildElevationModel(source({ legs: legsSummingTo100, headlineGainMetres: 120 }));
  assert.ok(Math.abs(model.gain.valueAt(2000) - 120) < 1e-9);
});

test("legs alone give the leg sum", () => {
  const legs = [{ paths: [{ length: 9382, elevationGain: 192.8, elevationLoss: 240 }] }];
  const model = buildElevationModel({
    distancesMetres: [0, 9382],
    elevationsMetres: [0, 50],
    legs,
  });
  assert.ok(Math.abs(model.gain.valueAt(9382) - 192.8) < 1e-9);
  assert.ok(Math.abs(model.loss.valueAt(9382) - 240) < 1e-9);
});

test("without legs or a headline the gain is the raw cumulative climb", () => {
  const model = buildElevationModel(source());
  assert.ok(Math.abs(model.gain.valueAt(2000) - 100) < 1e-9);
  assert.equal(model.loss.valueAt(2000), 0);
});

test("the loss total is the headline minus the net elevation change", () => {
  // Climbs 100 m, then descends 70 m: net change +30 m, so a 130 m headline implies 100 m of loss.
  const longDistancesMetres = Array.from({ length: 35 }, (unusedValue, index) => index * 100);
  const longElevationsMetres = longDistancesMetres.map((distanceMetres) =>
    distanceMetres <= 2000 ? distanceMetres * 0.05 : 100 - (distanceMetres - 2000) * 0.05,
  );
  const model = buildElevationModel({
    distancesMetres: longDistancesMetres,
    elevationsMetres: longElevationsMetres,
    headlineGainMetres: 130,
  });
  assert.ok(Math.abs(model.loss.valueAt(3400) - 100) < 1e-9);
});

test("climbs are numbered and read their gain off the gain curve", () => {
  const model = buildElevationModel(source({ headlineGainMetres: 120 }));
  assert.equal(model.climbs.length, 1);
  const climb = model.climbs[0];
  assert.equal(climb.number, 1);
  assert.ok(Math.abs(climb.gainMetres - 120) < 1e-9);
  assert.equal(climb.durationSeconds, null);
  assert.equal(climb.verticalMetresPerHour, null);
});

test("climb duration and vertical metres per hour come from the times", () => {
  const timesSeconds = distancesMetres.map((distanceMetres) => distanceMetres * 0.5);
  const model = buildElevationModel(source({ timesSeconds }));
  const climb = model.climbs[0];
  const durationSeconds = climb.endMetres * 0.5 - climb.startMetres * 0.5;
  assert.ok(Math.abs((climb.durationSeconds ?? NaN) - durationSeconds) < 1e-9);
  const expectedVerticalMetresPerHour = (climb.gainMetres / durationSeconds) * 3600;
  assert.ok(Math.abs((climb.verticalMetresPerHour ?? NaN) - expectedVerticalMetresPerHour) < 1e-9);
});

test("a zero duration gives no vertical metres per hour", () => {
  const model = buildElevationModel(source({ timesSeconds: distancesMetres.map(() => 0) }));
  assert.equal(model.climbs[0].durationSeconds, 0);
  assert.equal(model.climbs[0].verticalMetresPerHour, null);
});

test("the cache returns the same model for the same array and headline", () => {
  const profile = source({ headlineGainMetres: 270 });
  assert.equal(cachedElevationModel(profile), cachedElevationModel({ ...profile }));
});

test("the cache rebuilds when a headline appears after the first render", () => {
  const profile = source();
  const first = cachedElevationModel(profile);
  const second = cachedElevationModel({ ...profile, headlineGainMetres: 270 });
  assert.notEqual(first, second);
  assert.ok(Math.abs(second.gain.valueAt(2000) - 270) < 1e-9);
});

test("a two-point profile builds without throwing", () => {
  const model = buildElevationModel({ distancesMetres: [0, 1000], elevationsMetres: [0, 50] });
  assert.equal(model.climbs.length, 1);
});
