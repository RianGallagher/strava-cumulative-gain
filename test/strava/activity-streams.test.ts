import test from "node:test";
import assert from "node:assert/strict";
import { fetchActivityStreams } from "../../src/strava/activity-streams.ts";

interface Recorded {
  fetchFunction: typeof fetch;
  requests: { url: string; init: RequestInit | undefined }[];
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function respondWith(body: unknown, status = 200): Recorded {
  const requests: Recorded["requests"] = [];
  const fetchFunction: typeof fetch = (input, init) => {
    requests.push({ url: urlOf(input), init });
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status }));
  };
  return { fetchFunction, requests };
}

test("requests the three streams with credentials and returns them", async () => {
  const { fetchFunction, requests } = respondWith({
    distance: [0, 10, 20],
    altitude: [1, 2, 3],
    time: [0, 5, 10],
  });
  const source = await fetchActivityStreams("42", fetchFunction);
  assert.deepEqual(source, { distances: [0, 10, 20], elevations: [1, 2, 3], times: [0, 5, 10] });
  assert.equal(
    requests[0]?.url,
    "/activities/42/streams?stream_types[]=distance&stream_types[]=altitude&stream_types[]=time",
  );
  assert.equal(requests[0]?.init?.credentials, "include");
});

test("a missing or mismatched time stream gives times null", async () => {
  const missing = await fetchActivityStreams(
    "1",
    respondWith({ distance: [0, 1], altitude: [1, 2] }).fetchFunction,
  );
  assert.equal(missing?.times, null);
  const mismatched = await fetchActivityStreams(
    "1",
    respondWith({ distance: [0, 1], altitude: [1, 2], time: [0] }).fetchFunction,
  );
  assert.equal(mismatched?.times, null);
});

test("missing or different-length altitude gives null", async () => {
  assert.equal(await fetchActivityStreams("1", respondWith({ distance: [0, 1, 2] }).fetchFunction), null);
  assert.equal(
    await fetchActivityStreams("1", respondWith({ distance: [0, 1, 2], altitude: [1, 2] }).fetchFunction),
    null,
  );
});

test("fewer than two points gives null", async () => {
  assert.equal(
    await fetchActivityStreams("1", respondWith({ distance: [0], altitude: [1] }).fetchFunction),
    null,
  );
});

test("a 404, bad JSON or a network failure give null without throwing", async () => {
  assert.equal(await fetchActivityStreams("1", respondWith({}, 404).fetchFunction), null);
  assert.equal(await fetchActivityStreams("1", respondWith("<html>").fetchFunction), null);
  const failing: typeof fetch = () => Promise.reject(new Error("offline"));
  assert.equal(await fetchActivityStreams("1", failing), null);
});
