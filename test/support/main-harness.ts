import assert from "node:assert/strict";
import type { DOMWindow } from "jsdom";
import { start, type EnvironmentWindow } from "../../src/main.ts";
import { recordingFetch } from "../pages/fixtures.ts";
import { createTestDocument, flushFrames, setBoundingRect } from "./dom.ts";

const MAXIMUM_FRAMES = 30;

export interface Harness {
  window: DOMWindow;
  document: Document;
  requestedUrls: string[];
  /** Observers currently observing something; stop() must leave none. */
  connectedObservers: ReadonlySet<MutationObserver>;
  /** Timeouts the extension set that have neither fired nor been cleared. */
  pendingTimeouts: ReadonlySet<number>;
  stop(): void;
}

export interface HarnessOptions {
  bodiesByUrlPrefix?: Record<string, string>;
  storedSettings?: Record<string, string>;
  /** Replaces the URL-prefix fetch, for loads that hang or fail on cue. */
  fetch?: typeof fetch;
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

// The window the extension sees: jsdom's, with every timeout recorded.
function environmentWindow(window: DOMWindow, pendingTimeouts: Set<number>): EnvironmentWindow {
  return {
    MutationObserver: window.MutationObserver,
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => {
      window.cancelAnimationFrame(handle);
    },
    setTimeout: (callback, delayMilliseconds) => {
      const handle = window.setTimeout(() => {
        pendingTimeouts.delete(handle);
        callback();
      }, delayMilliseconds);
      pendingTimeouts.add(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      pendingTimeouts.delete(handle);
      window.clearTimeout(handle);
    },
    performance: window.performance,
    // Debug logs go to Node's console.
    console,
  };
}

/** Starts the extension on a jsdom page at `pathname`; every SVG is 600 px wide. */
export function startOn(pathname: string, html: string, options: HarnessOptions = {}): Harness {
  const { bodiesByUrlPrefix = {}, storedSettings = {} } = options;
  const { window, document } = createTestDocument(html, `https://www.strava.com${pathname}`);
  for (const [key, value] of Object.entries(storedSettings)) window.localStorage.setItem(key, value);
  const recording = recordingFetch(bodiesByUrlPrefix);
  for (const chart of document.querySelectorAll("svg")) {
    setBoundingRect(chart, { left: 0, top: 0, width: 600, height: 200 });
  }
  const connectedObservers = recordObservers(window);
  const pendingTimeouts = new Set<number>();
  const running = start({
    document,
    window: environmentWindow(window, pendingTimeouts),
    location: window.location,
    storage: window.localStorage,
    fetch: options.fetch ?? recording.fetch,
  });
  return {
    window,
    document,
    requestedUrls: recording.requestedUrls,
    connectedObservers,
    pendingTimeouts,
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
