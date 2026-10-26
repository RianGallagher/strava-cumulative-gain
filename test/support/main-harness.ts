import assert from "node:assert/strict";
import type { DOMWindow } from "jsdom";
import { start } from "../../src/main.ts";
import { recordingFetch } from "../pages/fixtures.ts";
import { createTestDocument, flushFrames, setBoundingRect } from "./dom.ts";

const MAXIMUM_FRAMES = 30;

export interface Harness {
  window: DOMWindow;
  document: Document;
  requestedUrls: string[];
  /** Observers currently observing something; stop() must leave none. */
  connectedObservers: ReadonlySet<MutationObserver>;
  stop(): void;
}

export interface HarnessOptions {
  bodiesByUrlPrefix?: Record<string, string>;
  storedSettings?: Record<string, string>;
}

// Every MutationObserver made through this window (ours and the tooltip tracker's) is recorded.
function recordObservers(window: DOMWindow): Set<MutationObserver> {
  const connected = new Set<MutationObserver>();
  const BaseObserver = window.MutationObserver;
  window.MutationObserver = class RecordedObserver extends BaseObserver {
    override observe(target: Node, options?: MutationObserverInit): void {
      connected.add(this);
      super.observe(target, options);
    }
    override disconnect(): void {
      connected.delete(this);
      super.disconnect();
    }
  };
  return connected;
}

/** Starts the extension on a jsdom page at `pathname`; every SVG is 600 px wide. */
export function startOn(pathname: string, html: string, options: HarnessOptions = {}): Harness {
  const { bodiesByUrlPrefix = {}, storedSettings = {} } = options;
  const { window, document } = createTestDocument(html, `https://www.strava.com${pathname}`);
  for (const [key, value] of Object.entries(storedSettings)) window.localStorage.setItem(key, value);
  const { fetch: fetchFunction, requestedUrls } = recordingFetch(bodiesByUrlPrefix);
  for (const chart of document.querySelectorAll("svg")) {
    setBoundingRect(chart, { left: 0, top: 0, width: 600, height: 200 });
  }
  const connectedObservers = recordObservers(window);
  const running = start({
    document,
    // jsdom's window type leaves out console; debug logs go to Node's.
    window: Object.assign(window, { console }),
    location: window.location,
    storage: window.localStorage,
    fetch: fetchFunction,
  });
  return {
    window,
    document,
    requestedUrls,
    connectedObservers,
    stop: () => {
      running.stop();
    },
  };
}

export function finish(harness: Harness): void {
  harness.stop();
  harness.window.close();
}

export async function waitFor(
  window: DOMWindow,
  condition: () => boolean,
  description: string,
): Promise<void> {
  for (let frame = 0; frame < MAXIMUM_FRAMES; frame += 1) {
    if (condition()) return;
    await flushFrames(window);
  }
  assert.fail(`timed out waiting for ${description}`);
}

/** The text of one of our tooltip rows ("gain", "loss", "climb"). */
export function addedRowText(document: Document, key: string): string | undefined {
  return document.querySelector(`[data-cumulative-gain="${key}"]`)?.textContent;
}
