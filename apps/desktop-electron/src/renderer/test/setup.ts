import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

class InMemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

const testLocalStorage = new InMemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
  writable: true
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testLocalStorage,
    writable: true
  });
}

// Existing authoring fixtures are in Portuguese. First-run locale tests remove
// this explicit preference to exercise the application's real default.
beforeEach(() => {
  testLocalStorage.setItem("gbaStudio.locale", "pt-BR");
});
