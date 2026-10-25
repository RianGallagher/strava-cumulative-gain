import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "../../src/strava/loader.ts";

interface FakeScheduler {
  delaysMs: number[];
  pending: (() => void)[];
  schedule: (callback: () => void, delayMs: number) => void;
}

function fakeScheduler(): FakeScheduler {
  const scheduler: FakeScheduler = {
    delaysMs: [],
    pending: [],
    schedule: (callback, delayMs) => {
      scheduler.delaysMs.push(delayMs);
      scheduler.pending.push(callback);
    },
  };
  return scheduler;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
}

async function fireNext(scheduler: FakeScheduler): Promise<void> {
  const callback = scheduler.pending.shift();
  assert.ok(callback, "a retry should be pending");
  callback();
  await settle();
}

test("success stores the result and calls onReady once", async () => {
  const scheduler = fakeScheduler();
  let readyCount = 0;
  const loader = createLoader(() => Promise.resolve("data"), { schedule: scheduler.schedule });
  assert.equal(loader.result(), null);
  loader.start(() => (readyCount += 1));
  await settle();
  assert.equal(loader.result(), "data");
  assert.equal(readyCount, 1);
  assert.deepEqual(scheduler.delaysMs, []);
});

test("retries null results at 2000, 5000 and 15000 then stops", async () => {
  const scheduler = fakeScheduler();
  let loadCount = 0;
  const loader = createLoader(
    () => {
      loadCount += 1;
      return Promise.resolve(null);
    },
    { schedule: scheduler.schedule },
  );
  loader.start(() => assert.fail("never ready"));
  await settle();
  await fireNext(scheduler);
  await fireNext(scheduler);
  await fireNext(scheduler);
  assert.deepEqual(scheduler.delaysMs, [2000, 5000, 15000]);
  assert.equal(scheduler.pending.length, 0);
  assert.equal(loadCount, 4);
  assert.equal(loader.result(), null);
});

test("retries after a throw and succeeds", async () => {
  const scheduler = fakeScheduler();
  let loadCount = 0;
  let readyCount = 0;
  const loader = createLoader(
    () => {
      loadCount += 1;
      return loadCount === 1 ? Promise.reject(new Error("boom")) : Promise.resolve(7);
    },
    { schedule: scheduler.schedule },
  );
  loader.start(() => (readyCount += 1));
  await settle();
  assert.equal(readyCount, 0);
  await fireNext(scheduler);
  assert.equal(loader.result(), 7);
  assert.equal(readyCount, 1);
  assert.deepEqual(scheduler.delaysMs, [2000]);
});

test("a synchronous throw is retried too", async () => {
  const scheduler = fakeScheduler();
  const loader = createLoader(
    (): Promise<number | null> => {
      throw new Error("sync");
    },
    { schedule: scheduler.schedule, retryDelaysMs: [10] },
  );
  loader.start(() => undefined);
  await settle();
  assert.deepEqual(scheduler.delaysMs, [10]);
});

test("starting twice does not load twice", async () => {
  const scheduler = fakeScheduler();
  let loadCount = 0;
  const loader = createLoader(
    () => {
      loadCount += 1;
      return Promise.resolve(1);
    },
    { schedule: scheduler.schedule },
  );
  loader.start(() => undefined);
  loader.start(() => undefined);
  await settle();
  assert.equal(loadCount, 1);
});
