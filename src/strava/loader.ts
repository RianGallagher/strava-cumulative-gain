export interface Loader<Result> {
  start(onReady: () => void): void;
  result(): Result | null;
}

export interface LoaderOptions {
  retryDelaysMs?: readonly number[];
  schedule?: (callback: () => void, delayMs: number) => void;
}

const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 15000];

function scheduleWithTimeout(callback: () => void, delayMs: number): void {
  setTimeout(callback, delayMs);
}

// Loads once per `start`; a null result or a throw is retried after each
// delay in turn, then given up on. On success `onReady` fires exactly once.
export function createLoader<Result>(
  load: () => Promise<Result | null>,
  options: LoaderOptions = {},
): Loader<Result> {
  const { retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, schedule = scheduleWithTimeout } = options;
  let started = false;
  let loaded: Result | null = null;

  async function loadOrNull(): Promise<Result | null> {
    try {
      return await load();
    } catch {
      return null;
    }
  }

  async function attempt(onReady: () => void, retryIndex: number): Promise<void> {
    const outcome = await loadOrNull();
    if (outcome !== null) {
      loaded = outcome;
      onReady();
      return;
    }
    if (retryIndex >= retryDelaysMs.length) return;
    schedule(() => {
      void attempt(onReady, retryIndex + 1);
    }, retryDelaysMs[retryIndex]);
  }

  return {
    start(onReady) {
      if (started) return;
      started = true;
      void attempt(onReady, 0);
    },
    result: () => loaded,
  };
}
