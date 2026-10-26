import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NumberedClimb } from "../../src/elevation-model.ts";
import { drawClimbBands, highlightClimbBand, removeClimbBands } from "../../src/ui/climb-bands.ts";
import { createTestDocument, stubBoundingBox, stubScreenMatrix, requireElement } from "../support/dom.ts";

const BANDS_SELECTOR = "g[data-cumulative-gain='bands']";

function climb(number: number, startMetres: number, endMetres: number): NumberedClimb {
  return {
    number,
    startMetres,
    endMetres,
    lengthMetres: endMetres - startMetres,
    riseMetres: 50,
    averageGrade: 0.05,
    maximumGrade: 0.08,
    gainMetres: 50,
    durationSeconds: null,
    verticalMetresPerHour: null,
  };
}

function createChart() {
  const { document } = createTestDocument(
    `<svg id="chart"><g id="plot"><g id="wrapper"><path id="area" style="fill: red"></path></g><g id="crosshair"></g></g></svg>`,
  );
  const chart = requireElement<SVGSVGElement>(document, "#chart");
  const plot = requireElement(document, "#plot");
  const area = requireElement(document, "#area");
  stubBoundingBox(area, { x: 10, y: 5, width: 200, height: 80 });
  stubScreenMatrix(plot, { a: 1, b: 0, c: 0, d: 1, e: 45, f: 10 });
  stubScreenMatrix(area, { a: 2, b: 0, c: 0, d: 3, e: 4, f: 6 });
  return { chart, plot };
}

describe("drawClimbBands", () => {
  it("inserts one marked, non-interactive group immediately before the area's top-level group", () => {
    const { chart, plot } = createChart();
    drawClimbBands(chart, [climb(1, 0, 500)], 0, 1000);
    const group = requireElement(plot, BANDS_SELECTOR);
    assert.equal(group.getAttribute("pointer-events"), "none");
    assert.equal(group.nextElementSibling, plot.querySelector("#wrapper"));
    assert.equal(chart.querySelectorAll(BANDS_SELECTOR).length, 1);
  });

  it("uses the area's coordinate transform and spans the full distance", () => {
    const { chart } = createChart();
    drawClimbBands(chart, [climb(1, 250, 500)], 0, 1000);
    const group = requireElement(chart, BANDS_SELECTOR);
    assert.equal(group.getAttribute("transform"), "matrix(2,0,0,3,-41,-4)");
    const band = requireElement(group, "rect");
    assert.equal(band.getAttribute("x"), String(10 + 50));
    assert.equal(band.getAttribute("width"), "50");
    assert.equal(band.getAttribute("fill"), "rgb(252, 82, 0)");
    assert.equal(band.getAttribute("fill-opacity"), "0.12");
    assert.equal(requireElement(group, "text").textContent, "1");
  });

  it("does not redraw or reinsert when nothing changed", () => {
    const { chart, plot } = createChart();
    drawClimbBands(chart, [climb(1, 0, 500)], 0, 1000);
    const group = requireElement(chart, BANDS_SELECTOR);
    const firstBand = group.querySelector("rect");
    let insertions = 0;
    const original = plot.insertBefore.bind(plot);
    plot.insertBefore = ((node: Node, reference: Node | null) => {
      insertions += 1;
      return original(node, reference);
    }) as typeof plot.insertBefore;
    drawClimbBands(chart, [climb(1, 0, 500)], 0, 1000);
    assert.equal(insertions, 0);
    assert.equal(group.querySelector("rect"), firstBand);
    drawClimbBands(chart, [climb(1, 0, 600)], 0, 1000);
    assert.notEqual(group.querySelector("rect"), firstBand);
  });

  it("puts the group back when it has been moved", () => {
    const { chart, plot } = createChart();
    drawClimbBands(chart, [climb(1, 0, 500)], 0, 1000);
    const group = requireElement(chart, BANDS_SELECTOR);
    plot.append(group);
    drawClimbBands(chart, [climb(1, 0, 500)], 0, 1000);
    assert.equal(group.nextElementSibling, plot.querySelector("#wrapper"));
  });

  it("highlights one band and removes the group", () => {
    const { chart } = createChart();
    drawClimbBands(chart, [climb(1, 0, 400), climb(2, 500, 900)], 0, 1000);
    highlightClimbBand(chart, 2);
    const opacities = [...chart.querySelectorAll("rect")].map((band) => band.getAttribute("fill-opacity"));
    assert.deepEqual(opacities, ["0.12", "0.3"]);
    highlightClimbBand(chart, null);
    assert.ok(
      [...chart.querySelectorAll("rect")].every((band) => band.getAttribute("fill-opacity") === "0.12"),
    );
    removeClimbBands(chart);
    assert.equal(chart.querySelector(BANDS_SELECTOR), null);
  });
});
