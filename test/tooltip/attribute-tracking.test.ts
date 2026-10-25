import assert from "node:assert/strict";
import test from "node:test";
import { createAttributeTracker } from "../../src/tooltip/attribute-tracking.ts";
import { createTestDocument } from "../support/dom.ts";

function setUp(): { box: Element; stravaWrites: { count: number } } {
  const { document } = createTestDocument('<svg><rect id="box" height="79"></rect></svg>');
  const box = document.getElementById("box");
  assert.ok(box);
  return { box, stravaWrites: { count: 0 } };
}

const addThirtyTwo = (base: string): string => String(Number(base) + 32);

async function deliverMutationRecords(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("Strava's value is the base until Strava writes again", () => {
  const { box } = setUp();
  const tracker = createAttributeTracker(() => undefined);
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  tracker.discardOwnWrites();
  assert.equal(box.getAttribute("height"), "111");
  assert.equal(tracker.stravaValue(box, "height"), "79");
});

test("a Strava write repeating our value still becomes the base, and is reported", async () => {
  const { box, stravaWrites } = setUp();
  const tracker = createAttributeTracker(() => {
    stravaWrites.count += 1;
  });
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  tracker.discardOwnWrites();
  box.setAttribute("height", "111");
  await deliverMutationRecords();
  assert.equal(stravaWrites.count, 1);
  assert.equal(tracker.stravaValue(box, "height"), "111");
});

test("noteStravaWrites picks up writes not yet delivered", () => {
  const { box } = setUp();
  const tracker = createAttributeTracker(() => undefined);
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  tracker.discardOwnWrites();
  box.setAttribute("height", "90");
  tracker.noteStravaWrites();
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  assert.equal(box.getAttribute("height"), "122");
});

test("an attribute Strava removes has no base and is not written", () => {
  const { box } = setUp();
  const tracker = createAttributeTracker(() => undefined);
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  tracker.discardOwnWrites();
  box.removeAttribute("height");
  tracker.noteStravaWrites();
  assert.equal(tracker.stravaValue(box, "height"), null);
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  assert.equal(box.hasAttribute("height"), false);
  assert.deepEqual(
    [...box.attributes].map((attribute) => attribute.name),
    ["id"],
  );
});

test("our own writes are never reported", async () => {
  const { box, stravaWrites } = setUp();
  const tracker = createAttributeTracker(() => {
    stravaWrites.count += 1;
  });
  tracker.setFromStravaValue(box, "height", addThirtyTwo);
  tracker.discardOwnWrites();
  await deliverMutationRecords();
  assert.equal(stravaWrites.count, 0);
});
