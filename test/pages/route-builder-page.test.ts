import test from "node:test";
import assert from "node:assert/strict";
import { detectPage, type StravaPage } from "../../src/pages/page.ts";
import { attachChartProperties, pageFixture, svgById, type PageFixture } from "./fixtures.ts";

const legs = [{ paths: [{ length: 100, elevationGain: 1, elevationLoss: 0 }] }];

function builderPage(fixture: PageFixture): StravaPage {
  const page = detectPage("/maps/create", fixture.dependencies);
  assert.ok(page);
  assert.equal(page.kind, "route-builder");
  return page;
}

test("the profile is the chart props with their legs", () => {
  const fixture = pageFixture("<svg id='chart'></svg>");
  const chart = svgById(fixture.document, "chart");
  const distances = [0, 100];
  const elevations = [5, 6];
  attachChartProperties(chart, { distance: distances, elevation: elevations, legs });
  const page = builderPage(fixture);
  page.prepare(() => undefined);
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.equal(source.distances, distances);
  assert.equal(source.elevations, elevations);
  assert.equal(source.legs, legs);
  assert.equal(source.headlineGainMetres, undefined);
  assert.deepEqual(fixture.requestedUrls, []);
});

test("without chart props there is no profile", () => {
  const fixture = pageFixture("<svg id='chart'></svg>");
  assert.equal(builderPage(fixture).profileSource(svgById(fixture.document, "chart")), null);
});

for (const label of ["Hide Elevation", "Show Elevation"]) {
  test(`climbs go beside the "${label}" button's parent`, () => {
    const fixture = pageFixture(
      `<svg id='chart'></svg><div id='controls'><button> ${label} </button></div><div><button>Undo</button></div>`,
    );
    assert.deepEqual(builderPage(fixture).climbsPlacement(svgById(fixture.document, "chart")), {
      position: "beside",
      anchor: fixture.document.getElementById("controls"),
      sectionClassName: "",
      headingClassName: "",
      tableClassName: "",
      horizontalPaddingPixels: 0,
    });
  });
}

test("no elevation button means no placement", () => {
  const fixture = pageFixture("<svg id='chart'></svg><div><button>Undo</button></div>");
  assert.equal(builderPage(fixture).climbsPlacement(svgById(fixture.document, "chart")), null);
});

test("the route builder has no splits table", () => {
  const fixture = pageFixture("<div id='splits-container'><table></table></div>");
  assert.equal(builderPage(fixture).splitsTable(), null);
});
