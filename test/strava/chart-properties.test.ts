import test from "node:test";
import assert from "node:assert/strict";
import { readChartProperties } from "../../src/strava/chart-properties.ts";
import { createTestDocument } from "../support/dom.ts";

interface FakeFiber {
  memoizedProps: unknown;
  return: FakeFiber | null;
}

const distancesMetres = [0, 100, 200];
const elevationsMetres = [10, 12, 11];
const legs = [{ paths: [{ length: 200, elevationGain: 2, elevationLoss: 1 }] }];

// Builds a fiber whose ancestors run up `depth` levels; depth 0 is the fiber itself.
function chain(propertiesByDepth: Map<number, unknown>, depth: number): FakeFiber | null {
  let fiber: FakeFiber | null = null;
  for (let level = depth; level >= 0; level -= 1) {
    fiber = { memoizedProps: propertiesByDepth.get(level) ?? {}, return: fiber };
  }
  return fiber;
}

function chartWithFiber(fiber: FakeFiber | null): Element {
  const { document } = createTestDocument("<div id='chart'></div>");
  const chart = document.getElementById("chart");
  assert.ok(chart);
  Object.defineProperty(chart, "__reactFiber$abc", { value: fiber, enumerable: true });
  return chart;
}

test("finds the chart properties at depth 3 and the legs at depth 6, returning React's own arrays", () => {
  const properties = new Map<number, unknown>([
    [3, { distance: distancesMetres, elevation: elevationsMetres }],
    [6, { legs }],
  ]);
  const result = readChartProperties(chartWithFiber(chain(properties, 8)));
  assert.ok(result);
  assert.equal(result.distancesMetres, distancesMetres);
  assert.equal(result.elevationsMetres, elevationsMetres);
  assert.equal(result.legs, legs);
});

test("legs are null when no ancestor has them", () => {
  const properties = new Map<number, unknown>([
    [1, { distance: distancesMetres, elevation: elevationsMetres }],
  ]);
  assert.equal(readChartProperties(chartWithFiber(chain(properties, 3)))?.legs, null);
});

test("missing properties give null", () => {
  assert.equal(readChartProperties(chartWithFiber(chain(new Map(), 5))), null);
});

test("an element without a fiber gives null", () => {
  const { document } = createTestDocument("<div id='chart'></div>");
  const chart = document.getElementById("chart");
  assert.ok(chart);
  assert.equal(readChartProperties(chart), null);
});

test("arrays of different lengths are not the chart", () => {
  const properties = new Map<number, unknown>([[0, { distance: [0, 1, 2], elevation: [1, 2] }]]);
  assert.equal(readChartProperties(chartWithFiber(chain(properties, 2))), null);
});

test("gives up after 40 levels", () => {
  const properties = new Map<number, unknown>([
    [41, { distance: distancesMetres, elevation: elevationsMetres }],
  ]);
  assert.equal(readChartProperties(chartWithFiber(chain(properties, 45))), null);
});
