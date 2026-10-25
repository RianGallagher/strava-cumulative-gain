import assert from "node:assert/strict";
import test from "node:test";
import { crosshairDistance } from "../../src/tooltip/crosshair.ts";
import type { ShownDistance } from "../../src/tooltip/tooltip-text.ts";
import { createTestDocument, setBoundingRect } from "../support/dom.ts";

const SIX_KILOMETRES: ShownDistance = { metres: 6000, unit: "km", resolutionMetres: 100 };

interface ChartLayout {
  /** Left edge of each vertical line, in page pixels. */
  lineLeftsPixels: readonly number[];
  lineClasses?: readonly string[];
  tooltipLeftPixels: number;
}

function setUpChart(layout: ChartLayout): { chart: SVGSVGElement; tooltip: Element } {
  const lines = layout.lineLeftsPixels
    .map(
      (_leftPixels, index) =>
        `<line class="${layout.lineClasses?.[index] ?? ""}" x1="5" x2="5" y1="0" y2="180"></line>`,
    )
    .join("");
  const { document } = createTestDocument(
    '<svg id="chart"><text class="tick">0.0 km</text><text class="tick">2.0 km</text>' +
      '<text class="label">Elevation</text>' +
      lines +
      '<g class="overlay"><g id="tooltip"><text>Distance 6.0 km</text></g></g></svg>',
  );
  const chart = document.getElementById("chart") as unknown as SVGSVGElement;
  const tooltip = document.getElementById("tooltip");
  assert.ok(tooltip);
  setBoundingRect(chart, { left: 300, top: 0, width: 900, height: 200 });
  const [zeroTick, twoKilometreTick] = document.querySelectorAll(".tick");
  setBoundingRect(zeroTick, { left: 381, top: 190, width: 1, height: 10 });
  setBoundingRect(twoKilometreTick, { left: 486.32, top: 190, width: 1, height: 10 });
  document.querySelectorAll("line").forEach((line, index) => {
    setBoundingRect(line, { left: layout.lineLeftsPixels[index] ?? 0, top: 10, width: 1, height: 180 });
  });
  setBoundingRect(tooltip, { left: layout.tooltipLeftPixels, top: 20, width: 110, height: 60 });
  return { chart, tooltip };
}

test("interpolates the distance under the crosshair from the axis ticks", () => {
  const { chart, tooltip } = setUpChart({ lineLeftsPixels: [699.5], tooltipLeftPixels: 705 });
  const distanceMetres = crosshairDistance(chart, tooltip, SIX_KILOMETRES);
  assert.ok(distanceMetres !== null);
  assert.ok(Math.abs(distanceMetres - 6048) < 1, String(distanceMetres));
});

test("returns null when the only nearby line disagrees with the shown distance", () => {
  const { chart, tooltip } = setUpChart({ lineLeftsPixels: [899.5], tooltipLeftPixels: 905 });
  assert.equal(crosshairDistance(chart, tooltip, SIX_KILOMETRES), null);
});

test("prefers a line marked as the crosshair over a nearer gridline", () => {
  const { chart, tooltip } = setUpChart({
    lineLeftsPixels: [703, 699.5],
    lineClasses: ["grid", "crosshair"],
    tooltipLeftPixels: 705,
  });
  const distanceMetres = crosshairDistance(chart, tooltip, SIX_KILOMETRES);
  assert.ok(distanceMetres !== null);
  assert.ok(Math.abs(distanceMetres - 6048) < 1, String(distanceMetres));
});

test("returns null with fewer than two distance ticks", () => {
  const { document } = createTestDocument('<svg id="chart"><text>0.0 km</text><g id="tooltip"></g></svg>');
  const chart = document.getElementById("chart") as unknown as SVGSVGElement;
  const tooltip = document.getElementById("tooltip");
  assert.ok(tooltip);
  assert.equal(crosshairDistance(chart, tooltip, SIX_KILOMETRES), null);
});
