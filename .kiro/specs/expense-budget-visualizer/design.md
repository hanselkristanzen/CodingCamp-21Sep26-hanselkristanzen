# Design Document — Expense & Budget Visualizer

## Overview

The Expense & Budget Visualizer is a zero-dependency, client-side single-page application (SPA) delivered as a set of static files: one HTML entry point, one CSS file, and one JavaScript file. A vendored copy of Chart.js (UMD build) is bundled locally so the app works fully offline and under the `file://` protocol in Chrome, Firefox, Edge, and Safari.

The application lets users record personal expense transactions (name, amount, category), view a live-updating balance and scrollable transaction list, and explore spending via a pie chart. Supporting features include custom categories, a monthly summary filter, transaction sorting, per-category spending-limit highlights, and a dark/light theme toggle. All state is persisted to the browser's `localStorage`.

### Design Goals

| Goal | Decision |
|---|---|
| Zero build toolchain | Plain `<script>` tags; UMD bundle for Chart.js |
| Works as `file://` | No fetch/XHR; all assets local; no ES modules with cross-origin restriction |
| Single CSS file | `css/styles.css` — all rules in one place |
| Single JS file | `js/app.js` — all logic, namespaced under `App.*` |
| Maintainability | Module pattern with explicit seams between subsystems |
| Performance | Synchronous DOM updates after every state mutation |

---

## Architecture

### File Structure

```
expense-budget-visualizer/
├── index.html            ← Single HTML entry point
├── css/
│   └── styles.css        ← All styles (light + dark mode, highlights)
├── js/
│   └── app.js            ← All application logic
└── vendor/
    └── chart.umd.min.js  ← Chart.js v4 UMD build (vendored locally)
```

> **Chart.js distribution note:** Chart.js v4 ships `chart.umd.js` in its npm package's `dist/` folder. The file is copied verbatim into `vendor/chart.umd.min.js` and loaded via a `<script>` tag in `index.html` before `app.js`. This satisfies Requirement 11.1 (no CDN) and Requirement 11.2 (works as `file://`).

### Module Boundaries (within `app.js`)

`app.js` is structured as an immediately-invoked module pattern exposing internal namespaces. No global pollution beyond the top-level `App` object.

```
App
├── Storage      — localStorage read/write/error handling
├── State        — in-memory application state (single source of truth)
├── Validator    — pure input-validation functions
├── Transactions — CRUD operations on State + Storage
├── Categories   — custom-category management
├── Chart        — Chart.js instance wrapper
├── UI           — DOM render functions (transaction list, balance, chart)
├── Filter       — monthly filter & sort logic
├── Limits       — spending-limit CRUD and highlight logic
├── Theme        — dark/light toggle and persistence
└── Bootstrap    — app init, event listener wiring
```

All inter-module communication flows through `State` — no module directly calls another module's render function. After any mutation, `UI.render()` is called once, which re-renders all affected DOM zones.

### Data Flow

```
User Interaction
      │
      ▼
  Validator.validate()
      │
      ├── invalid → show inline error, stop
      │
      └── valid
            │
            ▼
        Transactions / Categories / Limits / Theme (mutate State)
            │
            ▼
        Storage.save(State)
            │
            ▼
        UI.render(State)   ← single synchronous re-render call
            │
            ├── UI.renderBalance()
            ├── UI.renderTransactionList()
            └── UI.renderChart()
```

### Event Strategy

All event listeners are attached once during `Bootstrap.init()` using event delegation on stable parent elements. The transaction list uses a single `click` listener on the list container that checks `event.target.dataset.action === 'delete'`. This avoids per-item listener leaks as transactions are added and removed.

---

## Components and Interfaces

### 1. Input Form (`#transaction-form`)

Controls:
- `#input-name` — text input, `maxlength="100"`
- `#input-amount` — number input, `min="0.01"`, `max="999999999.99"`, `step="0.01"`
- `#input-category` — `<select>` populated from `State.categories`
- `#input-custom-category` — text input, `maxlength="50"`, for adding new categories
- `#btn-add-transaction` — submit button
- `#btn-add-category` — button to add the custom category
- Inline error containers: `#error-name`, `#error-amount`, `#error-category`, `#error-custom-category`

### 2. Transaction List (`#transaction-list`)

Rendered by `UI.renderTransactionList()`. Each item:

```html
<li class="transaction-item [over-limit]" data-id="{id}">
  <span class="tx-name">{name}</span>
  <span class="tx-category">{category}</span>
  <span class="tx-amount">${amount}</span>
  <button class="btn-delete" data-action="delete" data-id="{id}">×</button>
</li>
```

The `over-limit` CSS class is toggled by `Limits.isOverLimit(category)`.

Empty state: a single `<li class="empty-state">No transactions recorded.</li>` is shown when the filtered list is empty.

### 3. Balance Display (`#balance-display`)

```html
<div id="balance-display">
  Total: <span id="balance-value">$0.00</span>
</div>
```

Updated by `UI.renderBalance()`.

### 4. Pie Chart (`#chart-container`)

```html
<div id="chart-container">
  <canvas id="spending-chart"></canvas>
  <p id="chart-empty-state" hidden>No spending data available.</p>
</div>
```

Managed by `App.Chart` module, which holds a single Chart.js `Chart` instance. On each update, `chart.data.labels`, `chart.data.datasets[0].data`, and `chart.data.datasets[0].backgroundColor` are replaced and `chart.update()` is called — avoiding destroy/recreate overhead.

### 5. Monthly Filter (`#monthly-filter`)

```html
<div id="monthly-filter">
  <select id="filter-month"><!-- Jan–Dec --></select>
  <select id="filter-year"><!-- dynamic range --></select>
  <button id="btn-clear-filter">Show All</button>
</div>
```

`State.activeFilter = { month: null | 1–12, year: null | number }`.

### 6. Sort Control (`#sort-control`)

```html
<select id="sort-select">
  <option value="">Default</option>
  <option value="amount-asc">Amount ↑</option>
  <option value="amount-desc">Amount ↓</option>
  <option value="category-az">Category A–Z</option>
</select>
```

`State.activeSort = '' | 'amount-asc' | 'amount-desc' | 'category-az'`.

### 7. Spending Limit Inputs (`#limits-panel`)

One input per category, rendered dynamically by `UI.renderLimitsPanel()`:

```html
<div class="limit-row" data-category="{category}">
  <label>{category}</label>
  <input type="number" class="limit-input" min="0.01" max="999999999.99" step="0.01"
         value="{currentLimit | ''}">
  <span class="limit-error" hidden></span>
</div>
```

Limits are saved on `change` event (not submit).

### 8. Theme Toggle (`#theme-toggle`)

```html
<button id="theme-toggle" aria-pressed="{dark|light}" aria-label="Toggle dark mode">
  🌙 / ☀️
</button>
```

Theme is applied by toggling a `data-theme="dark"` attribute on `<html>`. CSS variables handle all color switches. The toggle button updates `aria-pressed` to visually and accessibly communicate the current state.

---

## Data Models

### Transaction

```js
{
  id:        string,   // crypto.randomUUID() or Date.now().toString(36) fallback
  name:      string,   // 1–100 characters
  amount:    number,   // float, 0.01–999999999.99
  category:  string,   // must exist in State.categories
  timestamp: number    // Date.now() at time of creation (ms since epoch)
}
```

### AppState (in-memory, `State` module)

```js
{
  transactions:     Transaction[],       // master list, insertion order
  categories:       string[],            // ['Food', 'Transport', 'Fun', ...custom]
  customCategories: string[],            // custom only, persisted separately
  spendingLimits:   { [category]: number }, // category → limit amount
  activeFilter:     { month: null|number, year: null|number },
  activeSort:       '' | 'amount-asc' | 'amount-desc' | 'category-az',
  theme:            'light' | 'dark'
}
```

### localStorage Keys

| Key | Value |
|---|---|
| `evb_transactions` | `JSON.stringify(Transaction[])` |
| `evb_custom_categories` | `JSON.stringify(string[])` |
| `evb_spending_limits` | `JSON.stringify({ [category]: number })` |
| `evb_theme` | `'light'` or `'dark'` |

All keys are namespaced with the `evb_` prefix to avoid collisions.

---

## Key Algorithms

### `Filter.getVisibleTransactions(state)`

Returns the subset of `state.transactions` to display, applying filter then sort:

```
1. Start with state.transactions (all)
2. IF state.activeFilter.month != null AND state.activeFilter.year != null:
     keep only transactions where:
       new Date(tx.timestamp).getMonth() + 1 === filter.month
       AND new Date(tx.timestamp).getFullYear() === filter.year
3. Apply sort per state.activeSort:
     'amount-asc'  → sort by amount ascending, timestamp DESC tiebreaker
     'amount-desc' → sort by amount descending, timestamp DESC tiebreaker
     'category-az' → sort by category.localeCompare(), timestamp DESC tiebreaker
     ''            → original insertion order (no sort)
4. Return filtered+sorted array
```

### `UI.formatAmount(amount)`

```
return '$' + amount.toFixed(2)
```

Applied in balance display and transaction list rendering. Guarantees exactly 2 decimal places.

### `Chart.buildChartData(transactions)`

```
1. Group transactions by category → Map<category, totalAmount>
2. Filter out entries where totalAmount === 0
3. Compute grandTotal = sum of all totalAmounts
4. For each remaining category:
     label    = category name + ' ' + (totalAmount/grandTotal*100).toFixed(1) + '%'
     data     = totalAmount
     bgColor  = deterministic color from PALETTE[index % PALETTE.length]
     If Limits.isOverLimit(category): apply highlighted color variant
5. Return { labels, data, backgroundColors }
```

The color palette is a fixed 20-color array defined as a constant in `App.Chart`, ensuring consistent colors across re-renders.

### `Limits.isOverLimit(category, state)`

```
limitAmount = state.spendingLimits[category]
IF limitAmount == null → return false
categoryTotal = sum of amounts of all transactions in category (from visible or all?)
  → applies to ALL transactions (not filtered), matching Req 9.2–9.4
return categoryTotal >= limitAmount
```

### `Storage.save(key, value)`

```
try {
  localStorage.setItem(key, JSON.stringify(value))
  return { ok: true }
} catch (e) {
  IF e.name === 'QuotaExceededError':
    return { ok: false, reason: 'quota' }
  ELSE:
    return { ok: false, reason: 'unavailable' }
}
```

Callers check the return value and surface the appropriate inline/non-blocking error message.

### `Storage.load(key)`

```
try {
  raw = localStorage.getItem(key)
  IF raw == null → return { ok: true, value: null }
  return { ok: true, value: JSON.parse(raw) }
} catch (e) {
  return { ok: false, reason: 'parse' }
}
```

### Theme Flash Prevention

The theme is read and applied **in a `<script>` tag in `<head>`** before any content renders:

```html
<script>
  (function() {
    try {
      var t = localStorage.getItem('evb_theme');
      if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    } catch(e) {}
  })();
</script>
```

This is the only inline script; it runs synchronously before the first paint, preventing any flash of unstyled content.

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  [☀️/🌙]  Expense & Budget Visualizer          [theme]│
├─────────────────────────────────────────────────────┤
│  Total Balance:  $0.00                               │
├────────────────────┬────────────────────────────────┤
│                    │                                 │
│  ADD TRANSACTION   │       PIE CHART                 │
│  Name: [        ]  │   ┌──────────────────────┐     │
│  Amount: [      ]  │   │        Chart.js       │     │
│  Category: [▼   ]  │   │    pie chart canvas   │     │
│  [Add Transaction] │   └──────────────────────┘     │
│                    │                                 │
│  ADD CATEGORY      │  SPENDING LIMITS                │
│  [        ] [Add]  │  Food:      [       ]           │
│                    │  Transport: [       ]           │
│  FILTER & SORT     │  Fun:       [       ]           │
│  Month [▼] Year[▼] │                                 │
│  [Show All]        │                                 │
│  Sort: [▼       ]  │                                 │
├────────────────────┴────────────────────────────────┤
│  TRANSACTIONS                                        │
│  ┌──────────────────────────────────────────────┐   │
│  │ Name         Category   $Amount      [Delete] │   │
│  │ Name         Category   $Amount      [Delete] │   │
│  │ ...          (scrollable)                     │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Responsive Behavior

- Single-column layout on narrow viewports (`< 768px`): chart stacks below the form.
- Minimum font sizes: body text ≥ 14px, labels ≥ 12px, heading levels differ by ≥ 4px.
- Dark mode: CSS variables swap background/foreground; `data-theme="dark"` on `<html>` activates the dark palette.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Empty form field on submit | Inline error beside each empty field; form not submitted |
| Invalid amount (≤0, NaN) | Inline error beside amount field; form not submitted |
| Empty custom category | Inline error beside category input; not added |
| Duplicate category name (case-insensitive) | Inline error; not added |
| Category name > 50 chars | Inline error; not added |
| Invalid spending limit | Inline error beside limit input; previous limit preserved |
| localStorage unavailable on write | Non-blocking toast/banner error; transaction not added to list |
| localStorage quota exceeded | Non-blocking toast/banner error; previous localStorage contents unchanged |
| localStorage unavailable/corrupt on load | App inits with empty state; non-blocking warning banner displayed |
| localStorage unavailable for theme read | Defaults silently to light mode; no error shown |
| Balance/list/chart update exceeds 100 ms | Last known valid values retained; no partial state shown (synchronous JS update ensures this in practice) |

All inline errors are cleared when the user modifies the relevant field. Non-blocking banners are dismissible and auto-dismiss after 5 seconds.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Valid transaction submission grows the list

*For any* valid transaction (non-empty name ≤ 100 chars, amount in [0.01, 999999999.99], existing category), after it is submitted the transaction list length increases by exactly 1 and localStorage contains the updated list including the new item.

**Validates: Requirements 1.3, 5.1**

---

### Property 2: Invalid amount is rejected

*For any* amount value that is ≤ 0, non-numeric, or empty, submitting the form must not increase the transaction list length and an error element must be visible for the amount field.

**Validates: Requirements 1.5**

---

### Property 3: Empty field submission is rejected

*For any* form submission where at least one required field (name, amount, category) is empty, the transaction list must remain unchanged and an error element must be visible for each empty field.

**Validates: Requirements 1.4**

---

### Property 4: Form resets after successful submission

*For any* valid transaction, after successful submission the name input value is `''`, the amount input value is `''`, and the category selector's `selectedIndex` is `0`.

**Validates: Requirements 1.6**

---

### Property 5: Transaction list rendering shows correct fields with correct formatting

*For any* list of transactions, every rendered transaction item must display the item name, the category name, and the amount formatted as `$X.XX` (exactly two decimal places).

**Validates: Requirements 2.1**

---

### Property 6: Every rendered transaction has a delete control

*For any* non-empty list of N transactions, the rendered transaction list must contain exactly N delete button elements.

**Validates: Requirements 2.4**

---

### Property 7: Deleting a transaction removes it everywhere

*For any* list of N transactions, deleting the transaction at index i results in exactly N−1 entries in the rendered list and the deleted transaction's id is absent from the localStorage transaction array.

**Validates: Requirements 2.5, 5.2**

---

### Property 8: Balance equals the sum of all transaction amounts

*For any* list of transactions, the displayed balance value must equal the arithmetic sum of all transaction amounts rounded to 2 decimal places, prefixed with `$`.

**Validates: Requirements 3.1**

---

### Property 9: Chart category percentages are correct and non-zero categories are excluded

*For any* non-empty transaction list grouped by category, each displayed category's percentage equals `round((categoryTotal / grandTotal) * 100, 1)` and all categories with a total of 0 are absent from the chart data.

**Validates: Requirements 4.1, 4.3**

---

### Property 10: Chart segment count matches non-zero category count

*For any* transaction dataset with K distinct categories whose totals are greater than zero (1 ≤ K ≤ 20), the chart data array must contain exactly K segments.

**Validates: Requirements 4.5**

---

### Property 11: Persistence round-trip — transactions survive reload

*For any* list of transactions saved to localStorage, initializing the app with that localStorage state must produce a transaction list identical in length and content (matching id, name, amount, category, timestamp) to the stored list.

**Validates: Requirements 5.3**

---

### Property 12: Custom category addition is persisted and unique

*For any* valid unique category name (1–50 chars, not already in the category list case-insensitively), after it is submitted it appears in the category `<select>` and in the `evb_custom_categories` localStorage value.

**Validates: Requirements 6.2**

---

### Property 13: Duplicate category names are rejected regardless of case

*For any* existing category name with any combination of upper/lower case characters, submitting it as a new custom category must not increase the category count and must display an error.

**Validates: Requirements 6.4**

---

### Property 14: Custom categories are restored on load

*For any* list of custom category names stored in `evb_custom_categories`, after app initialization all of those names must appear as options in the category `<select>`.

**Validates: Requirements 6.6**

---

### Property 15: Monthly filter shows only matching transactions, sorted newest-first

*For any* list of transactions and any selected (month, year) pair, the displayed transaction list must contain only transactions whose `timestamp` falls within that calendar month and year, and they must be ordered by `timestamp` in descending order.

**Validates: Requirements 7.2**

---

### Property 16: Clearing the monthly filter restores all transactions

*For any* transaction list with any active monthly filter, clearing the filter (selecting "Show All") must result in all transactions being displayed (equal to the unfiltered list length).

**Validates: Requirements 7.6**

---

### Property 17: Added transactions are timestamped at the current time

*For any* valid transaction submitted, its stored `timestamp` must be within 1000 milliseconds of `Date.now()` captured immediately before the submission call.

**Validates: Requirements 7.7**

---

### Property 18: Sorting produces a correctly ordered list

*For any* list of N transactions and any active sort option, the displayed list is in the correct order: non-decreasing amount for `amount-asc`, non-increasing amount for `amount-desc`, lexicographic category order for `category-az`, with `timestamp` descending as tiebreaker in all cases.

**Validates: Requirements 8.2, 8.4**

---

### Property 19: Active sort is maintained after add/delete

*For any* list of transactions with an active sort option, adding or removing a transaction must leave the resulting list in the same sort order.

**Validates: Requirements 8.3**

---

### Property 20: Spending limit highlight applies to all over-limit transactions

*For any* category C with a set spending limit L, if the sum of all transaction amounts in category C is ≥ L, then every rendered transaction item in category C must carry the `over-limit` CSS class (and must not carry it if the sum is < L).

**Validates: Requirements 9.2**

---

### Property 21: Over-limit chart segments are highlighted

*For any* category C with a set spending limit L, if the sum of all transaction amounts in C ≥ L, the chart segment for category C must use the highlighted background color; otherwise it must use the default color.

**Validates: Requirements 9.3**

---

### Property 22: Invalid spending limits are rejected and preserve the previous value

*For any* spending limit input value that is non-positive, non-numeric, or empty, the stored limit for the corresponding category must remain unchanged and an error element must be visible.

**Validates: Requirements 9.5**

---

### Property 23: Theme toggle is a round-trip (idempotence / inverse pair)

*For any* initial theme state T ∈ {`'light'`, `'dark'`}, activating the theme toggle once produces state NOT-T, and activating it a second time restores state T.

**Validates: Requirements 10.2**

---

### Property 24: Active theme is persisted to localStorage

*For any* theme state (light or dark) that is active after a toggle action, the value stored at `evb_theme` in localStorage must equal the active theme name.

**Validates: Requirements 10.3**

---

### Property 25: Stored theme preference is restored on load

*For any* theme value (`'light'` or `'dark'`) stored in `evb_theme`, after app initialization the `data-theme` attribute on `<html>` must match the stored value (or be absent for light mode, per CSS convention).

**Validates: Requirements 10.4**

---

## Testing Strategy

### Overview

The app uses a **dual testing approach**: example-based unit tests for specific scenarios and structural requirements, and property-based tests for universal behavioral properties (Properties 1–25 above). Both are run in a browser-compatible test environment (e.g., Vitest with jsdom) with a mocked `localStorage`.

### Property-Based Testing Library

**[fast-check](https://fast-check.dev/)** is used for property-based testing. It is the most actively maintained JavaScript PBT library with rich arbitrary generators (strings, numbers, arrays, records) and excellent shrinking. Each property test runs a minimum of **100 iterations**.

Test tag format:
```
// Feature: expense-budget-visualizer, Property {N}: {property title}
```

### Unit Tests (Example-Based)

Focus areas:
- Form controls exist in the DOM (Req 1.1, 1.2, 6.1, 8.1, 9.1, 10.1)
- Empty states: transaction list, chart, monthly filter (Req 2.6, 3.4, 4.4, 7.3, 7.5, 8.5)
- Timing-dependent requirements verified synchronously (Req 2.3, 3.2, 3.3, 4.2, 9.4)
- localStorage error conditions: unavailable, parse error, quota exceeded (Req 1.7, 5.4, 5.5, 10.6)
- Theme default: light mode when no preference stored (Req 10.5)
- Default categories present in selector (Req 1.2)

### Property Test Coverage Map

| Property | fast-check Arbitraries |
|---|---|
| P1 — valid submission | `fc.record({ name: fc.string({minLength:1, maxLength:100}), amount: fc.float({min:0.01, max:999999999.99}), category: fc.constantFrom(...categories) })` |
| P2 — invalid amount rejected | `fc.oneof(fc.string(), fc.float({max:0}), fc.constant(''))` |
| P3 — empty field rejected | `fc.record` with at least one field set to `''` |
| P5 — amount format | `fc.float({min:0.01, max:999999999.99})` |
| P7 — delete removes everywhere | `fc.array(transactionArb, {minLength:1})`, `fc.nat` for index |
| P8 — balance = sum | `fc.array(transactionArb)` |
| P9 — chart percentages | `fc.array(transactionArb, {minLength:1})` |
| P11 — load round-trip | `fc.array(transactionArb)` |
| P13 — duplicate category case | `fc.string({minLength:1, maxLength:50})` with random casing via `fc.mapToConstant` |
| P15 — monthly filter | `fc.array(transactionArb)`, `fc.integer({min:1,max:12})`, `fc.integer({min:2000})` |
| P18 — sort order | `fc.array(transactionArb, {minLength:2})`, `fc.constantFrom('amount-asc','amount-desc','category-az')` |
| P20 — highlight all over-limit | `fc.array(transactionArb)`, `fc.float({min:0.01})` for limit |
| P23 — theme toggle round-trip | `fc.constantFrom('light','dark')` for initial state |

### Test File Locations

```
tests/
├── unit/
│   ├── form.test.js
│   ├── transaction-list.test.js
│   ├── balance.test.js
│   ├── chart.test.js
│   ├── persistence.test.js
│   ├── categories.test.js
│   ├── filter-sort.test.js
│   ├── spending-limits.test.js
│   └── theme.test.js
└── property/
    ├── transactions.property.test.js
    ├── persistence.property.test.js
    ├── chart.property.test.js
    ├── filter-sort.property.test.js
    ├── limits.property.test.js
    └── theme.property.test.js
```

### Running Tests

```sh
# Single run (no watch mode)
npx vitest --run
```

> The app itself requires no build step. Tests use Vitest + jsdom to simulate the browser DOM with a mocked `localStorage`.
