import { JSDOM } from "jsdom";
import type { DOMWindow } from "jsdom";

export interface TestDocument {
  window: DOMWindow;
  document: Document;
}

export interface RectangleInput {
  left: number;
  top: number;
  width: number;
  height: number;
}

const STUB_BOUNDING_BOX = { x: 0, y: 0, width: 100, height: 13 };

export function createTestDocument(html: string, url = "https://www.strava.com/"): TestDocument {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const { window } = dom;
  // jsdom has no layout engine, so SVG text measurement is stubbed.
  Object.defineProperty(window.SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ ...STUB_BOUNDING_BOX }),
  });
  return { window, document: window.document };
}

export function setBoundingRect(element: Element, rect: RectangleInput): void {
  const { left, top, width, height } = rect;
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  });
}

export async function flushFrames(window: DOMWindow): Promise<void> {
  for (let frame = 0; frame < 2; frame += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  }
}
