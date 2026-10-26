import test from "node:test";
import assert from "node:assert/strict";
import { readEmbeddedRoute } from "../../src/strava/embedded-route.ts";
import { createTestDocument } from "../support/dom.ts";

function documentWithRoute(route: unknown): Document {
  const json = JSON.stringify({ props: { pageProps: { route } } });
  return createTestDocument(`<script id="__NEXT_DATA__" type="application/json">${json}</script>`).document;
}

const legs = [{ paths: [{ length: 200, elevationGain: 5, elevationLoss: 2 }] }];

test("reads distances, elevations, legs and the headline gain", () => {
  const route = {
    id: 123,
    elevation: [
      [0, 10],
      [100, 15],
      [200, 13],
    ],
    legs,
    elevationGain: 5,
  };
  assert.deepEqual(readEmbeddedRoute(documentWithRoute(route), "123"), {
    distancesMetres: [0, 100, 200],
    elevationsMetres: [10, 15, 13],
    legs,
    headlineGainMetres: 5,
  });
});

test("accepts a string id", () => {
  const route = {
    id: "123",
    elevation: [
      [0, 1],
      [5, 2],
    ],
  };
  assert.ok(readEmbeddedRoute(documentWithRoute(route), "123"));
});

test("a different route id is stale and gives null", () => {
  const route = {
    id: 999,
    elevation: [
      [0, 1],
      [5, 2],
    ],
  };
  assert.equal(readEmbeddedRoute(documentWithRoute(route), "123"), null);
});

test("missing script, bad JSON or bad elevation give null", () => {
  assert.equal(readEmbeddedRoute(createTestDocument("<p></p>").document, "123"), null);
  const broken = createTestDocument('<script id="__NEXT_DATA__">{nope</script>').document;
  assert.equal(readEmbeddedRoute(broken, "123"), null);
  assert.equal(readEmbeddedRoute(documentWithRoute({ id: 123, elevation: [["a", 1]] }), "123"), null);
});
