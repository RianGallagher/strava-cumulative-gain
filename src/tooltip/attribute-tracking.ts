// When we move one of Strava's tooltip rows or resize its box, we need
// Strava's own value for that attribute (its "base") to adjust from.
// Comparing against what we last wrote isn't enough: Strava can write the
// exact value we wrote (two chart lines switched on at once grow the box by
// the same 32 px we added), and that write would be missed. So an observer
// records every write Strava makes to an attribute we adjust, and our own
// writes are discarded with takeRecords() before they are delivered.
import { MARKER_ATTRIBUTE } from "../settings.ts";

export interface AttributeTracker {
  /** Record Strava's writes queued since the last call as the new bases. */
  noteStravaWrites(): void;
  /** Strava's own value: the recorded base, else the current value. */
  stravaValue(element: Element, attributeName: string): string | null;
  /**
   * Set an attribute computed from Strava's own value. Skipped when Strava has
   * no value or `compute` returns null, so nothing unparseable is written.
   */
  setFromStravaValue(
    element: Element,
    attributeName: string,
    compute: (stravaValue: string) => string | null,
  ): void;
  /** Drop the records our own writes queued, so they never count as Strava's. */
  discardOwnWrites(): void;
}

const BASE_ATTRIBUTE_PREFIX = `${MARKER_ATTRIBUTE}-base-`;

function baseAttribute(attributeName: string): string {
  return BASE_ATTRIBUTE_PREFIX + attributeName;
}

function noteBases(records: readonly MutationRecord[]): void {
  for (const record of records) {
    const { attributeName } = record;
    if (attributeName === null) continue;
    // Attribute records always target elements.
    const element = record.target as Element;
    const value = element.getAttribute(attributeName);
    // Strava removed the attribute: forget the base rather than store "null".
    if (value === null) element.removeAttribute(baseAttribute(attributeName));
    else element.setAttribute(baseAttribute(attributeName), value);
  }
}

export function createAttributeTracker(onStravaWrite: () => void): AttributeTracker {
  const trackedAttributes = new WeakMap<Element, Set<string>>();
  let observer: MutationObserver | null = null;

  function observerFor(element: Element): MutationObserver {
    if (observer) return observer;
    const view = element.ownerDocument.defaultView;
    if (!view) throw new Error("cannot track attributes of an element outside a window");
    observer = new view.MutationObserver((records) => {
      noteBases(records);
      onStravaWrite();
    });
    return observer;
  }

  function track(element: Element, attributeName: string): void {
    let names = trackedAttributes.get(element);
    if (names?.has(attributeName)) return;
    if (!names) {
      names = new Set();
      trackedAttributes.set(element, names);
    }
    names.add(attributeName);
    const value = element.getAttribute(attributeName);
    if (value !== null) element.setAttribute(baseAttribute(attributeName), value);
    // Observing the same element again replaces its filter with the larger set.
    observerFor(element).observe(element, { attributes: true, attributeFilter: [...names] });
  }

  function stravaValue(element: Element, attributeName: string): string | null {
    return element.getAttribute(baseAttribute(attributeName)) ?? element.getAttribute(attributeName);
  }

  return {
    noteStravaWrites: () => {
      if (observer) noteBases(observer.takeRecords());
    },
    stravaValue,
    setFromStravaValue: (element, attributeName, compute) => {
      track(element, attributeName);
      const base = stravaValue(element, attributeName);
      if (base === null) return;
      const next = compute(base);
      if (next !== null && element.getAttribute(attributeName) !== next)
        element.setAttribute(attributeName, next);
    },
    discardOwnWrites: () => {
      observer?.takeRecords();
    },
  };
}
