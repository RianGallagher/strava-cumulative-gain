import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDocument, flushFrames, setBoundingRect } from "./dom.ts";

test("createTestDocument stubs getBBox on SVG elements", () => {
  const { document } = createTestDocument('<svg><text id="label">hi</text></svg>');
  const label = document.getElementById("label") as unknown as SVGGraphicsElement;
  assert.equal(label.getBBox().width, 100);
});

test("setBoundingRect makes getBoundingClientRect report the set rectangle", () => {
  const { document } = createTestDocument('<div id="box"></div>');
  const box = document.getElementById("box");
  assert.ok(box);
  setBoundingRect(box, { left: 12, top: 34, width: 56, height: 78 });
  const rectangle = box.getBoundingClientRect();
  assert.equal(rectangle.left, 12);
  assert.equal(rectangle.right, 68);
  assert.equal(rectangle.bottom, 112);
});

test("flushFrames resolves", async () => {
  const { window } = createTestDocument("<p></p>");
  await flushFrames(window);
  window.close();
});
