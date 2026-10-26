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

const axisTicks =
  "<g><text>0.0 km</text><text>1.5 km</text></g><g><text>200 m</text><text>1,250 m</text></g>";
const chartHtml = `<div class='elevation-chart-wrapper'><div><svg id='chart'>${axisTicks}</svg></div></div>`;
// A wide SVG on the page that is not the elevation chart, such as a map overlay.
const overlayHtml = "<div id='map'><svg id='overlay'><text>Start</text><text>12 km</text></svg></div>";

function routePage(fixture: PageFixture): StravaPage {
  const page = detectPage("/routes/7", fixture.dependencies);
  assert.ok(page);
  assert.equal(page.kind, "route");
  return page;
}

test("chart properties are merged with the embedded legs and headline", () => {
  const fixture = pageFixture(chartHtml + nextDataScript(embeddedRoute), { [GPX_URL]: gpx });
  const chart = svgById(fixture.document, "chart");
  const distancesMetres = [0, 50, 100];
  const elevationsMetres = [1, 2, 3];
  attachChartProperties(chart, { distance: distancesMetres, elevation: elevationsMetres });
  const page = routePage(fixture);
  page.prepare(() => undefined);
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.equal(source.distancesMetres, distancesMetres);
  assert.equal(source.elevationsMetres, elevationsMetres);
  assert.deepEqual(source.legs, legs);
  assert.equal(source.headlineGainMetres, 6);
  assert.deepEqual(fixture.requestedUrls, []);
});

test("legs from the chart properties are kept", () => {
  const fixture = pageFixture(chartHtml + nextDataScript({ ...embeddedRoute, legs: undefined }));
  const chart = svgById(fixture.document, "chart");
  attachChartProperties(chart, { distance: [0, 100], elevation: [1, 2], legs });
  assert.equal(routePage(fixture).profileSource(chart)?.legs, legs);
});

test("without chart properties the embedded route is used, the same arrays every time", () => {
  const fixture = pageFixture(chartHtml + nextDataScript(embeddedRoute), { [GPX_URL]: gpx });
  const chart = svgById(fixture.document, "chart");
  const page = routePage(fixture);
  page.prepare(() => undefined);
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.deepEqual(source.distancesMetres, [0, 100, 200]);
  assert.deepEqual(source.elevationsMetres, [10, 15, 13]);
  assert.equal(source.headlineGainMetres, 6);
  assert.equal(page.profileSource(chart)?.elevationsMetres, source.elevationsMetres);
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
  assert.deepEqual(page.profileSource(chart)?.elevationsMetres, [30, 40]);
}

test("without chart properties or embedded data the GPX export is loaded once", async () => {
  await gpxFallback("");
});

test("embedded data for another route falls through to the GPX export", async () => {
  await gpxFallback(nextDataScript({ ...embeddedRoute, id: 8 }));
});

test("an SVG that is not the elevation chart gets no embedded profile", () => {
  const fixture = pageFixture(overlayHtml + nextDataScript(embeddedRoute), { [GPX_URL]: gpx });
  const page = routePage(fixture);
  page.prepare(() => undefined);
  assert.equal(page.profileSource(svgById(fixture.document, "overlay")), null);
});

test("an SVG that is not the elevation chart never starts the GPX download", async () => {
  const fixture = pageFixture(overlayHtml + nextDataScript({ ...embeddedRoute, id: 8 }), { [GPX_URL]: gpx });
  const page = routePage(fixture);
  page.prepare(() => undefined);
  assert.equal(page.profileSource(svgById(fixture.document, "overlay")), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(page.profileSource(svgById(fixture.document, "overlay")), null);
  assert.deepEqual(fixture.requestedUrls, []);
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
