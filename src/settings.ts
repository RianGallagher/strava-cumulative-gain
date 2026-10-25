export const MARKER_ATTRIBUTE = "data-cumulative-gain";

export type SplitsView = "net" | "gain-loss";

export interface Settings {
  climbsEnabled(): boolean;
  setClimbsEnabled(enabled: boolean): void;
  splitsView(): SplitsView;
  setSplitsView(view: SplitsView): void;
  debugLog(...values: unknown[]): void;
}

const CLIMBS_KEY = "cumulative-gain:climbs";
const SPLITS_KEY = "cumulative-gain:splits";
const DEBUG_KEY = "cumulative-gain:debug";
const LOG_PREFIX = "[cumulative-gain]";

// Stored values predate the TypeScript rewrite and must stay as they were.
const STORED_SPLITS_GAIN_LOSS = "gainloss";
const STORED_SPLITS_NET = "net";

export function createSettings(storage: Storage, console: Pick<Console, "log">): Settings {
  // Read once at creation, like the legacy script did at start-up.
  const debugEnabled = storage.getItem(DEBUG_KEY) === "1";

  return {
    climbsEnabled: () => storage.getItem(CLIMBS_KEY) === "on",
    setClimbsEnabled: (enabled) => {
      storage.setItem(CLIMBS_KEY, enabled ? "on" : "off");
    },
    splitsView: () => (storage.getItem(SPLITS_KEY) === STORED_SPLITS_GAIN_LOSS ? "gain-loss" : "net"),
    setSplitsView: (view) => {
      storage.setItem(SPLITS_KEY, view === "gain-loss" ? STORED_SPLITS_GAIN_LOSS : STORED_SPLITS_NET);
    },
    debugLog: (...values) => {
      if (debugEnabled) console.log(LOG_PREFIX, ...values);
    },
  };
}
