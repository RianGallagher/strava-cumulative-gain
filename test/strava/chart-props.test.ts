import test from "node:test";
import assert from "node:assert/strict";
import { readChartProps } from "../../src/strava/chart-props.ts";
import { createTestDocument } from "../support/dom.ts";

interface FakeFiber {
  memoizedProps: unknown;
  return: FakeFiber | null;
}

const distances = [0, 100, 200];
const elevations = [10, 12, 11];
const legs = [{ paths: [{ length: 200, elevationGain: 2, elevationLoss: 1 }] }];

// Builds a fiber whose ancestors run up `depth` levels; depth 0 is the fiber itself.
function chain(propsByDepth: Map<number, unknown>, depth: number): FakeFiber | null {
  let fiber: FakeFiber | null = null;
  for (let level = depth; level >= 0; level -= 1) {
    fiber = { memoizedProps: propsByDepth.get(level) ?? {}, return: fiber };
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

test("finds the chart props at depth 3 and the legs at depth 6, returning React's own arrays", () => {
  const props = new Map<number, unknown>([
    [3, { distance: distances, elevation: elevations }],
    [6, { legs }],
  ]);
  const result = readChartProps(chartWithFiber(chain(props, 8)));
  assert.ok(result);
  assert.equal(result.distances, distances);
  assert.equal(result.elevations, elevations);
  assert.equal(result.legs, legs);
});

test("legs are null when no ancestor has them", () => {
  const props = new Map<number, unknown>([[1, { distance: distances, elevation: elevations }]]);
  assert.equal(readChartProps(chartWithFiber(chain(props, 3)))?.legs, null);
});

test("missing props give null", () => {
  assert.equal(readChartProps(chartWithFiber(chain(new Map(), 5))), null);
});

test("an element without a fiber gives null", () => {
  const { document } = createTestDocument("<div id='chart'></div>");
  const chart = document.getElementById("chart");
  assert.ok(chart);
  assert.equal(readChartProps(chart), null);
});

test("arrays of different lengths are not the chart", () => {
  const props = new Map<number, unknown>([[0, { distance: [0, 1, 2], elevation: [1, 2] }]]);
  assert.equal(readChartProps(chartWithFiber(chain(props, 2))), null);
});

test("gives up after 40 levels", () => {
  const props = new Map<number, unknown>([[41, { distance: distances, elevation: elevations }]]);
  assert.equal(readChartProps(chartWithFiber(chain(props, 45))), null);
});
