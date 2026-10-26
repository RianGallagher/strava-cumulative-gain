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

export function setBoundingRect(element: Element, rectangle: RectangleInput): void {
  const { left, top, width, height } = rectangle;
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

export interface AffineMatrixInput {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface StubMatrix extends AffineMatrixInput {
  inverse(): StubMatrix;
  multiply(other: AffineMatrixInput): StubMatrix;
}

export function createStubMatrix(input: AffineMatrixInput): StubMatrix {
  const { a: scaleX, b: skewY, c: skewX, d: scaleY, e: translateX, f: translateY } = input;
  return {
    ...input,
    inverse: () => {
      const determinant = scaleX * scaleY - skewY * skewX;
      return createStubMatrix({
        a: scaleY / determinant,
        b: -skewY / determinant,
        c: -skewX / determinant,
        d: scaleX / determinant,
        e: (skewX * translateY - scaleY * translateX) / determinant,
        f: (skewY * translateX - scaleX * translateY) / determinant,
      });
    },
    multiply: (other) =>
      createStubMatrix({
        a: scaleX * other.a + skewX * other.b,
        b: skewY * other.a + scaleY * other.b,
        c: scaleX * other.c + skewX * other.d,
        d: skewY * other.c + scaleY * other.d,
        e: scaleX * other.e + skewX * other.f + translateX,
        f: skewY * other.e + scaleY * other.f + translateY,
      }),
  };
}

/** jsdom has no getScreenCTM; give an element a fixed screen matrix. */
export function stubScreenMatrix(element: Element, matrix: AffineMatrixInput): void {
  Object.defineProperty(element, "getScreenCTM", {
    configurable: true,
    value: () => createStubMatrix(matrix),
  });
}

export function stubBoundingBox(
  element: Element,
  box: { x: number; y: number; width: number; height: number },
): void {
  Object.defineProperty(element, "getBBox", { configurable: true, value: () => ({ ...box }) });
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

// The type parameter only narrows the result, exactly like Element.querySelector<ElementType>.
/** The first match for a selector; fails the test (by throwing) when there is none. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function requireElement<ElementType extends Element = Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const found = root.querySelector<ElementType>(selector);
  if (!found) throw new Error(`No element matches ${selector}`);
  return found;
}
