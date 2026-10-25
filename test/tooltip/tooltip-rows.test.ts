import assert from "node:assert/strict";
import test from "node:test";
import { MARKER_ATTRIBUTE } from "../../src/settings.ts";
import {
  createTooltipRows,
  findElevationRow,
  findProfileTooltips,
  type ExtraRow,
} from "../../src/tooltip/tooltip-rows.ts";
import { createTestDocument } from "../support/dom.ts";

// Copied from Strava's activity page (D3): rows positioned with y, 16 px apart.
function activityRow(id: string, title: string, value: string, positionY: number): string {
  return (
    `<text id="infobox-text-${id}" x="10" y="${String(positionY)}">` +
    `<tspan class="title">${title}: </tspan><tspan class="value" font-weight="bold">${value}</tspan></text>`
  );
}

const ACTIVITY_TOOLTIP =
  '<svg><g id="infoBox"><rect x="0" y="20" width="150" height="79"></rect>' +
  activityRow("distance", "Dist", "5.4 km", 41) +
  activityRow("altitude", "Elev", "56 m", 57) +
  activityRow("grade", "Grade", "-13.3%", 73) +
  activityRow("pace", "Pace", "4:54/km", 89) +
  "</g></svg>";

// Copied from Strava's route page (React): rows positioned with transform.
function routeRow(title: string, value: string, positionY: number): string {
  return (
    `<text dy="1em" transform="translate(6, ${String(positionY)})"><tspan>${title}</tspan>` +
    `<tspan class="Tooltip_value__x7Kq2" dx="5">${value}</tspan></text>`
  );
}

const ROUTE_TOOLTIP_GROUP =
  '<g class="Tooltip_infoBox__Q1bTz" transform="translate(6, 0)"><rect x="0" y="2" height="56" width="105"></rect>' +
  routeRow("Distance", "3.29 km", 6) +
  routeRow("Elevation", "144 m", 22) +
  routeRow("Grade", "4.1%", 38) +
  "</g>";

const BUILDER_TOOLTIP =
  '<div class="tooltip"><div>Distance 3.50 km</div>' +
  "<div><span>Elevation</span> <span>133</span><span> m</span></div>" +
  "<div>Grade -12.6%</div><div>Surface Type Not specified</div></div>";

const GAIN_AND_LOSS: readonly ExtraRow[] = [
  { key: "gain", label: "Gain", value: "120 m" },
  { key: "loss", label: "Loss", value: "64 m" },
];

const CLIMB: ExtraRow = { key: "climb", label: "Climb 4", value: "2.7 km · 14.0%" };

function setUp(html: string): { document: Document; tooltip: Element; stravaChanges: { count: number } } {
  const { document } = createTestDocument(html);
  const [tooltip] = findProfileTooltips(document.body);
  assert.ok(tooltip, "profile tooltip found");
  return { document, tooltip, stravaChanges: { count: 0 } };
}

function textOf(element: Element): string {
  return element.textContent;
}

function rowByText(tooltip: Element, prefix: string): Element {
  const row = [...tooltip.querySelectorAll("text, div")].find((candidate) =>
    textOf(candidate).startsWith(prefix),
  );
  assert.ok(row, `row starting "${prefix}"`);
  return row;
}

function extraRow(tooltip: Element, key: ExtraRow["key"]): Element {
  const row = tooltip.querySelector(`[${MARKER_ATTRIBUTE}="${key}"]`);
  assert.ok(row, `${key} row`);
  return row;
}

function background(tooltip: Element): Element {
  const rectangle = tooltip.querySelector("rect");
  assert.ok(rectangle);
  return rectangle;
}

/** Row titles from top to bottom, as the tooltip shows them. */
function titlesInOrder(tooltip: Element): string[] {
  return [...tooltip.querySelectorAll("text")]
    .map((row) => ({ title: row.firstChild?.textContent ?? "", positionY: Number(row.getAttribute("y")) }))
    .sort((first, second) => first.positionY - second.positionY)
    .map((row) => row.title);
}

async function deliverMutationRecords(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("findProfileTooltips finds the smallest element holding distance, elevation and grade", () => {
  const { document } = createTestDocument(
    "<div><p>Distance 15.20 km Moving Time 1:17:02 Elevation 95 m</p>" + ACTIVITY_TOOLTIP + "</div>",
  );
  const tooltips = findProfileTooltips(document.body);
  assert.deepEqual(
    tooltips.map((tooltip) => tooltip.id),
    ["infoBox"],
  );
});

test("findElevationRow finds the Elevation row and skips added rows", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  assert.equal(findElevationRow(tooltip)?.id, "infobox-text-altitude");
  createTooltipRows(() => undefined).show(tooltip, GAIN_AND_LOSS);
  assert.equal(findElevationRow(tooltip)?.id, "infobox-text-altitude");
});

test("activity tooltip: Gain and Loss go under Elevation, later rows move down 32 and the box grows", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  createTooltipRows(() => undefined).show(tooltip, GAIN_AND_LOSS);

  assert.equal(textOf(extraRow(tooltip, "gain")), "Gain: 120 m");
  assert.equal(textOf(extraRow(tooltip, "loss")), "Loss: 64 m");
  assert.equal(extraRow(tooltip, "gain").getAttribute("y"), "73");
  assert.equal(extraRow(tooltip, "loss").getAttribute("y"), "89");
  assert.equal(rowByText(tooltip, "Grade").getAttribute("y"), "105");
  assert.equal(rowByText(tooltip, "Pace").getAttribute("y"), "121");
  assert.equal(background(tooltip).getAttribute("height"), "111");
  assert.equal(background(tooltip).getAttribute("width"), "150", "never narrower than Strava's box");
  // Strava's fonts are kept, its id is not duplicated, and the rows sit after Strava's own.
  assert.equal(extraRow(tooltip, "gain").querySelector(".value")?.getAttribute("font-weight"), "bold");
  assert.equal(extraRow(tooltip, "gain").hasAttribute("id"), false);
  assert.deepEqual(
    [...tooltip.children].slice(-2).map((row) => row.getAttribute(MARKER_ATTRIBUTE)),
    ["gain", "loss"],
  );
});

test("route tooltip: transform rows move down 32 and the box grows to fit the widest row", () => {
  const { tooltip } = setUp(`<svg>${ROUTE_TOOLTIP_GROUP}</svg>`);
  createTooltipRows(() => undefined).show(tooltip, GAIN_AND_LOSS);

  assert.equal(textOf(extraRow(tooltip, "gain")), "Gain120 m");
  assert.equal(extraRow(tooltip, "gain").getAttribute("transform"), "translate(6, 38)");
  assert.equal(extraRow(tooltip, "loss").getAttribute("transform"), "translate(6, 54)");
  assert.equal(rowByText(tooltip, "Grade").getAttribute("transform"), "translate(6, 70)");
  assert.equal(background(tooltip).getAttribute("height"), "88");
  // getBBox is stubbed to 100 wide; the Elevation row sits 6 in from the box on both sides.
  assert.equal(background(tooltip).getAttribute("width"), "112");
});

test("showing the same rows again changes nothing", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  const firstPass = tooltip.outerHTML;
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(tooltip.outerHTML, firstPass);
});

test("collision: Strava adds two rows and writes the same box height we wrote; the box still grows", async () => {
  const { tooltip, stravaChanges } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => {
    stravaChanges.count += 1;
  });
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(background(tooltip).getAttribute("height"), "111");

  // Heart rate and cadence lines switched on: Strava lays out its six rows
  // and grows its box by 32, to exactly the height we had written.
  rowByText(tooltip, "Grade").setAttribute("y", "73");
  rowByText(tooltip, "Pace").setAttribute("y", "89");
  tooltip.insertAdjacentHTML("beforeend", activityRow("heartrate", "HR", "151 bpm", 105));
  tooltip.insertAdjacentHTML("beforeend", activityRow("cadence", "Cadence", "88 spm", 121));
  background(tooltip).setAttribute("height", "111");
  await deliverMutationRecords();
  assert.ok(stravaChanges.count > 0, "Strava's writes reported");

  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(background(tooltip).getAttribute("height"), "143");
  assert.deepEqual(titlesInOrder(tooltip), [
    "Dist: ",
    "Elev: ",
    "Gain: ",
    "Loss: ",
    "Grade: ",
    "Pace: ",
    "HR: ",
    "Cadence: ",
  ]);
  assert.equal(rowByText(tooltip, "Cadence").getAttribute("y"), "153");
});

test("Strava writes made just before show are taken into account without waiting", () => {
  const { tooltip, stravaChanges } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => {
    stravaChanges.count += 1;
  });
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  background(tooltip).setAttribute("height", "111");
  rowByText(tooltip, "Grade").setAttribute("y", "73");
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(background(tooltip).getAttribute("height"), "143");
  assert.equal(rowByText(tooltip, "Grade").getAttribute("y"), "105");
});

test("our own writes are not reported as Strava changes", async () => {
  const { tooltip, stravaChanges } = setUp(ACTIVITY_TOOLTIP);
  createTooltipRows(() => {
    stravaChanges.count += 1;
  }).show(tooltip, GAIN_AND_LOSS);
  await deliverMutationRecords();
  assert.equal(stravaChanges.count, 0);
});

test("Strava removing a tracked attribute never leads to NaN", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  rowByText(tooltip, "Dist").removeAttribute("y");
  background(tooltip).removeAttribute("height");
  tooltipRows.show(tooltip, GAIN_AND_LOSS);

  const values = [tooltip, ...tooltip.querySelectorAll("*")].flatMap((element) =>
    [...element.attributes].map((attribute) => `${attribute.name}=${attribute.value}`),
  );
  assert.deepEqual(
    values.filter((value) => /NaN|=null$/.test(value)),
    [],
  );
  assert.equal(extraRow(tooltip, "gain").getAttribute("y"), "73");

  // Strava puts the height back: it becomes the new base.
  background(tooltip).setAttribute("height", "79");
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(background(tooltip).getAttribute("height"), "111");
});

test("a label containing a digit is never taken for the value", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  createTooltipRows(() => undefined).show(tooltip, [...GAIN_AND_LOSS, CLIMB]);
  assert.equal(textOf(extraRow(tooltip, "climb")), "Climb 4: 2.7 km · 14.0%");
  assert.equal(extraRow(tooltip, "climb").getAttribute("y"), "105");
  assert.equal(background(tooltip).getAttribute("height"), "127");
});

test("the climb row goes when the next show omits it", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, [...GAIN_AND_LOSS, CLIMB]);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(tooltip.querySelector(`[${MARKER_ATTRIBUTE}="climb"]`), null);
  assert.equal(rowByText(tooltip, "Grade").getAttribute("y"), "105");
  assert.equal(background(tooltip).getAttribute("height"), "111");
});

test("added rows follow the Elevation row's display attribute", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  // D3 hides every <text> on mouse-leave, then re-shows only its own rows.
  for (const row of tooltip.querySelectorAll("text")) row.setAttribute("display", "none");
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(extraRow(tooltip, "gain").getAttribute("display"), "none");

  for (const row of tooltip.querySelectorAll(`text:not([${MARKER_ATTRIBUTE}])`))
    row.setAttribute("display", "block");
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(extraRow(tooltip, "gain").getAttribute("display"), "block");
  assert.equal(extraRow(tooltip, "loss").getAttribute("display"), "block");
});

test("added rows are rebuilt from the live Elevation row when their value changes", () => {
  const { tooltip } = setUp(ACTIVITY_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  rowByText(tooltip, "Elev").querySelector(".value")?.setAttribute("font-weight", "normal");
  tooltipRows.show(tooltip, [{ key: "gain", label: "Gain", value: "121 m" }, GAIN_AND_LOSS[1]]);
  assert.equal(textOf(extraRow(tooltip, "gain")), "Gain: 121 m");
  assert.equal(extraRow(tooltip, "gain").querySelector(".value")?.getAttribute("font-weight"), "normal");
});

test("HTML tooltip: rows go straight after Elevation, in order, without a doubled unit", () => {
  const { tooltip } = setUp(BUILDER_TOOLTIP);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, [...GAIN_AND_LOSS, CLIMB]);
  assert.deepEqual([...tooltip.children].map(textOf), [
    "Distance 3.50 km",
    "Elevation 133 m",
    "Gain 120 m",
    "Loss 64 m",
    "Climb 4 2.7 km · 14.0%",
    "Grade -12.6%",
    "Surface Type Not specified",
  ]);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  assert.equal(tooltip.children.length, 6);
});

test("a tooltip removed and re-created gets its rows once", () => {
  const { document, tooltip } = setUp(`<svg>${ROUTE_TOOLTIP_GROUP}</svg>`);
  const tooltipRows = createTooltipRows(() => undefined);
  tooltipRows.show(tooltip, GAIN_AND_LOSS);
  const chart = tooltip.parentElement;
  assert.ok(chart);
  tooltip.remove();
  chart.insertAdjacentHTML("beforeend", ROUTE_TOOLTIP_GROUP);

  const [recreated] = findProfileTooltips(document.body);
  assert.ok(recreated);
  tooltipRows.show(recreated, GAIN_AND_LOSS);
  tooltipRows.show(recreated, GAIN_AND_LOSS);
  assert.equal(recreated.querySelectorAll(`[${MARKER_ATTRIBUTE}]`).length, 2);
  assert.equal(rowByText(recreated, "Grade").getAttribute("transform"), "translate(6, 70)");
  assert.equal(background(recreated).getAttribute("height"), "88");
});
