const test = require("node:test");
const assert = require("node:assert/strict");
const { findClimbs } = require("../src/climbs.js");

// Piecewise-linear profile from [distance, elevation] knots, sampled every 10 m.
function profile(knots) {
  const d = [];
  const e = [];
  for (let x = 0; x <= knots[knots.length - 1][0]; x += 10) {
    let k = 0;
    while (knots[k + 1][0] < x) k++;
    const [x0, y0] = knots[k];
    const [x1, y1] = knots[k + 1];
    d.push(x);
    e.push(y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));
  }
  return [d, e];
}

test("finds a single climb and trims the flat run-in and run-out", () => {
  const [d, e] = profile([[0, 0], [1000, 0], [2000, 100], [3000, 100]]);
  const [c] = findClimbs(d, e);
  assert.ok(Math.abs(c.start - 1000) <= 60, `start ${c.start}`);
  assert.ok(Math.abs(c.end - 2000) <= 60, `end ${c.end}`);
  assert.ok(Math.abs(c.avgGrade - 0.1) < 0.01);
});

test("ignores bumps below the minimum gain", () => {
  const [d, e] = profile([[0, 0], [500, 20], [1000, 0]]);
  assert.equal(findClimbs(d, e).length, 0);
});

test("a short dip inside a climb doesn't split it", () => {
  const [d, e] = profile([[0, 0], [1000, 100], [1100, 95], [2000, 200]]);
  const climbs = findClimbs(d, e);
  assert.equal(climbs.length, 1);
  assert.ok(climbs[0].rise > 180);
});

test("a real descent splits two climbs", () => {
  const [d, e] = profile([[0, 0], [1000, 100], [2000, 40], [3000, 150]]);
  const climbs = findClimbs(d, e);
  assert.equal(climbs.length, 2);
  assert.ok(climbs[0].end < climbs[1].start);
});

test("max grade reflects the steepest stretch", () => {
  const [d, e] = profile([[0, 0], [1000, 40], [1300, 100], [2000, 120]]);
  const [c] = findClimbs(d, e);
  assert.ok(c.maxGrade > 0.15, `max ${c.maxGrade}`);
  assert.ok(c.avgGrade < c.maxGrade);
});

test("gentle drags under the minimum grade aren't climbs", () => {
  const [d, e] = profile([[0, 0], [5000, 50]]); // 1%
  assert.equal(findClimbs(d, e).length, 0);
});

test("a long flat splits a bump from the real climb", () => {
  // 25 m bump, 2 km flat, then a 200 m climb (the Waterville start).
  const [d, e] = profile([[0, 0], [500, 25], [2500, 22], [5000, 220]]);
  const climbs = findClimbs(d, e);
  assert.equal(climbs.length, 1);
  assert.ok(climbs[0].start > 2300, `start ${climbs[0].start}`);
  assert.ok(climbs[0].avgGrade > 0.07);
});
