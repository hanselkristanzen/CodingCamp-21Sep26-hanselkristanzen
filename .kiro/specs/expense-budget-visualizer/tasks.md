# Implementation Plan: Expense & Budget Visualizer

## Overview

Build a zero-dependency, client-side SPA delivered as static files (`index.html`, `css/styles.css`, `js/app.js`, and a vendored Chart.js UMD build). All logic lives inside `app.js` under the `App.*` namespace. State flows in one direction: user action → validator → state mutation → `Storage.save()` → `UI.render()`. Tests run in Vitest + jsdom with a mocked `localStorage` and fast-check for property-based tests.

---

## Tasks

- [~] 1. Project scaffold and test environment
  - [x] 1.1 Create the directory structure and static entry files
    - Create `expense-budget-visualizer/index.html` with the full semantic HTML skeleton: `<head>` (theme-flash-prevention inline script, CSS link, vendor script, app script), and all named elements from the design (`#transaction-form`, `#transaction-list`, `#balance-display`, `#chart-container`, `#monthly-filter`, `#sort-control`, `#limits-panel`, `#theme-toggle`)
    - Create `css/styles.css` as an empty file (populated in task 15)
    - Create `js/app.js` as an empty IIFE shell: `(function(global) { 'use strict'; var App = {}; global.App = App; })(window);`
    - Download or copy Chart.js v4 UMD build into `vendor/chart.umd.min.js`; verify `Chart` is available in the global scope after the `<script>` tag
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [~] 1.2 Set up Vitest + jsdom test environment
    - Create `package.json` with `vitest`, `jsdom`, and `fast-check` as dev dependencies
    - Create `vitest.config.js` setting `environment: 'jsdom'`
    - Create stub test files for all 9 unit test files and 6 property test files listed in the design's Testing Strategy section
    - Verify `npx vitest --run` exits 0 with all stubs passing
    - _Requirements: 11.1_

- [x] 2. Storage module
  - [x] 2.1 Implement `App.Storage` with `save`, `load`, and storage-key constants
    - Implement `App.Storage.KEYS` object: `{ TRANSACTIONS: 'evb_transactions', CUSTOM_CATEGORIES: 'evb_custom_categories', SPENDING_LIMITS: 'evb_spending_limits', THEME: 'evb_theme' }`
    - Implement `App.Storage.save(key, value)`: `JSON.stringify` + `localStorage.setItem`; catch `QuotaExceededError` → return `{ ok: false, reason: 'quota' }`; catch other errors → return `{ ok: false, reason: 'unavailable' }`; on success → return `{ ok: true }`
    - Implement `App.Storage.load(key)`: `localStorage.getItem` + `JSON.parse`; return `{ ok: true, value: null }` when key absent; catch errors → `{ ok: false, reason: 'parse' }`
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 1.7_

  - [x] 2.2 Write unit tests for `App.Storage`
    - Test `save` success path, `QuotaExceededError` path, unavailable path
    - Test `load` success, absent key (`null`), parse error, localStorage unavailable
    - _Requirements: 5.4, 5.5, 1.7_

- [x] 3. State module
  - [x] 3.1 Implement `App.State` with initial shape and `reset` factory
    - Define `App.State` with fields matching the design's `AppState` shape: `transactions: []`, `categories: ['Food', 'Transport', 'Fun']`, `customCategories: []`, `spendingLimits: {}`, `activeFilter: { month: null, year: null }`, `activeSort: ''`, `theme: 'light'`
    - Implement `App.State.reset()` that restores the above defaults in place (used by tests)
    - _Requirements: 1.2, 6.1_

- [x] 4. Validator module
  - [x] 4.1 Implement `App.Validator` — transaction field validation
    - Implement `App.Validator.validateName(value)`: non-empty string, ≤ 100 chars; return `{ valid: true }` or `{ valid: false, message: '...' }`
    - Implement `App.Validator.validateAmount(value)`: parseable as float, in range [0.01, 999999999.99]; return `{ valid: true, parsed: float }` or `{ valid: false, message: '...' }`
    - Implement `App.Validator.validateCategory(value, categories)`: value must be non-empty and exist in `categories`; return `{ valid: true }` or `{ valid: false, message: '...' }`
    - Implement `App.Validator.validateTransaction(name, amount, category, categories)`: runs all three; return `{ valid: bool, errors: { name?, amount?, category? } }`
    - _Requirements: 1.4, 1.5_

  - [ ]* 4.2 Write property tests for `App.Validator` (P2, P3)
    - **Property 2: Invalid amount is rejected** — `fc.oneof(fc.string(), fc.float({max:0}), fc.constant(''))` — `validateAmount` must return `{ valid: false }` for every generated value
    - **Validates: Requirements 1.5**
    - **Property 3: Empty field submission is rejected** — `fc.record` with at least one field set to `''` — `validateTransaction` must return `{ valid: false }` with an error entry for each empty field
    - **Validates: Requirements 1.4**

  - [x] 4.3 Implement `App.Validator` — category and spending-limit validation
    - Implement `App.Validator.validateCustomCategory(value, existingCategories)`: non-empty, ≤ 50 chars, case-insensitive uniqueness check; return `{ valid: true }` or `{ valid: false, message: '...' }`
    - Implement `App.Validator.validateSpendingLimit(value)`: parseable float, > 0, ≤ 999999999.99; return `{ valid: true, parsed: float }` or `{ valid: false, message: '...' }`
    - _Requirements: 6.3, 6.4, 6.5, 9.5_

  - [ ]* 4.4 Write unit tests for `App.Validator`
    - Test boundary values for name (1 char, 100 chars, 101 chars, empty)
    - Test amount boundaries (0.01, 999999999.99, 0, negative, NaN, empty string)
    - Test custom category: empty, 50 chars, 51 chars, exact duplicate, case-variant duplicate
    - Test spending limit: 0.01, 999999999.99, 0, negative, non-numeric, empty
    - _Requirements: 1.4, 1.5, 6.3, 6.4, 6.5, 9.5_

- [x] 5. Checkpoint — core modules
  - Ensure all Storage, State, and Validator tests pass. Run `npx vitest --run`. Ask the user if questions arise.

- [~] 6. Transactions module and transaction list UI
  - [x] 6.1 Implement `App.Transactions` CRUD
    - Implement `App.Transactions.add(name, amount, category)`: generate `id` via `crypto.randomUUID()` with `Date.now().toString(36)` fallback; set `timestamp: Date.now()`; push to `State.transactions`; call `Storage.save(KEYS.TRANSACTIONS, State.transactions)`; return `{ ok: bool, error? }`
    - Implement `App.Transactions.delete(id)`: filter `State.transactions`; call `Storage.save`; return `{ ok: bool }`
    - _Requirements: 1.3, 2.5, 5.1, 5.2, 7.7_

  - [ ]* 6.2 Write property tests for `App.Transactions` (P1, P7, P17)
    - **Property 1: Valid transaction submission grows the list** — `fc.record({ name: fc.string({minLength:1, maxLength:100}), amount: fc.float({min:0.01, max:999999999.99}), category: fc.constantFrom('Food','Transport','Fun') })` — after `Transactions.add()`, `State.transactions.length` must increase by exactly 1 and the localStorage value must include the new item
    - **Validates: Requirements 1.3, 5.1**
    - **Property 7: Deleting a transaction removes it everywhere** — `fc.array(transactionArb, {minLength:1})` and `fc.nat` index — after `Transactions.delete(id)`, list length is N−1 and id is absent from localStorage
    - **Validates: Requirements 2.5, 5.2**
    - **Property 17: Timestamps are within 1 second of submission** — `Date.now()` captured before call; after `Transactions.add()`, `transaction.timestamp` is within 1000 ms
    - **Validates: Requirements 7.7**

  - [x] 6.3 Implement `UI.renderTransactionList(state)`
    - Clear `#transaction-list`; for each visible transaction (from `Filter.getVisibleTransactions(state)`): create `<li class="transaction-item" data-id="{id}">` with `<span class="tx-name">`, `<span class="tx-category">`, `<span class="tx-amount">${amount.toFixed(2)}</span>`, and `<button class="btn-delete" data-action="delete" data-id="{id}">×</button>`
    - Toggle `over-limit` class on `<li>` using `Limits.isOverLimit(tx.category, state)`
    - Render `<li class="empty-state">No transactions recorded.</li>` when list is empty
    - _Requirements: 2.1, 2.4, 2.6, 9.2_

  - [ ]* 6.4 Write property tests for `UI.renderTransactionList` (P5, P6)
    - **Property 5: Transaction list rendering shows correct fields with correct formatting** — `fc.array(transactionArb)` — every rendered `<li>` must contain the item name, category, and amount formatted as `$X.XX`
    - **Validates: Requirements 2.1**
    - **Property 6: Every rendered transaction has a delete control** — `fc.array(transactionArb, {minLength:1})` — count of `[data-action="delete"]` buttons must equal `N`
    - **Validates: Requirements 2.4**

  - [x] 6.5 Implement `UI.renderBalance(state)` 
    - Compute sum of all `State.transactions` amounts (not filtered); format as `'$' + total.toFixed(2)`; set `#balance-value` `textContent`
    - Display `$0.00` when no transactions exist
    - _Requirements: 3.1, 3.4_

  - [ ]* 6.6 Write property test for balance (P8)
    - **Property 8: Balance equals the sum of all transaction amounts** — `fc.array(transactionArb)` — `#balance-value` textContent must equal `'$' + transactions.reduce((s, t) => s + t.amount, 0).toFixed(2)`
    - **Validates: Requirements 3.1**

  - [x] 6.7 Implement `UI.render(state)` orchestrator
    - Call `UI.renderBalance(state)`, `UI.renderTransactionList(state)`, `UI.renderChart(state)` (stub for chart until task 8), `UI.renderLimitsPanel(state)` (stub until task 12) in sequence
    - _Requirements: 2.3, 3.2, 3.3_

- [~] 7. Checkpoint — transaction CRUD and balance
  - Ensure all transaction and balance tests pass. Run `npx vitest --run`. Verify that manually opening `index.html` shows the empty state and `$0.00` balance. Ask the user if questions arise.

- [x] 8. Pie Chart module
  - [x] 8.1 Implement `App.Chart` module
    - Hold a single Chart.js `Chart` instance in a closure variable
    - Implement `App.Chart.init()`: create `new Chart(canvas, { type: 'pie', ... })` with empty data; store reference
    - Implement `App.Chart.buildChartData(transactions, state)`: group by category → total; filter zeros; compute percentages (`(total/grandTotal*100).toFixed(1)`); build labels (`'CategoryName X.X%'`); assign colors from 20-color `PALETTE` constant; apply highlighted color variant when `Limits.isOverLimit(category, state)` is true
    - Implement `App.Chart.update(state)`: call `buildChartData`; update `chart.data.labels`, `chart.data.datasets[0].data`, `chart.data.datasets[0].backgroundColor`; call `chart.update()`; hide `#chart-empty-state` when data present, show it when empty
    - Replace the stub in `UI.render` with a real `App.Chart.update(state)` call
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 9.3_

  - [ ]* 8.2 Write property tests for `App.Chart` (P9, P10, P21)
    - **Property 9: Chart category percentages are correct and non-zero categories are excluded** — `fc.array(transactionArb, {minLength:1})` — each label's percentage matches `(categoryTotal/grandTotal*100).toFixed(1)` and zero-total categories are absent
    - **Validates: Requirements 4.1, 4.3**
    - **Property 10: Chart segment count matches non-zero category count** — `fc.array(transactionArb, {minLength:1})` with 1–20 distinct categories — `chart.data.datasets[0].data.length` must equal K (non-zero categories)
    - **Validates: Requirements 4.5**
    - **Property 21: Over-limit chart segments are highlighted** — `fc.array(transactionArb)` with a category total ≥ limit — that category's background color must use the highlighted variant
    - **Validates: Requirements 9.3**

  - [ ]* 8.3 Write unit tests for chart empty state and update timing
    - Test that `#chart-empty-state` is visible when `State.transactions` is empty
    - Test that `#chart-empty-state` is hidden when at least one transaction exists
    - _Requirements: 4.4_

- [x] 9. Data persistence on load
  - [x] 9.1 Implement `Bootstrap.loadState()` — read all four localStorage keys on startup
    - Load `evb_transactions`: on `{ ok: true, value: array }` → `State.transactions = value`; on error or null → `State.transactions = []`; show warning banner if `ok: false`
    - Load `evb_custom_categories`: merge into `State.categories` (append after defaults) and set `State.customCategories`; silently default to `[]` on error
    - Load `evb_spending_limits`: set `State.spendingLimits`; silently default to `{}` on error
    - Load `evb_theme`: set `State.theme`; silently default to `'light'` on error or missing
    - After loading all keys, call `UI.render(State)`
    - _Requirements: 5.3, 5.4, 6.6, 10.4, 10.5, 10.6_

  - [ ]* 9.2 Write property test for persistence round-trip (P11)
    - **Property 11: Persistence round-trip — transactions survive reload** — `fc.array(transactionArb)` — `Storage.save(KEYS.TRANSACTIONS, arr)` followed by `Bootstrap.loadState()` must produce `State.transactions` identical in length and fields to `arr`
    - **Validates: Requirements 5.3**

  - [ ]* 9.3 Write unit tests for load-time error handling
    - Test that a corrupted `evb_transactions` JSON value results in `State.transactions = []` and a warning banner is shown
    - Test that `localStorage` unavailable on load initializes empty state and shows warning banner
    - _Requirements: 5.4_

- [~] 10. Checkpoint — persistence
  - Ensure all storage and persistence tests pass. Run `npx vitest --run`. Ask the user if questions arise.

- [x] 11. Custom Categories module
  - [x] 11.1 Implement `App.Categories` CRUD and `UI.renderCategorySelector`
    - Implement `App.Categories.add(name)`: validate via `Validator.validateCustomCategory`; push to `State.categories` and `State.customCategories`; call `Storage.save(KEYS.CUSTOM_CATEGORIES, State.customCategories)`; call `UI.renderCategorySelector(State)`; return `{ ok: bool, error? }`
    - Implement `UI.renderCategorySelector(state)`: rebuild `<option>` elements in `#input-category` from `state.categories`; preserve current selection if still valid
    - Implement `UI.renderLimitsPanel(state)` (replacing stub from task 6): for each category in `state.categories`, render a `.limit-row` with `<label>`, `<input class="limit-input">` pre-filled from `state.spendingLimits[category] || ''`, and `<span class="limit-error" hidden>`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1_

  - [ ]* 11.2 Write property tests for `App.Categories` (P12, P13, P14)
    - **Property 12: Custom category addition is persisted and unique** — `fc.string({minLength:1, maxLength:50})` that is not already in categories — after `Categories.add()`, category appears in `#input-category` and in `evb_custom_categories` localStorage
    - **Validates: Requirements 6.2**
    - **Property 13: Duplicate category names are rejected regardless of case** — `fc.string({minLength:1, maxLength:50})` with random casing — `Categories.add(duplicate)` must return `{ ok: false }` and not increase category count
    - **Validates: Requirements 6.4**
    - **Property 14: Custom categories are restored on load** — `fc.array(fc.string({minLength:1, maxLength:50}), {minLength:1})` — after `Bootstrap.loadState()`, all saved custom category names appear as options in `#input-category`
    - **Validates: Requirements 6.6**

- [x] 12. Monthly filter and Filter module
  - [x] 12.1 Implement `App.Filter.getVisibleTransactions(state)`
    - When `state.activeFilter.month` and `state.activeFilter.year` are both non-null: filter `state.transactions` to only those whose `new Date(tx.timestamp).getMonth() + 1 === filter.month` AND `getFullYear() === filter.year`
    - Apply sort per `state.activeSort`: `'amount-asc'` → ascending amount, `'amount-desc'` → descending amount, `'category-az'` → `localeCompare`; all with `timestamp` descending as tiebreaker; `''` → original insertion order
    - When filter is null/null: return full list (sorted if `activeSort` set)
    - _Requirements: 7.1, 7.2, 7.6, 8.2, 8.4_

  - [x] 12.2 Implement `UI.renderMonthlyFilter(state)` and populate year range
    - Render `#filter-month` with Jan–Dec `<option>` elements; reflect `state.activeFilter.month`
    - Render `#filter-year` with year range from oldest `tx.timestamp`'s year up to `new Date().getFullYear()`; reflect `state.activeFilter.year`
    - _Requirements: 7.1_

  - [ ]* 12.3 Write property tests for `App.Filter` (P15, P16, P18, P19)
    - **Property 15: Monthly filter shows only matching transactions** — `fc.array(transactionArb)`, `fc.integer({min:1, max:12})`, `fc.integer({min:2000, max:2100})` — `getVisibleTransactions` result must contain only transactions matching selected month+year
    - **Validates: Requirements 7.2**
    - **Property 16: Clearing the monthly filter restores all transactions** — `fc.array(transactionArb)` with any active filter — setting `activeFilter = { month: null, year: null }` must return all transactions
    - **Validates: Requirements 7.6**
    - **Property 18: Sorting produces a correctly ordered list** — `fc.array(transactionArb, {minLength:2})`, `fc.constantFrom('amount-asc','amount-desc','category-az')` — output must be in the correct order with timestamp-descending tiebreaker
    - **Validates: Requirements 8.2, 8.4**
    - **Property 19: Active sort is maintained after add/delete** — `fc.array(transactionArb)` with active sort — adding or removing a transaction leaves the result in the same sort order
    - **Validates: Requirements 8.3**

  - [ ]* 12.4 Write unit tests for filter empty states
    - Test that selecting a month+year with no matching transactions returns `[]`
    - Test empty-state message renders when filtered list is empty
    - Test chart shows empty state when filtered list is empty
    - _Requirements: 7.3, 7.4, 7.5_

- [x] 13. Spending Limit Highlight module
  - [x] 13.1 Implement `App.Limits` CRUD and `Limits.isOverLimit`
    - Implement `App.Limits.set(category, rawValue)`: validate via `Validator.validateSpendingLimit`; on valid, set `State.spendingLimits[category] = parsed`; call `Storage.save(KEYS.SPENDING_LIMITS, State.spendingLimits)`; call `UI.render(State)`; return `{ ok: bool, error? }`; on invalid, return `{ ok: false, error }` and preserve previous limit
    - Implement `App.Limits.isOverLimit(category, state)`: `limitAmount = state.spendingLimits[category]`; if null/undefined → `false`; `categoryTotal = sum of all state.transactions amounts where tx.category === category` (unfiltered); return `categoryTotal >= limitAmount`
    - _Requirements: 9.1, 9.2, 9.4, 9.5_

  - [ ]* 13.2 Write property tests for `App.Limits` (P20, P22)
    - **Property 20: Spending limit highlight applies to all over-limit transactions** — `fc.array(transactionArb)`, `fc.float({min:0.01})` for limit — when category total ≥ limit, every `<li>` for that category must have class `over-limit`; when total < limit, none must have it
    - **Validates: Requirements 9.2**
    - **Property 22: Invalid spending limits are rejected and preserve the previous value** — `fc.oneof(fc.constant(''), fc.constant('0'), fc.constant('-1'), fc.string())` — `Limits.set` must return `{ ok: false }`, `State.spendingLimits[category]` must remain unchanged, and a `limit-error` element must be visible
    - **Validates: Requirements 9.5**

- [x] 14. Dark/Light Theme module
  - [x] 14.1 Implement `App.Theme` and theme-flash prevention
    - Add the inline `<script>` in `<head>` (before CSS link) that reads `evb_theme` and sets `document.documentElement.setAttribute('data-theme', 'dark')` synchronously if value is `'dark'`
    - Implement `App.Theme.apply(theme)`: set/remove `data-theme="dark"` on `<html>`; update `#theme-toggle` `aria-pressed` attribute; update button label (🌙 / ☀️)
    - Implement `App.Theme.toggle()`: read `State.theme`; flip to opposite; `Storage.save(KEYS.THEME, newTheme)`; `State.theme = newTheme`; call `App.Theme.apply(newTheme)`
    - Implement `App.Theme.init()`: apply `State.theme` (already loaded by `Bootstrap.loadState`) via `App.Theme.apply`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 14.2 Write property tests for `App.Theme` (P23, P24, P25)
    - **Property 23: Theme toggle is a round-trip** — `fc.constantFrom('light','dark')` as initial state — toggle once → NOT-T; toggle again → T
    - **Validates: Requirements 10.2**
    - **Property 24: Active theme is persisted to localStorage** — `fc.constantFrom('light','dark')` — after `Theme.toggle()`, `localStorage.getItem('evb_theme')` must equal the new theme name
    - **Validates: Requirements 10.3**
    - **Property 25: Stored theme preference is restored on load** — `fc.constantFrom('light','dark')` — after `Bootstrap.loadState()` with a stored theme, `document.documentElement.dataset.theme` must match (or be absent for light)
    - **Validates: Requirements 10.4**

  - [ ]* 14.3 Write unit tests for theme defaults
    - Test that no stored preference → `State.theme === 'light'` and no `data-theme` attribute on `<html>`
    - Test that localStorage unavailable for theme read → light mode, no error shown
    - _Requirements: 10.5, 10.6_

- [~] 15. Checkpoint — features complete
  - Ensure all feature module tests pass. Run `npx vitest --run`. Ask the user if questions arise.

- [x] 16. Bootstrap and event wiring
  - [x] 16.1 Implement `Bootstrap.init()` — wire all event listeners via delegation
    - Attach a single `submit` listener on `#transaction-form`: call `Validator.validateTransaction`; show/clear inline errors (`#error-name`, `#error-amount`, `#error-category`); on valid: `Transactions.add()`; on Storage error show non-blocking banner; reset form on success
    - Attach a `click` listener on `#btn-add-category`: call `Categories.add`; show/clear `#error-custom-category`
    - Attach a single `click` listener on `#transaction-list` (event delegation): `if (e.target.dataset.action === 'delete')` → `Transactions.delete(e.target.dataset.id)` → `UI.render(State)`
    - Attach `change` listener on `#filter-month` and `#filter-year`: update `State.activeFilter`; call `UI.render(State)`
    - Attach `click` listener on `#btn-clear-filter`: reset `State.activeFilter = { month: null, year: null }`; call `UI.render(State)`
    - Attach `change` listener on `#sort-select`: update `State.activeSort`; call `UI.render(State)`
    - Attach `change` listener on `#limits-panel` (delegation on `.limit-input`): call `Limits.set(category, value)`; show/clear `.limit-error`
    - Attach `click` listener on `#theme-toggle`: call `Theme.toggle()`
    - Attach inline `oninput` (or `input` event) to clear sibling error span when user types in any field
    - Call `Bootstrap.loadState()` then `Bootstrap.init()` on `DOMContentLoaded`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 6.2, 7.1, 7.6, 8.2, 9.5, 10.2_

  - [ ]* 16.2 Write unit tests for form reset and event delegation
    - Test that after a valid submission the form fields are reset (P4)
    - **Property 4: Form resets after successful submission** — all three fields must be empty/default after `Transactions.add()` success
    - **Validates: Requirements 1.6**
    - Test that clicking `[data-action="delete"]` on a list item removes that item from `State.transactions`
    - Test that `#btn-clear-filter` resets `State.activeFilter` and rerenders

- [x] 17. Responsive layout, CSS, and accessibility
  - [x] 17.1 Implement `css/styles.css` — layout, typography, dark mode
    - Implement two-column CSS Grid layout (form + limits panel left, chart right, transaction list below): at `< 768px` single-column
    - Define CSS custom properties on `:root` for all colors (background, surface, text, border, accent, over-limit highlight); add `[data-theme="dark"]` block overriding those variables
    - Style `#balance-display` at the top spanning full width; set `body` font-size ≥ 14px, `label` ≥ 12px; enforce ≥ 4px difference between heading levels
    - Style `.transaction-item.over-limit` with the distinct highlight color (`var(--color-over-limit)`) differing from default row
    - Style the pie chart's highlighted segment color variant (driven by `data-theme` + over-limit data from `Chart.buildChartData`)
    - Style `#theme-toggle` with `aria-pressed` CSS selector for visual feedback; include 🌙 / ☀️ label swap
    - Style inline error spans (`.error-msg`) and non-blocking banner (`#toast-banner`); `#toast-banner` auto-dismiss at 5 s via CSS animation
    - _Requirements: 10.2, 12.2, 12.3_

  - [x] 17.2 Implement ARIA attributes and keyboard accessibility
    - Ensure all interactive controls have appropriate `aria-label` or visible `<label>` associations (`for`/`id` pairs)
    - `#theme-toggle`: `aria-pressed` toggled on click; `aria-label="Toggle dark mode"`
    - Delete buttons: `aria-label="Delete {transaction name}"` set during `UI.renderTransactionList`
    - Empty state messages use `role="status"` so screen readers announce them
    - Ensure all form inputs have associated `<label>` elements; category selector has `aria-describedby` pointing to its error span
    - _Requirements: 12.2_

- [~] 18. Error handling — inline errors and non-blocking banners
  - [x] 18.1 Implement `UI.showInlineError` and `UI.clearInlineError`
    - Implement `UI.showInlineError(elementId, message)`: set `textContent` and `style.display = 'block'` (or remove `hidden` attribute)
    - Implement `UI.clearInlineError(elementId)`: set `textContent = ''` and `style.display = 'none'`
    - Wire `oninput` handlers during Bootstrap to call `UI.clearInlineError` on the sibling error span for each input field
    - _Requirements: 1.4, 1.5, 6.3, 6.4, 6.5, 9.5_

  - [ ] 18.2 Implement `UI.showToast(message)` non-blocking banner
    - Implement `UI.showToast(message)`: set `#toast-banner` text; show it; auto-dismiss via `setTimeout(dismiss, 5000)` and provide a dismiss button
    - Call from `Bootstrap` when `Storage.save` returns `{ ok: false, reason: 'quota' }` → show quota error; `{ ok: false, reason: 'unavailable' }` → show unavailable error; corrupted load → show warning
    - _Requirements: 1.7, 5.4, 5.5_

  - [ ]* 18.3 Write unit tests for error handling edge cases
    - Test that localStorage `QuotaExceededError` on `Transactions.add` → transaction not added to list, toast shown
    - Test that localStorage unavailable on `Transactions.add` → transaction not added, toast shown
    - Test that corrupted `evb_transactions` on load → empty state + warning toast
    - Test that invalid spending limit input preserves previous `State.spendingLimits[category]` value
    - _Requirements: 1.7, 5.4, 5.5, 9.5_

- [~] 19. Final checkpoint — all tests pass
  - Run `npx vitest --run` and confirm all tests pass with zero failures.
  - Open `index.html` as a `file://` URL in Chrome, Firefox, Edge, and Safari; verify no JavaScript console errors and all UI components are functional.
  - Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All property tests use **fast-check** with a minimum of 100 iterations per property
- Property tests reference design Properties 1–25 (P1–P25) with tag format: `// Feature: expense-budget-visualizer, Property N: title`
- Unit tests cover DOM structure, empty states, timing, and localStorage error conditions not covered by properties
- `App.js` uses a single IIFE / module pattern — no ES modules — to remain compatible with `file://` protocol
- The vendored `vendor/chart.umd.min.js` must be committed to the repository; it is never loaded from a CDN
- The theme-flash prevention script in `<head>` must appear **before** the CSS `<link>` tag

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["4.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "6.5"] },
    { "id": 7, "tasks": ["6.6", "6.7"] },
    { "id": 8, "tasks": ["8.1", "9.1"] },
    { "id": 9, "tasks": ["8.2", "8.3", "9.2", "9.3", "11.1"] },
    { "id": 10, "tasks": ["11.2", "12.1"] },
    { "id": 11, "tasks": ["12.2", "13.1"] },
    { "id": 12, "tasks": ["12.3", "12.4", "13.2", "14.1"] },
    { "id": 13, "tasks": ["14.2", "14.3", "16.1"] },
    { "id": 14, "tasks": ["16.2", "17.1"] },
    { "id": 15, "tasks": ["17.2", "18.1"] },
    { "id": 16, "tasks": ["18.2"] },
    { "id": 17, "tasks": ["18.3"] }
  ]
}
```
