import test from "node:test";
import assert from "node:assert/strict";
import { detectPage, type StravaPage } from "../../src/pages/page.ts";
import { attachChartProperties, nextDataScript, pageFixture, svgById, type PageFixture } from "./fixtures.ts";

const GPX_URL = "/routes/7/export_gpx";
const legs = [{ paths: [{ length: 200, elevationGain: 5, elevationLoss: 2 }] }];
const embeddedRoute = {
  id: 7,
  elevation: [
    [0, 10],
    [100, 15],
    [200, 13],
  ],
  legs,
  elevationGain: 6,
};
const gpx = `<gpx><trk><trkseg>
<trkpt lat="53.0" lon="-6.0"><ele>30</ele></trkpt>
<trkpt lat="53.001" lon="-6.0"><ele>40</ele></trkpt>
</trkseg></trk></gpx>`;

const chartHtml = "<div class='elevation-chart-wrapper'><div><svg id='chart'></svg></div></div>";

function routePage(fixture: PageFixture): StravaPage {
  const page = detectPage("/routes/7", fixture.dependencies);
  assert.ok(page);
  assert.equal(page.kind, "route");
  return page;
}

test("chart props are merged with the embedded legs and headline", () => {
  const fixture = pageFixture(chartHtml + nextDataScript(embeddedRoute), { [GPX_URL]: gpx });
  const chart = svgById(fixture.document, "chart");
  const distances = [0, 50, 100];
  const elevations = [1, 2, 3];
  attachChartProperties(chart, { distance: distances, elevation: elevations });
  const page = routePage(fixture);
  page.prepare(() => undefined);
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.equal(source.distances, distances);
  assert.equal(source.elevations, elevations);
  assert.deepEqual(source.legs, legs);
  assert.equal(source.headlineGainMetres, 6);
  assert.deepEqual(fixture.requestedUrls, []);
});

test("legs from the chart props are kept", () => {
  const fixture = pageFixture(chartHtml + nextDataScript({ ...embeddedRoute, legs: undefined }));
  const chart = svgById(fixture.document, "chart");
  attachChartProperties(chart, { distance: [0, 100], elevation: [1, 2], legs });
  assert.equal(routePage(fixture).profileSource(chart)?.legs, legs);
});

test("without chart props the embedded route is used, the same arrays every time", () => {
  const fixture = pageFixture(chartHtml + nextDataScript(embeddedRoute), { [GPX_URL]: gpx });
  const chart = svgById(fixture.document, "chart");
  const page = routePage(fixture);
  page.prepare(() => undefined);
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.deepEqual(source.distances, [0, 100, 200]);
  assert.deepEqual(source.elevations, [10, 15, 13]);
  assert.equal(source.headlineGainMetres, 6);
  assert.equal(page.profileSource(chart)?.elevations, source.elevations);
  assert.deepEqual(fixture.requestedUrls, []);
});

async function gpxFallback(html: string): Promise<void> {
  const fixture = pageFixture(chartHtml + html, { [GPX_URL]: gpx });
  const chart = svgById(fixture.document, "chart");
  const page = routePage(fixture);
  let readyCount = 0;
  const ready = new Promise<void>((resolve) => {
    page.prepare(() => {
      readyCount += 1;
      resolve();
    });
  });
  assert.equal(page.profileSource(chart), null);
  page.prepare(() => (readyCount += 1));
  assert.equal(page.profileSource(chart), null);
  await ready;
  assert.equal(readyCount, 1);
  assert.deepEqual(fixture.requestedUrls, [GPX_URL]);
  assert.deepEqual(page.profileSource(chart)?.elevations, [30, 40]);
}

test("without chart props or embedded data the GPX export is loaded once", async () => {
  await gpxFallback("");
});

test("embedded data for another route falls through to the GPX export", async () => {
  await gpxFallback(nextDataScript({ ...embeddedRoute, id: 8 }));
});

test("climbs go before the Segments section, copying its classes", () => {
  const fixture = pageFixture(
    `${chartHtml}<section class="segments-section"><h3 class="section-heading">Segments</h3></section>`,
  );
  const placement = routePage(fixture).climbsPlacement(svgById(fixture.document, "chart"));
  assert.deepEqual(placement, {
    position: "before",
    anchor: fixture.document.querySelector("section"),
    sectionClassName: "segments-section",
    headingClassName: "section-heading",
    tableClassName: "",
    horizontalPaddingPixels: 0,
  });
});

test("without a Segments section climbs go after the chart's container", () => {
  const fixture = pageFixture(`${chartHtml}<section><h3>Laps</h3></section>`);
  const placement = routePage(fixture).climbsPlacement(svgById(fixture.document, "chart"));
  assert.equal(placement?.position, "after");
  assert.equal(placement.anchor, fixture.document.querySelector(".elevation-chart-wrapper"));
  assert.equal(placement.sectionClassName, "");
});

test("without a chart container climbs go after the chart's parent", () => {
  const fixture = pageFixture("<main><span id='holder'><svg id='chart'></svg></span></main>");
  const placement = routePage(fixture).climbsPlacement(svgById(fixture.document, "chart"));
  assert.equal(placement?.anchor, fixture.document.getElementById("holder"));
});

test("a route has no splits table", () => {
  const fixture = pageFixture("<div id='splits-container'><table></table></div>");
  assert.equal(routePage(fixture).splitsTable(), null);
});
