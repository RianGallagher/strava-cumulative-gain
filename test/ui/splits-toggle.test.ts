import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildElevationModel } from "../../src/elevation-model.ts";
import type { SplitsView } from "../../src/settings.ts";
import { renderSplitsToggle } from "../../src/ui/splits-toggle.ts";
import { createTestDocument, requireElement } from "../support/dom.ts";

// Climbs 10 m, then 20 m, then falls 5 m over the last half kilometre.
const model = buildElevationModel({
  distances: [0, 1000, 2000, 2500],
  elevations: [0, 10, 30, 25],
});

const NET_HTML = ["<span>10 m</span>", "<span>20 m</span>", "<b>-5</b> m"];

const noop = (): void => undefined;

function createTable(unitHeader: string, elevationCells: readonly string[]) {
  const rows = elevationCells.map((html) => `<tr><td>1</td><td>5:00</td><td>${html}</td></tr>`).join("");
  const { document } = createTestDocument(
    `<div id="splits-container"><table><thead><tr><th>${unitHeader}</th><th>Pace</th><th>Elev</th></tr></thead><tbody>${rows}</tbody></table></div>`,
  );
  return { document, table: requireElement<HTMLTableElement>(document, "table") };
}

function cellTexts(table: HTMLTableElement): string[] {
  return [...table.tBodies[0].rows].map((row) => row.cells[2].textContent);
}

describe("renderSplitsToggle", () => {
  it("turns the Elev header into a button that reports the next view", () => {
    const { table } = createTable("km", NET_HTML);
    const views: SplitsView[] = [];
    renderSplitsToggle(table, model, 2500, { view: "net", onToggle: (view) => views.push(view) });
    const button = requireElement<HTMLButtonElement>(table, "th button[data-cumulative-gain='split-toggle']");
    assert.equal(button.type, "button");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.equal(button.style.cssText, "all: unset; cursor: pointer;");
    assert.equal(requireElement(button, "[aria-hidden='true']").textContent, "Elev ⇅");
    assert.match(button.textContent, /Show gain and loss per split/);
    button.click();
    assert.deepEqual(views, ["gain-loss"]);
  });

  it("reports net when the gain-loss view is showing", () => {
    const { table } = createTable("km", NET_HTML);
    const views: SplitsView[] = [];
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: (view) => views.push(view) });
    requireElement<HTMLButtonElement>(table, "button").click();
    assert.deepEqual(views, ["net"]);
  });

  it("injects one focus-visible style", () => {
    const { document, table } = createTable("km", NET_HTML);
    renderSplitsToggle(table, model, 2500, { view: "net", onToggle: noop });
    renderSplitsToggle(table, model, 2500, { view: "net", onToggle: noop });
    const styles = document.head.querySelectorAll("style[data-cumulative-gain]");
    assert.equal(styles.length, 1);
    assert.match(
      styles[0].textContent,
      /:focus-visible \{ outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; \}/,
    );
  });

  it("writes gain and loss per 1000 m split, ending at the chart end", () => {
    const { table } = createTable("km", NET_HTML);
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: noop });
    assert.deepEqual(cellTexts(table), ["+10/−0", "+20/−0", "+0/−5"]);
    const button = requireElement(table, "button");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(requireElement(button, "[aria-hidden='true']").textContent, "+/− ⇅");
    assert.equal(
      requireElement(table, "thead th:nth-child(3)").getAttribute("style"),
      "white-space: nowrap;",
    );
    assert.equal(table.tBodies[0].rows[0].cells[2].style.whiteSpace, "nowrap");
  });

  it("restores Strava's original cell HTML exactly in net view", () => {
    const { table } = createTable("km", NET_HTML);
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: noop });
    renderSplitsToggle(table, model, 2500, { view: "net", onToggle: noop });
    const restored = [...table.tBodies[0].rows].map((row) => row.cells[2].innerHTML);
    assert.deepEqual(restored, NET_HTML);
    assert.equal(requireElement(table, "button").getAttribute("aria-pressed"), "false");
  });

  it("uses 1609.344 m splits and feet for an MI table with feet cells", () => {
    const { table } = createTable("mi", ["10 ft", "20 ft"]);
    const longModel = buildElevationModel({ distances: [0, 1609.344, 3218.688], elevations: [0, 30, 30] });
    renderSplitsToggle(table, longModel, 3218.688, { view: "gain-loss", onToggle: noop });
    assert.deepEqual(cellTexts(table), ["+98/−0", "+0/−0"]);
  });

  it("only rewrites a cell when its content changes", () => {
    const { table } = createTable("km", NET_HTML);
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: noop });
    const cell = table.tBodies[0].rows[0].cells[2];
    const textNode = cell.firstChild;
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: noop });
    assert.equal(cell.firstChild, textNode);
  });

  it("leaves tables without a km or mi header alone", () => {
    const { table } = createTable("Split", NET_HTML);
    renderSplitsToggle(table, model, 2500, { view: "gain-loss", onToggle: noop });
    assert.equal(table.querySelector("button"), null);
  });
});
