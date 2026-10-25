import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NumberedClimb } from "../../src/elevation-model.ts";
import type { ClimbsPlacement } from "../../src/pages/page.ts";
import { drawClimbBands } from "../../src/ui/climb-bands.ts";
import { renderClimbsPanel } from "../../src/ui/climbs-panel.ts";
import { createTestDocument, stubBoundingBox, stubScreenMatrix, requireElement } from "../support/dom.ts";

const noop = (): void => undefined;

function climb(number: number, durationSeconds: number | null): NumberedClimb {
  return {
    number,
    startMetres: 1000,
    endMetres: 1500,
    lengthMetres: 500,
    riseMetres: 40,
    averageGrade: 0.08,
    maximumGrade: 0.12,
    gainMetres: 40,
    durationSeconds,
    verticalMetresPerHour: durationSeconds === null ? null : 323,
  };
}

function setup(elevationUnit = "m") {
  const { document, window } = createTestDocument(
    `<div id="page"><svg id="chart"><g><g><path style="fill: red"></path></g></g><text>5.0 km</text><text>100 ${elevationUnit}</text></svg><div id="anchor"></div></div>`,
  );
  const chart = requireElement<SVGSVGElement>(document, "#chart");
  const anchor = requireElement(document, "#anchor");
  const placement: ClimbsPlacement = {
    position: "after",
    anchor,
    sectionClassName: "section-class",
    headingClassName: "heading-class",
    tableClassName: "table-class",
    horizontalPaddingPixels: 20,
  };
  return { document, window, chart, anchor, placement };
}

function lastCells(document: Document, count: number): (string | null)[] {
  return [...document.querySelectorAll("tbody td")].map((cell) => cell.textContent).slice(-count);
}

describe("renderClimbsPanel", () => {
  it("shows a labelled checkbox reflecting enabled and no table when off", () => {
    const { document, chart, placement } = setup();
    renderClimbsPanel(chart, [climb(1, null)], placement, { enabled: false, onToggle: noop });
    const box = requireElement<HTMLInputElement>(document, "#cumulative-gain-show-climbs");
    assert.equal(box.type, "checkbox");
    assert.equal(box.checked, false);
    const label = requireElement<HTMLLabelElement>(document, "label");
    assert.equal(label.htmlFor, "cumulative-gain-show-climbs");
    assert.equal(label.textContent, "Show climbs");
    assert.equal(document.querySelector("table"), null);
  });

  it("reports checkbox changes", () => {
    const { document, window, chart, placement } = setup();
    const calls: boolean[] = [];
    renderClimbsPanel(chart, [], placement, { enabled: false, onToggle: (enabled) => calls.push(enabled) });
    const box = requireElement<HTMLInputElement>(document, "#cumulative-gain-show-climbs");
    box.checked = true;
    box.dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.deepEqual(calls, [true]);
  });

  it("renders the table with scoped headers, heading and placement classes when enabled", () => {
    const { document, chart, anchor, placement } = setup();
    renderClimbsPanel(chart, [climb(1, null)], placement, { enabled: true, onToggle: noop });
    assert.equal(requireElement<HTMLInputElement>(document, "#cumulative-gain-show-climbs").checked, true);
    const table = requireElement(document, "table");
    const heading = requireElement(document, "#cumulative-gain-climbs-heading");
    assert.equal(heading.tagName, "H3");
    assert.equal(heading.className, "heading-class");
    assert.equal(table.getAttribute("aria-labelledby"), heading.id);
    assert.equal(table.className, "table-class");
    assert.equal(
      requireElement(document, "[data-cumulative-gain='climbs-table']").className,
      "section-class",
    );
    const headers = [...table.querySelectorAll("th")];
    assert.deepEqual(
      headers.map((header) => header.textContent),
      ["#", "Start", "Length", "Gain", "Avg. Grade", "Max. Grade"],
    );
    assert.ok(headers.every((header) => header.getAttribute("scope") === "col"));
    assert.deepEqual(lastCells(document, 6), ["1", "1.0 km", "0.50 km", "40 m", "8.0%", "12.0%"]);
    assert.equal(anchor.nextElementSibling?.getAttribute("data-cumulative-gain"), "climbs");
  });

  it("adds Time and VAM only when a climb has a duration, in the chart's units", () => {
    const { document, chart, placement } = setup("ft");
    renderClimbsPanel(chart, [climb(1, 125)], placement, { enabled: true, onToggle: noop });
    const headers = [...document.querySelectorAll("th")].map((header) => header.textContent);
    assert.deepEqual(headers.slice(-2), ["Time", "VAM"]);
    assert.deepEqual(lastCells(document, 2), ["2:05", "1,060 ft/h"]);
  });

  it("shows VAM in metres per hour", () => {
    const { document, chart, placement } = setup("m");
    renderClimbsPanel(chart, [climb(1, 125)], placement, { enabled: true, onToggle: noop });
    assert.deepEqual(lastCells(document, 1), ["323 m/h"]);
  });

  it("says when there are no climbs", () => {
    const { document, chart, placement } = setup();
    renderClimbsPanel(chart, [], placement, { enabled: true, onToggle: noop });
    assert.equal(requireElement(document, "tbody td").textContent, "No climbs detected");
  });

  it("places beside the anchor with the checkbox only", () => {
    const { document, chart, anchor, placement } = setup();
    renderClimbsPanel(
      chart,
      [climb(1, null)],
      { ...placement, position: "beside" },
      { enabled: true, onToggle: noop },
    );
    const label = requireElement<HTMLElement>(document, "label");
    assert.equal(label.nextElementSibling, anchor);
    assert.equal(label.style.marginRight, "12px");
    assert.equal(document.querySelector("table"), null);
  });

  it("places before the anchor", () => {
    const { document, chart, anchor, placement } = setup();
    renderClimbsPanel(chart, [], { ...placement, position: "before" }, { enabled: false, onToggle: noop });
    assert.equal(requireElement(document, "[data-cumulative-gain='climbs']").nextElementSibling, anchor);
  });

  it("rebuilds the table only when something changed", () => {
    const { document, chart, placement } = setup();
    const options = { enabled: true, onToggle: noop };
    renderClimbsPanel(chart, [climb(1, null)], placement, options);
    const table = document.querySelector("table");
    renderClimbsPanel(chart, [climb(1, null)], placement, options);
    assert.equal(document.querySelector("table"), table);
    renderClimbsPanel(chart, [climb(1, null), climb(2, null)], placement, options);
    assert.notEqual(document.querySelector("table"), table);
    renderClimbsPanel(chart, [climb(1, null), climb(2, null)], placement, { ...options, enabled: false });
    assert.equal(document.querySelector("table"), null);
  });

  it("highlights a band while its row is hovered", () => {
    const { document, window, chart, placement } = setup();
    const area = requireElement(chart, "path");
    stubBoundingBox(area, { x: 0, y: 0, width: 100, height: 50 });
    stubScreenMatrix(requireElement(chart, "g"), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    stubScreenMatrix(area, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    drawClimbBands(chart, [climb(1, null)], 0, 5000);
    renderClimbsPanel(chart, [climb(1, null)], placement, { enabled: true, onToggle: noop });
    const row = requireElement(document, "tbody tr");
    row.dispatchEvent(new window.MouseEvent("mouseenter"));
    assert.equal(requireElement(chart, "rect").getAttribute("fill-opacity"), "0.3");
    row.dispatchEvent(new window.MouseEvent("mouseleave"));
    assert.equal(requireElement(chart, "rect").getAttribute("fill-opacity"), "0.12");
  });
});
