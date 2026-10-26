import test from "node:test";
import assert from "node:assert/strict";
import { fetchRouteGpx } from "../../src/strava/route-gpx.ts";
import { haversineMetres } from "../../src/math/distance.ts";
import { createTestDocument } from "../support/dom.ts";

const gpx = `<?xml version="1.0"?>
<gpx><trk><trkseg>
<trkpt lat="53.0" lon="-6.0"><ele>10</ele></trkpt>
<trkpt lat="53.001" lon="-6.0"><ele>20</ele></trkpt>
<trkpt lat="53.002" lon="-6.0"><ele>15</ele></trkpt>
</trkseg></trk></gpx>`;

function fetchReturning(body: string, status = 200): typeof fetch {
  return () => Promise.resolve(new Response(body, { status }));
}

test("builds haversine distances and elevations from track points", async () => {
  const { window } = createTestDocument("<p></p>");
  const source = await fetchRouteGpx("7", fetchReturning(gpx), new window.DOMParser());
  assert.ok(source);
  assert.deepEqual(source.elevationsMetres, [10, 20, 15]);
  const firstLegMetres = haversineMetres(
    { latitude: 53, longitude: -6 },
    { latitude: 53.001, longitude: -6 },
  );
  assert.equal(source.distancesMetres.length, 3);
  assert.equal(source.distancesMetres[0], 0);
  assert.ok(Math.abs((source.distancesMetres[1] ?? Number.NaN) - firstLegMetres) < 1e-6);
});

test("skips points without a finite elevation and requests with credentials", async () => {
  const body = `<gpx><rte>
<rtept lat="1" lon="1"><ele>5</ele></rtept>
<rtept lat="1.001" lon="1"></rtept>
<rtept lat="1.002" lon="1"><ele>oops</ele></rtept>
<rtept lat="1.003" lon="1"><ele>8</ele></rtept>
</rte></gpx>`;
  const { window } = createTestDocument("<p></p>");
  let requestedUrl = "";
  let credentials: RequestCredentials | undefined;
  const fetchFunction: typeof fetch = (input, requestOptions) => {
    requestedUrl = typeof input === "string" ? input : "unexpected";
    credentials = requestOptions?.credentials;
    return Promise.resolve(new Response(body));
  };
  const source = await fetchRouteGpx("7", fetchFunction, new window.DOMParser());
  assert.deepEqual(source?.elevationsMetres, [5, 8]);
  assert.equal(requestedUrl, "/routes/7/export_gpx");
  assert.equal(credentials, "include");
});

test("a non-OK response gives null", async () => {
  const { window } = createTestDocument("<p></p>");
  assert.equal(await fetchRouteGpx("7", fetchReturning("", 404), new window.DOMParser()), null);
});
