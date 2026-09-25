/**
 * Unit tests for App.Storage
 * Requirements: 5.1, 5.2, 5.4, 5.5, 1.7
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Load app.js into the jsdom window so App is available
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(__dirname, '../../js/app.js'), 'utf8');

function loadApp() {
  // Execute the IIFE against jsdom's window
  const fn = new Function('window', appSrc);
  fn(globalThis);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetLocalStorage() {
  localStorage.clear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('App.Storage', () => {
  beforeEach(() => {
    resetLocalStorage();
    // Reload the app so each test starts with a fresh App object
    loadApp();
  });

  // ---- KEYS ----------------------------------------------------------------
  describe('KEYS', () => {
    it('exposes the four expected storage keys', () => {
      const { KEYS } = App.Storage;
      expect(KEYS.TRANSACTIONS).toBe('evb_transactions');
      expect(KEYS.CUSTOM_CATEGORIES).toBe('evb_custom_categories');
      expect(KEYS.SPENDING_LIMITS).toBe('evb_spending_limits');
      expect(KEYS.THEME).toBe('evb_theme');
    });
  });

  // ---- save ----------------------------------------------------------------
  describe('save()', () => {
    it('returns { ok: true } when the write succeeds', () => {
      const result = App.Storage.save(App.Storage.KEYS.TRANSACTIONS, [{ id: '1', name: 'Coffee', amount: 3.5, category: 'Food', timestamp: Date.now() }]);
      expect(result).toEqual({ ok: true });
    });

    it('actually writes the JSON-serialised value to localStorage', () => {
      const data = [{ id: 'x', name: 'Bus', amount: 2.0, category: 'Transport', timestamp: 1000 }];
      App.Storage.save(App.Storage.KEYS.TRANSACTIONS, data);
      const raw = localStorage.getItem(App.Storage.KEYS.TRANSACTIONS);
      expect(JSON.parse(raw)).toEqual(data);
    });

    it('returns { ok: false, reason: "quota" } on QuotaExceededError', () => {
      // Simulate a QuotaExceededError thrown by localStorage.setItem
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
        throw err;
      });

      const result = App.Storage.save(App.Storage.KEYS.TRANSACTIONS, []);
      expect(result).toEqual({ ok: false, reason: 'quota' });
      setItemSpy.mockRestore();
    });

    it('returns { ok: false, reason: "unavailable" } on other errors', () => {
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError: access denied');
      });

      const result = App.Storage.save(App.Storage.KEYS.THEME, 'dark');
      expect(result).toEqual({ ok: false, reason: 'unavailable' });
      setItemSpy.mockRestore();
    });
  });

  // ---- load ----------------------------------------------------------------
  describe('load()', () => {
    it('returns { ok: true, value: <parsed data> } when the key exists', () => {
      const data = { foo: 'bar', n: 42 };
      localStorage.setItem(App.Storage.KEYS.SPENDING_LIMITS, JSON.stringify(data));
      const result = App.Storage.load(App.Storage.KEYS.SPENDING_LIMITS);
      expect(result).toEqual({ ok: true, value: data });
    });

    it('returns { ok: true, value: null } when the key is absent', () => {
      const result = App.Storage.load('evb_transactions');
      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns { ok: false, reason: "parse" } when the stored value is corrupt JSON', () => {
      localStorage.setItem(App.Storage.KEYS.TRANSACTIONS, 'NOT_VALID_JSON{{}}');
      const result = App.Storage.load(App.Storage.KEYS.TRANSACTIONS);
      expect(result).toEqual({ ok: false, reason: 'parse' });
    });

    it('returns { ok: false, reason: "parse" } when localStorage.getItem throws', () => {
      const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const result = App.Storage.load(App.Storage.KEYS.THEME);
      expect(result).toEqual({ ok: false, reason: 'parse' });
      getItemSpy.mockRestore();
    });

    it('correctly round-trips arrays', () => {
      const arr = [1, 2, 3];
      App.Storage.save(App.Storage.KEYS.CUSTOM_CATEGORIES, arr);
      const result = App.Storage.load(App.Storage.KEYS.CUSTOM_CATEGORIES);
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(arr);
    });

    it('correctly round-trips objects', () => {
      const obj = { Food: 100, Transport: 50 };
      App.Storage.save(App.Storage.KEYS.SPENDING_LIMITS, obj);
      const result = App.Storage.load(App.Storage.KEYS.SPENDING_LIMITS);
      expect(result.ok).toBe(true);
      expect(result.value).toEqual(obj);
    });
  });
});
