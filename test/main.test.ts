import assert from "node:assert/strict";
import test from "node:test";
import { attachChartProperties, nextDataScript } from "./pages/fixtures.ts";
import { flushFrames, requireElement, setBoundingRect, stubScreenMatrix } from "./support/dom.ts";
import { addedRowText, finish, startOn, waitFor, type Harness } from "./support/main-harness.ts";

const BANDS_SELECTOR = "g[data-cumulative-gain='bands']";
const CLIMBS_TABLE_SELECTOR = "div[data-cumulative-gain='climbs-table']";
const STREAMS_URL = "/activities/42/streams";

// Flat to 500 m, a 10% climb to 1500 m, then a gentle descent: gain at 1 km
// is 50 m and the climb covers it.
const activityDistances = Array.from({ length: 21 }, (_unused, index) => index * 100);
const activityElevations = activityDistances.map((distanceMetres) => {
  if (distanceMetres <= 500) return 100;
  if (distanceMetres <= 1500) return 100 + (distanceMetres - 500) / 10;
  return 200 - (distanceMetres - 1500) / 20;
});
const activityStreams = JSON.stringify({ distance: activityDistances, altitude: activityElevations });

function activityRow(id: string, title: string, value: string, positionPixels: number): string {
  return (
    `<text id="infobox-text-${id}" x="10" y="${String(positionPixels)}">` +
    `<tspan class="title">${title}: </tspan><tspan class="value">${value}</tspan></text>`
  );
}

const activityHtml = `
  <section id="elevation-profile"><div id="elevation-chart">
    <svg id="chart"><g id="plot"><path id="area" style="fill: red"></path>
      <g id="infoBox"><rect x="0" y="20" width="150" height="63"></rect>
        ${activityRow("distance", "Dist", "1.0 km", 41)}
        ${activityRow("altitude", "Elev", "150 m", 57)}
        ${activityRow("grade", "Grade", "10.0%", 73)}
      </g>
    </g></svg>
  </div></section>
  <div id="splits-container"><table>
    <thead><tr><th>Km</th><th>Pace</th><th>Elev</th></tr></thead>
    <tbody><tr><td>1</td><td>5:00</td><td>50 m</td></tr><tr><td>2</td><td>5:30</td><td>75 m</td></tr></tbody>
  </table></div>`;

function routeRow(title: string, value: string, positionPixels: number): string {
  return `<text dy="1em" transform="translate(6, ${String(positionPixels)})"><tspan>${title}</tspan> <tspan>${value}</tspan></text>`;
}

function routeChartHtml(distanceText: string, elevationText: string): string {
  return (
    `<div id="elevation-chart"><svg id="route-chart"><g><path style="fill: red"></path>` +
    `<g transform="translate(6, 0)"><rect x="0" y="2" height="56" width="105"></rect>` +
    routeRow("Distance", distanceText, 6) +
    routeRow("Elevation", elevationText, 22) +
    routeRow("Grade", "-2.0%", 38) +
    `</g></g></svg></div>`
  );
}

// Strava's route chart properties: computed gain 30 m, ending 20 m lower.
const routeDistances = [0, 1000, 2000];
const routeElevations = [0, 30, 10];

const streamsBodies = { [STREAMS_URL]: activityStreams };

function startOnActivity(storedSettings: Record<string, string> = {}): Harness {
  return startOn("/activities/42", activityHtml, { bodiesByUrlPrefix: streamsBodies, storedSettings });
}

test("an activity tooltip gets Gain and Loss from the fetched streams", async () => {
  const harness = startOnActivity();
  const { document, window } = harness;
  await waitFor(window, () => addedRowText(document, "loss") !== undefined, "the Loss row");
  assert.equal(addedRowText(document, "gain"), "Gain: 50 m");
  assert.equal(addedRowText(document, "loss"), "Loss: 0 m");
  assert.equal(document.querySelector("[data-cumulative-gain='climb']"), null);
  assert.ok(harness.requestedUrls.every((url) => url.startsWith(STREAMS_URL)));
  finish(harness);
});

test("the activity's splits get the gain/loss toggle", async () => {
  const harness = startOnActivity({ "cumulative-gain:splits": "gainloss" });
  const { document, window } = harness;
  await waitFor(
    window,
    () => document.querySelector("button[data-cumulative-gain='split-toggle']") !== null,
    "the toggle",
  );
  const cells = [...document.querySelectorAll("#splits-container tbody tr")].map(
    (row) => (row as HTMLTableRowElement).cells.item(2)?.textContent,
  );
  assert.deepEqual(cells, ["+50/−0", "+50/−25"]);
  finish(harness);
});

test("a route tooltip's Gain matches Strava's headline at the end of the route", async () => {
  const html =
    routeChartHtml("2.00 km", "10 m") +
    nextDataScript({
      id: 7,
      elevation: [
        [0, 0],
        [2000, 10],
      ],
      elevationGain: 36,
    });
  const harness = startOn("/routes/7", html, { bodiesByUrlPrefix: streamsBodies });
  const { document, window } = harness;
  attachChartProperties(requireElement(document, "#route-chart"), {
    distance: routeDistances,
    elevation: routeElevations,
  });
  await waitFor(window, () => addedRowText(document, "gain") !== undefined, "the Gain row");
  assert.equal(addedRowText(document, "gain"), "Gain 36 m");
  assert.equal(addedRowText(document, "loss"), "Loss 26 m");
  assert.deepEqual(harness.requestedUrls, []);
  finish(harness);
});

test("after navigating from an activity to a route, the route's data is shown, never the activity's", async () => {
  const harness = startOnActivity();
  const { document, window } = harness;
  await waitFor(window, () => addedRowText(document, "gain") === "Gain: 50 m", "the activity's Gain");

  window.history.pushState({}, "", "/routes/7");
  document.body.innerHTML = routeChartHtml("1.00 km", "30 m");
  const routeChart = requireElement(document, "#route-chart");
  setBoundingRect(routeChart, { left: 0, top: 0, width: 600, height: 200 });
  attachChartProperties(routeChart, { distance: routeDistances, elevation: routeElevations });

  await waitFor(window, () => addedRowText(document, "gain") !== undefined, "the route's Gain row");
  assert.equal(addedRowText(document, "gain"), "Gain 30 m");
  assert.equal(addedRowText(document, "loss"), "Loss 0 m");
  assert.ok(harness.requestedUrls.every((url) => url.startsWith(STREAMS_URL)));
  finish(harness);
});

function stubChartGeometry(document: Document): void {
  stubScreenMatrix(requireElement(document, "#plot"), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  stubScreenMatrix(requireElement(document, "#area"), { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
}

test("with climbs off there are no bands or table; turning them on adds both and the Climb row", async () => {
  const harness = startOnActivity();
  const { document, window } = harness;
  stubChartGeometry(document);
  await waitFor(
    window,
    () => document.querySelector("#cumulative-gain-show-climbs") !== null,
    "the checkbox",
  );
  await flushFrames(window);
  assert.equal(document.querySelector(BANDS_SELECTOR), null);
  assert.equal(document.querySelector(CLIMBS_TABLE_SELECTOR), null);

  const checkbox = requireElement<HTMLInputElement>(document, "#cumulative-gain-show-climbs");
  assert.equal(checkbox.checked, false);
  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  await waitFor(window, () => document.querySelector(CLIMBS_TABLE_SELECTOR) !== null, "the climbs table");
  assert.equal(window.localStorage.getItem("cumulative-gain:climbs"), "on");
  const bands = requireElement(document, BANDS_SELECTOR);
  const climbRow = addedRowText(document, "climb");
  assert.match(climbRow ?? "", /^Climb 1: \d+\.\d km · \d+\.\d%$/);
  // The hover is inside climb 1, so its band is highlighted.
  assert.equal(requireElement(bands, "rect[data-climb='1']").getAttribute("fill-opacity"), "0.3");
  finish(harness);
});

test("turning climbs off removes the bands and the table", async () => {
  const harness = startOnActivity({ "cumulative-gain:climbs": "on" });
  const { document, window } = harness;
  stubChartGeometry(document);
  await waitFor(window, () => document.querySelector(BANDS_SELECTOR) !== null, "the bands");

  const checkbox = requireElement<HTMLInputElement>(document, "#cumulative-gain-show-climbs");
  checkbox.checked = false;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  await waitFor(window, () => document.querySelector(BANDS_SELECTOR) === null, "the bands to go");
  assert.equal(document.querySelector(CLIMBS_TABLE_SELECTOR), null);
  assert.equal(document.querySelector("[data-cumulative-gain='climb']"), null);
  finish(harness);
});

test("a chart narrower than 300 px is not decorated", async () => {
  const harness = startOnActivity({ "cumulative-gain:climbs": "on" });
  const { document, window } = harness;
  setBoundingRect(requireElement(document, "#chart"), { left: 0, top: 0, width: 200, height: 100 });
  stubChartGeometry(document);
  await waitFor(window, () => addedRowText(document, "gain") !== undefined, "the Gain row");
  await flushFrames(window);
  assert.equal(document.querySelector(BANDS_SELECTOR), null);
  assert.equal(document.querySelector("#cumulative-gain-show-climbs"), null);
  finish(harness);
});

test("stop() disconnects every observer, so later changes are left alone", async () => {
  const harness = startOnActivity();
  const { document, window } = harness;
  await waitFor(window, () => addedRowText(document, "gain") === "Gain: 50 m", "the Gain row");
  // Ours on the page and the tooltip tracker's on the box it grew.
  assert.equal(harness.connectedObservers.size, 2);
  const background = requireElement(document, "#infoBox rect");

  harness.stop();
  assert.equal(harness.connectedObservers.size, 0);
  // Strava moves the hover and redraws the box.
  requireElement(document, "#infobox-text-distance .value").textContent = "0.5 km";
  background.setAttribute("height", "63");
  await flushFrames(window);
  await flushFrames(window);
  assert.equal(addedRowText(document, "gain"), "Gain: 50 m");
  assert.equal(background.getAttribute("height"), "63");
  window.close();
});

test("a load that fails after stop() schedules no retry", async () => {
  let failLoad: () => void = () => undefined;
  let fetchCount = 0;
  const harness = startOn("/activities/42", activityHtml, {
    fetch: () => {
      fetchCount += 1;
      return new Promise<Response>((resolve) => {
        failLoad = () => {
          resolve(new Response("", { status: 404 }));
        };
      });
    },
  });
  const { window } = harness;
  await waitFor(window, () => fetchCount === 1, "the streams request");

  harness.stop();
  failLoad();
  await flushFrames(window);
  assert.equal(harness.pendingTimeouts.size, 0);
  window.close();
});

test("navigating to another page clears the previous page's retries", async () => {
  // No streams body: every load fails and schedules a retry.
  const harness = startOn("/activities/42", activityHtml);
  const { document, window } = harness;
  await waitFor(window, () => harness.pendingTimeouts.size === 1, "a retry of the streams");

  window.history.pushState({}, "", "/dashboard");
  document.body.append(document.createElement("p"));
  await waitFor(window, () => harness.pendingTimeouts.size === 0, "the retry to be cleared");
  finish(harness);
});
