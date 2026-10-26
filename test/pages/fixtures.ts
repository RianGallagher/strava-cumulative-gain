import assert from "node:assert/strict";
import type { PageDependencies } from "../../src/pages/page.ts";
import { createTestDocument, type TestDocument } from "../support/dom.ts";

export interface RecordingFetch {
  fetch: typeof fetch;
  requestedUrls: string[];
}

// Answers each URL that starts with a key with that key's body; anything else is a 404.
export function recordingFetch(bodiesByUrlPrefix: Record<string, string>): RecordingFetch {
  const requestedUrls: string[] = [];
  const fetchFunction: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requestedUrls.push(url);
    const prefix = Object.keys(bodiesByUrlPrefix).find((candidate) => url.startsWith(candidate));
    const body = prefix === undefined ? undefined : bodiesByUrlPrefix[prefix];
    return Promise.resolve(body === undefined ? new Response("", { status: 404 }) : new Response(body));
  };
  return { fetch: fetchFunction, requestedUrls };
}

export interface PageFixture extends TestDocument {
  dependencies: PageDependencies;
  requestedUrls: string[];
  /** The time the page sees; tests move it forward by hand. */
  clock: { nowMilliseconds: number };
}

// Retries are never scheduled, so a failed load stays failed and no timer outlives the test.
export function pageFixture(html: string, bodiesByUrlPrefix: Record<string, string> = {}): PageFixture {
  const testDocument = createTestDocument(html);
  const { fetch: fetchFunction, requestedUrls } = recordingFetch(bodiesByUrlPrefix);
  const clock = { nowMilliseconds: 0 };
  return {
    ...testDocument,
    requestedUrls,
    clock,
    dependencies: {
      document: testDocument.document,
      fetch: fetchFunction,
      schedule: () => undefined,
      nowMilliseconds: () => clock.nowMilliseconds,
    },
  };
}

export function svgById(document: Document, id: string): SVGSVGElement {
  const svg = [...document.querySelectorAll("svg")].find((candidate) => candidate.id === id);
  assert.ok(svg, `no svg with id ${id}`);
  return svg;
}

// Gives the chart a fake React fiber whose own properties are `properties`.
export function attachChartProperties(chart: Element, properties: Record<string, unknown>): void {
  Object.defineProperty(chart, "__reactFiber$test", {
    value: { memoizedProps: properties, return: null },
    enumerable: true,
  });
}

export function nextDataScript(route: unknown): string {
  const json = JSON.stringify({ props: { pageProps: { route } } });
  return `<script id="__NEXT_DATA__" type="application/json">${json}</script>`;
}
