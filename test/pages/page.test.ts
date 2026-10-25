import test from "node:test";
import assert from "node:assert/strict";
import { detectPage } from "../../src/pages/page.ts";
import { pageFixture } from "./fixtures.ts";

const pageKindsByPathname: [string, string | null][] = [
  ["/activities/123", "activity"],
  ["/activities/123/", "activity"],
  ["/routes/456", "route"],
  ["/routes/456/", "route"],
  ["/routes/new", "route-builder"],
  ["/routes/456/edit", "route-builder"],
  ["/maps/create", "route-builder"],
  ["/maps/create/global-heatmap/run/hot", "route-builder"],
  ["/dashboard", null],
  ["/routes", null],
  ["/routes/456/export_gpx", null],
  ["/athletes/7", null],
];

for (const [pathname, expectedKind] of pageKindsByPathname) {
  test(`${pathname} is ${expectedKind ?? "not a supported page"}`, () => {
    const { dependencies } = pageFixture("<p></p>");
    assert.equal(detectPage(pathname, dependencies)?.kind ?? null, expectedKind);
  });
}
