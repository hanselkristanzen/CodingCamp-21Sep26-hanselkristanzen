/**
 * Unit tests for App.Categories (task 11.1)
 * and the associated UI.renderCategorySelector / UI.renderLimitsPanel functions.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(resolve(__dirname, '../../js/app.js'), 'utf8');

// Minimal HTML with all elements the modules depend on
const MINIMAL_HTML = `
  <select id="input-category">
    <option value="Food">Food</option>
    <option value="Transport">Transport</option>
    <option value="Fun">Fun</option>
  </select>
  <span id="error-custom-category"></span>
  <div id="limits-panel"></div>
  <ul id="transaction-list"></ul>
  <span id="balance-value"></span>
  <canvas id="spending-chart"></canvas>
  <p id="chart-empty-state" hidden></p>
`;

function loadApp() {
  document.body.innerHTML = MINIMAL_HTML;
  localStorage.clear();
  const fn = new Function('window', appSrc);
  fn(globalThis);
}

// ---------------------------------------------------------------------------
// App.Categories.add
// ---------------------------------------------------------------------------
describe('App.Categories.add()', () => {
  beforeEach(() => {
    loadApp();
    // Reset state to known defaults
    App.State.reset();
    App.State.categories = ['Food', 'Transport', 'Fun'];
    App.State.customCategories = [];
    App.State.spendingLimits = {};
  });

  it('returns { ok: true } for a valid, unique category name', () => {
    const result = App.Categories.add('Health');
    expect(result).toEqual({ ok: true });
  });

  it('adds the new category to State.categories', () => {
    App.Categories.add('Health');
    expect(App.State.categories).toContain('Health');
  });

  it('adds the new category to State.customCategories', () => {
    App.Categories.add('Health');
    expect(App.State.customCategories).toContain('Health');
  });

  it('persists the new category to localStorage under evb_custom_categories', () => {
    App.Categories.add('Health');
    const stored = JSON.parse(localStorage.getItem('evb_custom_categories'));
    expect(stored).toContain('Health');
  });

  it('trims whitespace from the category name', () => {
    App.Categories.add('  Travel  ');
    expect(App.State.categories).toContain('Travel');
    expect(App.State.customCategories).toContain('Travel');
  });

  // Requirement 6.3 — empty name
  it('returns { ok: false } for an empty name', () => {
    const result = App.Categories.add('');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('does NOT add the category when name is empty', () => {
    const before = App.State.categories.length;
    App.Categories.add('');
    expect(App.State.categories.length).toBe(before);
  });

  // Requirement 6.4 — duplicate (case-insensitive)
  it('returns { ok: false } for an exact-case duplicate', () => {
    const result = App.Categories.add('Food');
    expect(result.ok).toBe(false);
  });

  it('returns { ok: false } for a case-variant duplicate (fOoD)', () => {
    const result = App.Categories.add('fOoD');
    expect(result.ok).toBe(false);
  });

  it('does NOT add category on duplicate', () => {
    const before = App.State.categories.length;
    App.Categories.add('food');
    expect(App.State.categories.length).toBe(before);
  });

  it('does NOT add a custom category that duplicates another custom one (case-insensitive)', () => {
    App.Categories.add('Health');
    const before = App.State.categories.length;
    const result = App.Categories.add('HEALTH');
    expect(result.ok).toBe(false);
    expect(App.State.categories.length).toBe(before);
  });

  // Requirement 6.5 — name > 50 chars
  it('returns { ok: false } for a name exceeding 50 characters', () => {
    const longName = 'A'.repeat(51);
    const result = App.Categories.add(longName);
    expect(result.ok).toBe(false);
  });

  it('does NOT add a category whose name exceeds 50 characters', () => {
    const before = App.State.categories.length;
    App.Categories.add('A'.repeat(51));
    expect(App.State.categories.length).toBe(before);
  });

  // Requirement 6.5 — name exactly 50 chars is valid
  it('accepts a category name of exactly 50 characters', () => {
    const name = 'A'.repeat(50);
    const result = App.Categories.add(name);
    expect(result.ok).toBe(true);
    expect(App.State.categories).toContain(name);
  });

  // Storage failure → rolls back state
  it('rolls back state when storage save fails', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const before = App.State.categories.length;
    const result = App.Categories.add('Health');
    expect(result.ok).toBe(false);
    expect(App.State.categories.length).toBe(before);
    expect(App.State.customCategories).not.toContain('Health');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// UI.renderCategorySelector
// ---------------------------------------------------------------------------
describe('UI.renderCategorySelector()', () => {
  beforeEach(() => {
    loadApp();
    App.State.reset();
    App.State.categories = ['Food', 'Transport', 'Fun'];
  });

  it('renders an <option> for each category in state', () => {
    App.UI.renderCategorySelector(App.State);
    const select = document.getElementById('input-category');
    expect(select.options.length).toBe(3);
    const values = Array.from(select.options).map(o => o.value);
    expect(values).toEqual(['Food', 'Transport', 'Fun']);
  });

  it('includes a newly added category after Categories.add()', () => {
    App.Categories.add('Health'); // triggers renderCategorySelector internally
    const select = document.getElementById('input-category');
    const values = Array.from(select.options).map(o => o.value);
    expect(values).toContain('Health');
  });

  it('preserves the current selection when it still exists', () => {
    App.UI.renderCategorySelector(App.State);
    const select = document.getElementById('input-category');
    select.value = 'Transport';
    // Re-render with same categories
    App.UI.renderCategorySelector(App.State);
    expect(select.value).toBe('Transport');
  });

  it('falls back to the first option when the previous selection no longer exists', () => {
    App.UI.renderCategorySelector(App.State);
    const select = document.getElementById('input-category');
    select.value = 'Ghost';          // non-existent
    App.UI.renderCategorySelector(App.State);
    expect(select.selectedIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// UI.renderLimitsPanel
// ---------------------------------------------------------------------------
describe('UI.renderLimitsPanel()', () => {
  beforeEach(() => {
    loadApp();
    App.State.reset();
    App.State.categories = ['Food', 'Transport', 'Fun'];
    App.State.spendingLimits = {};
  });

  it('renders one .limit-row per category', () => {
    App.UI.renderLimitsPanel(App.State);
    const rows = document.querySelectorAll('#limits-panel .limit-row');
    expect(rows.length).toBe(3);
  });

  it('each .limit-row has a data-category attribute matching the category', () => {
    App.UI.renderLimitsPanel(App.State);
    const rows = document.querySelectorAll('#limits-panel .limit-row');
    const cats = Array.from(rows).map(r => r.getAttribute('data-category'));
    expect(cats).toEqual(['Food', 'Transport', 'Fun']);
  });

  it('each .limit-row contains a .limit-input element', () => {
    App.UI.renderLimitsPanel(App.State);
    const inputs = document.querySelectorAll('#limits-panel .limit-input');
    expect(inputs.length).toBe(3);
  });

  it('pre-fills the input with the saved limit when one exists', () => {
    App.State.spendingLimits = { Food: 150 };
    App.UI.renderLimitsPanel(App.State);
    const foodRow = document.querySelector('#limits-panel .limit-row[data-category="Food"]');
    const input = foodRow.querySelector('.limit-input');
    expect(parseFloat(input.value)).toBe(150);
  });

  it('leaves the input empty when no limit is set for a category', () => {
    App.UI.renderLimitsPanel(App.State);
    const transportRow = document.querySelector('#limits-panel .limit-row[data-category="Transport"]');
    const input = transportRow.querySelector('.limit-input');
    expect(input.value).toBe('');
  });

  it('each .limit-row contains a hidden .limit-error span', () => {
    App.UI.renderLimitsPanel(App.State);
    const errorSpans = document.querySelectorAll('#limits-panel .limit-error');
    expect(errorSpans.length).toBe(3);
    errorSpans.forEach(span => {
      expect(span.hasAttribute('hidden')).toBe(true);
    });
  });

  it('each .limit-row contains a <label> with the category name', () => {
    App.UI.renderLimitsPanel(App.State);
    const labels = document.querySelectorAll('#limits-panel .limit-row label');
    const texts = Array.from(labels).map(l => l.textContent);
    expect(texts).toEqual(['Food', 'Transport', 'Fun']);
  });

  it('renders a new row when a custom category is added via Categories.add()', () => {
    App.Categories.add('Health');   // internally calls renderLimitsPanel
    const rows = document.querySelectorAll('#limits-panel .limit-row');
    const cats = Array.from(rows).map(r => r.getAttribute('data-category'));
    expect(cats).toContain('Health');
    expect(rows.length).toBe(4);    // 3 defaults + 1 custom
  });

  // Requirement 9.1 — input number range attributes
  it('limit inputs have min="0.01" and max="999999999.99"', () => {
    App.UI.renderLimitsPanel(App.State);
    const inputs = document.querySelectorAll('#limits-panel .limit-input');
    inputs.forEach(input => {
      expect(input.min).toBe('0.01');
      expect(input.max).toBe('999999999.99');
    });
  });
});

// ---------------------------------------------------------------------------
// Bootstrap.loadState — custom category restore (Requirement 6.6)
// ---------------------------------------------------------------------------
describe('Bootstrap.loadState() — custom category restore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = MINIMAL_HTML;
  });

  it('restores saved custom categories into State.categories on load', () => {
    localStorage.setItem('evb_custom_categories', JSON.stringify(['Health', 'Entertainment']));
    loadApp();
    App.Bootstrap.loadState();
    expect(App.State.categories).toContain('Health');
    expect(App.State.categories).toContain('Entertainment');
  });

  it('restored categories appear as options in #input-category', () => {
    localStorage.setItem('evb_custom_categories', JSON.stringify(['Hobbies']));
    loadApp();
    App.Bootstrap.loadState();
    const select = document.getElementById('input-category');
    const values = Array.from(select.options).map(o => o.value);
    expect(values).toContain('Hobbies');
  });
});
