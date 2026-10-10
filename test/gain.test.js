const test = require("node:test");
const assert = require("node:assert/strict");
const { cumulativeGain, normalise, gainAt, cumulativeDistance, buildProfile } = require("../src/gain.js");

test("sums climbs without a threshold", () => {
  assert.deepEqual(cumulativeGain([0, 10, 5, 15]), [0, 10, 10, 20]);
});

test("hysteresis ignores noise smaller than the threshold", () => {
  const noisy = [100, 101, 100, 101, 100, 101, 100];
  assert.equal(cumulativeGain(noisy, 0).at(-1), 3);
  assert.equal(cumulativeGain(noisy, 2).at(-1), 0);
});

test("hysteresis still counts a real climb in small steps", () => {
  const climb = [0, 1, 2, 3, 4, 5, 6];
  assert.equal(cumulativeGain(climb, 2).at(-1), 6);
});

test("output is monotonic", () => {
  const g = cumulativeGain([5, 3, 8, 2, 9, 9, 1, 4], 1);
  for (let i = 1; i < g.length; i++) assert.ok(g[i] >= g[i - 1]);
});

test("normalise scales the endpoint to the page total", () => {
  assert.deepEqual(normalise([0, 5, 10], 20), [0, 10, 20]);
  assert.deepEqual(normalise([0, 0], 20), [0, 0]);
  assert.deepEqual(normalise([0, 5], undefined), [0, 5]);
});

test("gainAt interpolates and clamps", () => {
  const d = [0, 100, 200];
  const g = [0, 10, 30];
  assert.equal(gainAt(d, g, 50), 5);
  assert.equal(gainAt(d, g, 150), 20);
  assert.equal(gainAt(d, g, -5), 0);
  assert.equal(gainAt(d, g, 999), 30);
});

test("cumulativeDistance ~111 km per degree of latitude", () => {
  const d = cumulativeDistance([{ lat: 0, lon: 0 }, { lat: 1, lon: 0 }]);
  assert.ok(Math.abs(d[1] - 111195) < 50);
});

test("buildProfile end to end", () => {
  const p = buildProfile([0, 1000, 2000], [10, 60, 40], { total: 100 });
  assert.equal(p.at(2000), 100);
  assert.equal(p.at(500), 50);
});

const { anchorTo, legAnchors } = require("../src/gain.js");

test("anchorTo hits each checkpoint exactly and stays monotonic", () => {
  const d = [0, 50, 100, 150, 200];
  const raw = [0, 10, 10, 30, 40];
  const anchors = [{ d: 0, g: 0 }, { d: 100, g: 5 }, { d: 200, g: 25 }];
  const g = anchorTo(d, raw, anchors);
  assert.equal(g[0], 0);
  assert.equal(g[2], 5);
  assert.equal(g[4], 25);
  assert.equal(g[1], 5); // all of leg 1's raw climb happened by 50 m
  for (let i = 1; i < g.length; i++) assert.ok(g[i] >= g[i - 1]);
});

test("anchorTo falls back to distance when raw is flat but the leg climbs", () => {
  const g = anchorTo([0, 50, 100], [0, 0, 0], [{ d: 0, g: 0 }, { d: 100, g: 10 }]);
  assert.deepEqual(g, [0, 5, 10]);
});

test("legAnchors sums paths and rescales to the chart span", () => {
  const legs = [
    { paths: [{ length: 60, elevationGain: 2 }, { length: 40, elevationGain: 1 }] },
    { paths: [{ length: 100, elevationGain: 7 }] },
  ];
  assert.deepEqual(legAnchors(legs, 100), [{ d: 0, g: 0 }, { d: 50, g: 3 }, { d: 100, g: 10 }]);
});

test("buildProfile scales anchored curve to a differing headline total", () => {
  const anchors = [{ d: 0, g: 0 }, { d: 1000, g: 50 }, { d: 2000, g: 100 }];
  const p = buildProfile([0, 1000, 2000], [0, 50, 100], { anchors, total: 120 });
  assert.equal(p.at(2000), 120);
  assert.equal(p.at(1000), 60);
  const q = buildProfile([0, 1000, 2000], [0, 50, 100], { anchors });
  assert.equal(q.at(2000), 100);
});

test("loss is the gain of the negated profile", () => {
  const e = [100, 80, 90, 60, 70];
  assert.equal(cumulativeGain(e.map((x) => -x)).at(-1), 50); // 20 + 30
  assert.equal(cumulativeGain(e).at(-1), 20); // 10 + 10
});

test("legAnchors reads elevationLoss and returns null when the field is absent", () => {
  const legs = [{ paths: [{ length: 100, elevationGain: 3, elevationLoss: 8 }] }];
  assert.deepEqual(legAnchors(legs, 100, "elevationLoss"), [{ d: 0, g: 0 }, { d: 100, g: 8 }]);
  assert.equal(legAnchors([{ paths: [{ length: 100 }] }], 100, "elevationLoss"), null);
});
