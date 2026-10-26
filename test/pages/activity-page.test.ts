import test from "node:test";
import assert from "node:assert/strict";
import { detectPage, type StravaPage } from "../../src/pages/page.ts";
import { pageFixture, svgById, type PageFixture } from "./fixtures.ts";

const streams = JSON.stringify({ distance: [0, 100, 200], altitude: [10, 20, 15], time: [0, 30, 60] });
const STREAMS_URL = "/activities/42/streams";

function activityHtml(headlineHtml: string): string {
  return `
    ${headlineHtml}
    <section id="elevation-profile"><div id="elevation-chart"><svg id="chart"></svg></div></section>
    <div id="pace-chart"><svg id="other"></svg></div>
    <div id="splits-container"><table id="splits"></table></div>`;
}

const plainHeadline = "<div><div>Elevation</div><strong>270 m</strong></div>";

function activityPage(fixture: PageFixture): StravaPage {
  const page = detectPage("/activities/42", fixture.dependencies);
  assert.ok(page);
  assert.equal(page.kind, "activity");
  return page;
}

async function loadedActivity(
  headlineHtml = plainHeadline,
): Promise<{ fixture: PageFixture; page: StravaPage }> {
  const fixture = pageFixture(activityHtml(headlineHtml), { [STREAMS_URL]: streams });
  const page = activityPage(fixture);
  await new Promise<void>((resolve) => {
    page.prepare(resolve);
  });
  return { fixture, page };
}

test("streams load once however often prepare is called, then reach the elevation chart", async () => {
  const fixture = pageFixture(activityHtml(plainHeadline), { [STREAMS_URL]: streams });
  const page = activityPage(fixture);
  const chart = svgById(fixture.document, "chart");
  assert.equal(page.profileSource(chart), null);
  let readyCount = 0;
  const ready = new Promise<void>((resolve) => {
    page.prepare(() => {
      readyCount += 1;
      resolve();
    });
  });
  page.prepare(() => (readyCount += 1));
  await ready;
  assert.equal(readyCount, 1);
  assert.equal(fixture.requestedUrls.length, 1);
  assert.ok(fixture.requestedUrls[0]?.startsWith(STREAMS_URL));
  const source = page.profileSource(chart);
  assert.ok(source);
  assert.deepEqual(source.distancesMetres, [0, 100, 200]);
  assert.deepEqual(source.elevationsMetres, [10, 20, 15]);
  assert.deepEqual(source.timesSeconds, [0, 30, 60]);
});

test("a chart outside #elevation-chart has no profile", async () => {
  const { fixture, page } = await loadedActivity();
  assert.equal(page.profileSource(svgById(fixture.document, "other")), null);
});

test("headline gain in plain metres", async () => {
  const { fixture, page } = await loadedActivity();
  assert.equal(page.profileSource(svgById(fixture.document, "chart"))?.headlineGainMetres, 270);
});

test("headline gain with a thousands separator", async () => {
  const { fixture, page } = await loadedActivity("<div><div>Elevation</div><strong>1,329 m</strong></div>");
  assert.equal(page.profileSource(svgById(fixture.document, "chart"))?.headlineGainMetres, 1329);
});

test('an "Elevation Gain" label is the headline too', async () => {
  const { fixture, page } = await loadedActivity(
    "<div><div>Elevation Gain</div><strong>512 m</strong></div>",
  );
  assert.equal(page.profileSource(svgById(fixture.document, "chart"))?.headlineGainMetres, 512);
});

test("headline gain in feet is converted to metres", async () => {
  const { fixture, page } = await loadedActivity("<div><div>Elevation</div><strong>4,360 ft</strong></div>");
  const headlineGainMetres = page.profileSource(svgById(fixture.document, "chart"))?.headlineGainMetres;
  assert.ok(headlineGainMetres !== undefined);
  assert.ok(Math.abs(headlineGainMetres - 4360 * 0.3048) < 1e-9);
});

test("no headline stat leaves the headline gain out", async () => {
  const { fixture, page } = await loadedActivity("<div><div>Distance</div><strong>12 km</strong></div>");
  const source = page.profileSource(svgById(fixture.document, "chart"));
  assert.ok(source);
  assert.equal(source.headlineGainMetres, undefined);
});

test("the headline is read again on every call", async () => {
  const { fixture, page } = await loadedActivity();
  const chart = svgById(fixture.document, "chart");
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 270);
  const valueElement = fixture.document.querySelector("strong");
  assert.ok(valueElement);
  valueElement.textContent = "300 m";
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 300);
});

test("once found, the headline label is kept rather than searched for again", async () => {
  const { fixture, page } = await loadedActivity();
  const chart = svgById(fixture.document, "chart");
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 270);
  // A search would now find this label first; the kept one still answers.
  fixture.document.body.insertAdjacentHTML(
    "afterbegin",
    "<div><div>Elevation</div><strong>999 m</strong></div>",
  );
  fixture.clock.nowMilliseconds += 5000;
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 270);
});

test("a headline that appears later is found, searching at most once a second", async () => {
  const { fixture, page } = await loadedActivity("");
  const chart = svgById(fixture.document, "chart");
  assert.equal(page.profileSource(chart)?.headlineGainMetres, undefined);
  fixture.document.body.insertAdjacentHTML("afterbegin", plainHeadline);

  fixture.clock.nowMilliseconds += 999;
  assert.equal(page.profileSource(chart)?.headlineGainMetres, undefined);
  fixture.clock.nowMilliseconds += 1;
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 270);
});

test("a replaced headline is found again straight away", async () => {
  const { fixture, page } = await loadedActivity();
  const chart = svgById(fixture.document, "chart");
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 270);
  fixture.document.querySelector("div")?.remove();
  fixture.document.body.insertAdjacentHTML(
    "afterbegin",
    "<div><div>Elevation</div><strong>300 m</strong></div>",
  );
  assert.equal(page.profileSource(chart)?.headlineGainMetres, 300);
});

test("climbs go after #elevation-profile with Strava's table classes and padding", () => {
  const fixture = pageFixture(activityHtml(plainHeadline));
  const page = activityPage(fixture);
  assert.deepEqual(page.climbsPlacement(svgById(fixture.document, "chart")), {
    position: "after",
    anchor: fixture.document.getElementById("elevation-profile"),
    sectionClassName: "",
    headingClassName: "",
    tableClassName: "dense hoverable",
    horizontalPaddingPixels: 20,
  });
});

test("no #elevation-profile means no placement", () => {
  const fixture = pageFixture("<div id='elevation-chart'><svg id='chart'></svg></div>");
  assert.equal(activityPage(fixture).climbsPlacement(svgById(fixture.document, "chart")), null);
});

test("the splits table is the table inside #splits-container", () => {
  const fixture = pageFixture(activityHtml(plainHeadline));
  assert.equal(activityPage(fixture).splitsTable(), fixture.document.getElementById("splits"));
});

test("no splits container means no splits table", () => {
  const fixture = pageFixture("<p></p>");
  assert.equal(activityPage(fixture).splitsTable(), null);
});
