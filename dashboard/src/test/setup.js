import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest 4 on recent Node versions can leave the jsdom storage object off the
// global scope, while application code and existing tests use `localStorage`
// directly. Mirror jsdom's origin-scoped store onto globalThis when needed.
if (typeof window !== 'undefined') {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  if (!storage) {
    const values = new Map();
    storage = {
      getItem: (key) => (values.has(String(key)) ? values.get(String(key)) : null),
      setItem: (key, value) => values.set(String(key), String(value)),
      removeItem: (key) => values.delete(String(key)),
      clear: () => values.clear(),
      key: (index) => Array.from(values.keys())[index] ?? null,
      get length() { return values.size; },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: storage });
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
}

// Cleanup after each test case
afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});
