import assert from "node:assert/strict";
import test from "node:test";
import { createSettings } from "../src/settings.ts";

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function createFakeConsole(): { log: (...values: unknown[]) => void; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return { log: (...values) => calls.push(values), calls };
}

test("defaults to climbs off and net splits", () => {
  const settings = createSettings(new MemoryStorage(), createFakeConsole());
  assert.equal(settings.climbsEnabled(), false);
  assert.equal(settings.splitsView(), "net");
});

test("existing stored values are read", () => {
  const storage = new MemoryStorage();
  storage.setItem("cumulative-gain:climbs", "on");
  storage.setItem("cumulative-gain:splits", "gainloss");
  const settings = createSettings(storage, createFakeConsole());
  assert.equal(settings.climbsEnabled(), true);
  assert.equal(settings.splitsView(), "gain-loss");
});

test("unknown stored values fall back to defaults", () => {
  const storage = new MemoryStorage();
  storage.setItem("cumulative-gain:climbs", "maybe");
  storage.setItem("cumulative-gain:splits", "gain-loss");
  const settings = createSettings(storage, createFakeConsole());
  assert.equal(settings.climbsEnabled(), false);
  assert.equal(settings.splitsView(), "net");
});

test("writes use the legacy storage values", () => {
  const storage = new MemoryStorage();
  const settings = createSettings(storage, createFakeConsole());
  settings.setClimbsEnabled(true);
  assert.equal(storage.getItem("cumulative-gain:climbs"), "on");
  assert.equal(settings.climbsEnabled(), true);
  settings.setClimbsEnabled(false);
  assert.equal(storage.getItem("cumulative-gain:climbs"), "off");
  settings.setSplitsView("gain-loss");
  assert.equal(storage.getItem("cumulative-gain:splits"), "gainloss");
  assert.equal(settings.splitsView(), "gain-loss");
  settings.setSplitsView("net");
  assert.equal(storage.getItem("cumulative-gain:splits"), "net");
});

test("debugLog is silent unless the debug flag is 1", () => {
  const fakeConsole = createFakeConsole();
  createSettings(new MemoryStorage(), fakeConsole).debugLog("hidden");
  const storage = new MemoryStorage();
  storage.setItem("cumulative-gain:debug", "true");
  createSettings(storage, fakeConsole).debugLog("hidden");
  assert.deepEqual(fakeConsole.calls, []);
});

test("debugLog logs with the prefix when the debug flag is 1", () => {
  const fakeConsole = createFakeConsole();
  const storage = new MemoryStorage();
  storage.setItem("cumulative-gain:debug", "1");
  createSettings(storage, fakeConsole).debugLog("found", 3);
  assert.deepEqual(fakeConsole.calls, [["[cumulative-gain]", "found", 3]]);
});
