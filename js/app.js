(function(global) {
  'use strict';
  var App = {};

  // ---------------------------------------------------------------------------
  // App.Storage — localStorage read/write with structured error returns
  // ---------------------------------------------------------------------------
  App.Storage = (function() {

    var KEYS = {
      TRANSACTIONS:      'evb_transactions',
      CUSTOM_CATEGORIES: 'evb_custom_categories',
      SPENDING_LIMITS:   'evb_spending_limits',
      THEME:             'evb_theme'
    };

    /**
     * Persist a value under the given key.
     * @param {string} key   - One of KEYS.*
     * @param {*}      value - Any JSON-serialisable value
     * @returns {{ ok: true } | { ok: false, reason: 'quota'|'unavailable' }}
     */
    function save(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return { ok: true };
      } catch (e) {
        // DOMException name differs slightly across browsers but all contain
        // "QuotaExceeded" when storage is full.
        if (e && (e.name === 'QuotaExceededError' ||
                  e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                  (typeof e.code !== 'undefined' && e.code === 22))) {
          return { ok: false, reason: 'quota' };
        }
        return { ok: false, reason: 'unavailable' };
      }
    }

    /**
     * Read and deserialise a value from localStorage.
     * @param {string} key - One of KEYS.*
     * @returns {{ ok: true, value: * } | { ok: false, reason: 'parse' }}
     */
    function load(key) {
      try {
        var raw = localStorage.getItem(key);
        if (raw === null) {
          return { ok: true, value: null };
        }
        return { ok: true, value: JSON.parse(raw) };
      } catch (e) {
        return { ok: false, reason: 'parse' };
      }
    }

    return {
      KEYS: KEYS,
      save: save,
      load: load
    };
  })();

  // ---------------------------------------------------------------------------
  // App.State — in-memory application state (single source of truth)
  // ---------------------------------------------------------------------------
  App.State = (function() {

    var DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

    var state = {
      transactions:     [],
      categories:       DEFAULT_CATEGORIES.slice(),
      customCategories: [],
      spendingLimits:   {},
      activeFilter:     { month: null, year: null },
      activeSort:       '',
      theme:            'light'
    };

    /**
     * Restore all state fields to their default values in place.
     * Mutates the existing object so that external references remain valid.
     */
    function reset() {
      state.transactions     = [];
      state.categories       = DEFAULT_CATEGORIES.slice();
      state.customCategories = [];
      state.spendingLimits   = {};
      state.activeFilter     = { month: null, year: null };
      state.activeSort       = '';
      state.theme            = 'light';
    }

    state.reset = reset;

    return state;
  })();

  // ---------------------------------------------------------------------------
  // App.Validator — pure input validation functions
  // ---------------------------------------------------------------------------
  App.Validator = (function() {

    var MAX_NAME_LENGTH     = 100;
    var MAX_CATEGORY_LENGTH = 50;
    var MIN_AMOUNT          = 0.01;
    var MAX_AMOUNT          = 999999999.99;

    /**
     * Validate a transaction item name.
     * @param {*} value
     * @returns {{ valid: true } | { valid: false, message: string }}
     */
    function validateName(value) {
      if (typeof value !== 'string' || value.trim() === '') {
        return { valid: false, message: 'Item name is required.' };
      }
      if (value.trim().length > MAX_NAME_LENGTH) {
        return { valid: false, message: 'Item name must be 100 characters or fewer.' };
      }
      return { valid: true };
    }

    /**
     * Validate a transaction amount.
     * @param {*} value - raw input (string or number)
     * @returns {{ valid: true, parsed: number } | { valid: false, message: string }}
     */
    function validateAmount(value) {
      if (value === '' || value === null || value === undefined) {
        return { valid: false, message: 'Amount is required.' };
      }
      var parsed = parseFloat(value);
      if (isNaN(parsed)) {
        return { valid: false, message: 'Amount must be a positive number.' };
      }
      if (parsed < MIN_AMOUNT) {
        return { valid: false, message: 'Amount must be at least 0.01.' };
      }
      if (parsed > MAX_AMOUNT) {
        return { valid: false, message: 'Amount must be 999,999,999.99 or less.' };
      }
      return { valid: true, parsed: parsed };
    }

    /**
     * Validate a transaction category selection.
     * @param {*}        value      - selected category value
     * @param {string[]} categories - allowed categories
     * @returns {{ valid: true } | { valid: false, message: string }}
     */
    function validateCategory(value, categories) {
      if (typeof value !== 'string' || value.trim() === '') {
        return { valid: false, message: 'Category is required.' };
      }
      if (!Array.isArray(categories) || categories.indexOf(value) === -1) {
        return { valid: false, message: 'Please select a valid category.' };
      }
      return { valid: true };
    }

    /**
     * Validate all three transaction fields at once.
     * @param {*}        name
     * @param {*}        amount
     * @param {*}        category
     * @param {string[]} categories
     * @returns {{ valid: boolean, errors: { name?: string, amount?: string, category?: string } }}
     */
    function validateTransaction(name, amount, category, categories) {
      var errors = {};

      var nameResult = validateName(name);
      if (!nameResult.valid) {
        errors.name = nameResult.message;
      }

      var amountResult = validateAmount(amount);
      if (!amountResult.valid) {
        errors.amount = amountResult.message;
      }

      var categoryResult = validateCategory(category, categories);
      if (!categoryResult.valid) {
        errors.category = categoryResult.message;
      }

      var valid = Object.keys(errors).length === 0;
      return { valid: valid, errors: errors };
    }

    /**
     * Validate a custom category name.
     * @param {*}        value              - user-entered category name
     * @param {string[]} existingCategories - current list of categories (case-insensitive check)
     * @returns {{ valid: true } | { valid: false, message: string }}
     */
    function validateCustomCategory(value, existingCategories) {
      if (typeof value !== 'string' || value.trim() === '') {
        return { valid: false, message: 'Category name cannot be empty.' };
      }
      if (value.trim().length > MAX_CATEGORY_LENGTH) {
        return { valid: false, message: 'Category name must be 50 characters or fewer.' };
      }
      var lower = value.trim().toLowerCase();
      if (Array.isArray(existingCategories)) {
        for (var i = 0; i < existingCategories.length; i++) {
          if (existingCategories[i].toLowerCase() === lower) {
            return { valid: false, message: 'This category already exists.' };
          }
        }
      }
      return { valid: true };
    }

    /**
     * Validate a spending limit value.
     * @param {*} value - raw input (string or number)
     * @returns {{ valid: true, parsed: number } | { valid: false, message: string }}
     */
    function validateSpendingLimit(value) {
      if (value === '' || value === null || value === undefined) {
        return { valid: false, message: 'Spending limit is required.' };
      }
      var parsed = parseFloat(value);
      if (isNaN(parsed)) {
        return { valid: false, message: 'Spending limit must be a positive number.' };
      }
      if (parsed <= 0) {
        return { valid: false, message: 'Spending limit must be greater than 0.' };
      }
      if (parsed > MAX_AMOUNT) {
        return { valid: false, message: 'Spending limit must be 999,999,999.99 or less.' };
      }
      return { valid: true, parsed: parsed };
    }

    return {
      validateName:           validateName,
      validateAmount:         validateAmount,
      validateCategory:       validateCategory,
      validateTransaction:    validateTransaction,
      validateCustomCategory: validateCustomCategory,
      validateSpendingLimit:  validateSpendingLimit
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Transactions — CRUD operations on State + Storage  (Task 6.1)
  // ---------------------------------------------------------------------------
  App.Transactions = (function() {

    /**
     * Add a new transaction to State and persist it.
     * @param {string} name
     * @param {number} amount  - already-validated float
     * @param {string} category
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function add(name, amount, category) {
      // Generate a unique id: prefer crypto.randomUUID(), fall back to timestamp
      var id;
      try {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : Date.now().toString(36) + Math.random().toString(36).slice(2);
      } catch (e) {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }

      var transaction = {
        id:        id,
        name:      name,
        amount:    amount,
        category:  category,
        timestamp: Date.now()
      };

      App.State.transactions.push(transaction);

      var result = App.Storage.save(App.Storage.KEYS.TRANSACTIONS, App.State.transactions);
      if (!result.ok) {
        // Roll back the push so state stays consistent with storage
        App.State.transactions.pop();
        return { ok: false, error: result.reason };
      }

      return { ok: true };
    }

    /**
     * Remove a transaction by id from State and persist.
     * @param {string} id
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function remove(id) {
      var previous = App.State.transactions.slice();
      App.State.transactions = App.State.transactions.filter(function(tx) {
        return tx.id !== id;
      });

      var result = App.Storage.save(App.Storage.KEYS.TRANSACTIONS, App.State.transactions);
      if (!result.ok) {
        // Roll back
        App.State.transactions = previous;
        return { ok: false, error: result.reason };
      }

      return { ok: true };
    }

    return {
      add:    add,
      delete: remove   // expose as "delete" per the spec interface
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Chart — Chart.js pie-chart wrapper  (Task 8.1)
  // ---------------------------------------------------------------------------
  App.Chart = (function() {

    /** 20 distinct base colours for pie segments (deterministic by index). */
    var PALETTE = [
      '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
      '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC',
      '#1F77B4', '#FF7F0E', '#2CA02C', '#D62728', '#9467BD',
      '#8C564B', '#E377C2', '#7F7F7F', '#BCBD22', '#17BECF'
    ];

    /**
     * Highlighted (over-limit) colour variants — warm / warning tones
     * matching the same 20 slots so index parity is maintained.
     */
    var HIGHLIGHT_PALETTE = [
      '#FF4444', '#FF6B35', '#FF3333', '#FF5E5B', '#FF4E50',
      '#FF6600', '#FF5580', '#FF3366', '#FF5733', '#FF4040',
      '#FF2222', '#FF5500', '#FF3300', '#FF1111', '#FF4488',
      '#FF3355', '#FF44AA', '#FF3333', '#FF5500', '#FF2244'
    ];

    /** Single Chart.js instance — created once by init(). */
    var _chartInstance = null;

    /**
     * Initialise the Chart.js instance on the #spending-chart canvas.
     * Must be called after DOMContentLoaded and after Chart.js is loaded.
     */
    function init() {
      var canvas = document.getElementById('spending-chart');
      if (!canvas) { return; }

      // Guard against double-init (e.g. during hot reload in tests)
      if (_chartInstance) {
        _chartInstance.destroy();
        _chartInstance = null;
      }

      // Chart is a global supplied by vendor/chart.umd.min.js
      // eslint-disable-next-line no-undef
      _chartInstance = new Chart(canvas, {
        type: 'pie',
        data: {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: [],
            borderWidth: 2,
            borderColor: '#ffffff'
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 14, padding: 12 }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ' ' + context.label + ': $' + context.parsed.toFixed(2);
                }
              }
            }
          }
        }
      });
    }

    /**
     * Build the data payload for the chart from a flat transaction array.
     *
     * @param {Array}  transactions - All (unfiltered) transactions
     * @param {object} state        - Full App.State (used for isOverLimit check)
     * @returns {{ labels: string[], data: number[], backgroundColors: string[] }}
     */
    function buildChartData(transactions, state) {
      // 1. Group by category
      var totals = {};
      for (var i = 0; i < transactions.length; i++) {
        var tx = transactions[i];
        totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
      }

      // 2. Filter zero-total categories and collect keys
      var categories = [];
      for (var cat in totals) {
        if (Object.prototype.hasOwnProperty.call(totals, cat) && totals[cat] > 0) {
          categories.push(cat);
        }
      }

      if (categories.length === 0) {
        return { labels: [], data: [], backgroundColors: [] };
      }

      // 3. Grand total
      var grandTotal = 0;
      for (var j = 0; j < categories.length; j++) {
        grandTotal += totals[categories[j]];
      }

      // 4. Build parallel arrays
      var labels = [];
      var data = [];
      var backgroundColors = [];

      for (var k = 0; k < categories.length; k++) {
        var category   = categories[k];
        var catTotal   = totals[category];
        var pct        = (catTotal / grandTotal * 100).toFixed(1);
        var overLimit  = (App.Limits && typeof App.Limits.isOverLimit === 'function')
          ? App.Limits.isOverLimit(category, state)
          : false;

        labels.push(category + ' ' + pct + '%');
        data.push(catTotal);
        backgroundColors.push(overLimit
          ? HIGHLIGHT_PALETTE[k % HIGHLIGHT_PALETTE.length]
          : PALETTE[k % PALETTE.length]);
      }

      return { labels: labels, data: data, backgroundColors: backgroundColors };
    }

    /**
     * Refresh the live chart to match current state.
     * Uses ALL transactions (not filtered) per the design spec.
     *
     * @param {object} state - App.State
     */
    function update(state) {
      var emptyEl  = document.getElementById('chart-empty-state');
      var canvas   = document.getElementById('spending-chart');

      // Lazily initialise if not already done (handles test environments)
      if (!_chartInstance && canvas) {
        init();
      }

      if (!_chartInstance) { return; }

      var chartData = buildChartData(state.transactions, state);
      var isEmpty   = chartData.labels.length === 0;

      // Update chart data in place (avoids destroy/recreate overhead)
      _chartInstance.data.labels                      = chartData.labels;
      _chartInstance.data.datasets[0].data            = chartData.data;
      _chartInstance.data.datasets[0].backgroundColor = chartData.backgroundColors;
      _chartInstance.update();

      // Toggle empty-state message and canvas visibility
      if (emptyEl) {
        if (isEmpty) {
          emptyEl.removeAttribute('hidden');
        } else {
          emptyEl.setAttribute('hidden', '');
        }
      }
      if (canvas) {
        canvas.style.display = isEmpty ? 'none' : '';
      }
    }

    /**
     * Destroy the current Chart.js instance (used by tests to reset state).
     */
    function destroy() {
      if (_chartInstance) {
        _chartInstance.destroy();
        _chartInstance = null;
      }
    }

    return {
      PALETTE:          PALETTE,
      HIGHLIGHT_PALETTE: HIGHLIGHT_PALETTE,
      init:             init,
      buildChartData:   buildChartData,
      update:           update,
      destroy:          destroy
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Categories — custom-category management  (Task 11.1)
  // ---------------------------------------------------------------------------
  App.Categories = (function() {

    /**
     * Add a new custom category.
     *
     * Validates the name, pushes to State.categories and State.customCategories,
     * persists to localStorage, and re-renders the category selector and limits panel.
     *
     * @param {string} name - raw user input
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function add(name) {
      var result = App.Validator.validateCustomCategory(name, App.State.categories);
      if (!result.valid) {
        return { ok: false, error: result.message };
      }

      var trimmed = name.trim();

      // Mutate state
      App.State.categories.push(trimmed);
      App.State.customCategories.push(trimmed);

      // Persist the custom categories list
      var saveResult = App.Storage.save(
        App.Storage.KEYS.CUSTOM_CATEGORIES,
        App.State.customCategories
      );
      if (!saveResult.ok) {
        // Roll back state mutation
        App.State.categories.pop();
        App.State.customCategories.pop();
        return { ok: false, error: 'Could not save category: storage ' + saveResult.reason + '.' };
      }

      // Re-render affected UI zones
      App.UI.renderCategorySelector(App.State);
      App.UI.renderLimitsPanel(App.State);

      return { ok: true };
    }

    return {
      add: add
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Filter — monthly filter and sort logic  (Task 12.1)
  // ---------------------------------------------------------------------------
  App.Filter = (function() {

    /**
     * Return the subset of state.transactions that should be displayed,
     * applying the active month/year filter and then sorting.
     *
     * Algorithm (per design spec):
     *  1. Start with the full state.transactions array (insertion order).
     *  2. If both activeFilter.month and activeFilter.year are non-null:
     *       keep only transactions where
     *         new Date(tx.timestamp).getMonth() + 1 === filter.month
     *         AND new Date(tx.timestamp).getFullYear() === filter.year
     *  3. Apply sort per state.activeSort:
     *       'amount-asc'  → ascending amount, timestamp DESC tiebreaker
     *       'amount-desc' → descending amount, timestamp DESC tiebreaker
     *       'category-az' → localeCompare on category, timestamp DESC tiebreaker
     *       ''            → original insertion order (no sort)
     *  4. Return the resulting array (does not mutate state).
     *
     * @param {object} state - App.State
     * @returns {Array} - filtered and sorted copy of state.transactions
     */
    function getVisibleTransactions(state) {
      // Step 1 — start with all transactions
      var result = state.transactions.slice();

      // Step 2 — apply month/year filter when both parts are set
      var filter = state.activeFilter;
      if (filter.month !== null && filter.year !== null) {
        result = result.filter(function(tx) {
          var d = new Date(tx.timestamp);
          return (d.getMonth() + 1 === filter.month) &&
                 (d.getFullYear()  === filter.year);
        });
      }

      // Step 3 — apply sort (slice already gave us a copy so sort in place)
      var sort = state.activeSort;
      if (sort === 'amount-asc') {
        result.sort(function(a, b) {
          if (a.amount !== b.amount) { return a.amount - b.amount; }
          return b.timestamp - a.timestamp;
        });
      } else if (sort === 'amount-desc') {
        result.sort(function(a, b) {
          if (a.amount !== b.amount) { return b.amount - a.amount; }
          return b.timestamp - a.timestamp;
        });
      } else if (sort === 'category-az') {
        result.sort(function(a, b) {
          var cmp = a.category.localeCompare(b.category);
          if (cmp !== 0) { return cmp; }
          return b.timestamp - a.timestamp;
        });
      }
      // '' → insertion order, nothing to do

      return result;
    }

    return {
      getVisibleTransactions: getVisibleTransactions
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Limits — spending-limit CRUD and over-limit detection  (Task 13.1)
  // ---------------------------------------------------------------------------
  App.Limits = (function() {

    /**
     * Set or update the spending limit for a category.
     *
     * Validates rawValue via Validator.validateSpendingLimit.  On success the
     * limit is persisted and the UI is re-rendered; on failure the previous
     * limit is preserved and an error descriptor is returned.
     *
     * @param {string} category  - Must be one of State.categories
     * @param {*}      rawValue  - Raw value from the limit input (string or number)
     * @returns {{ ok: true } | { ok: false, error: string }}
     */
    function set(category, rawValue) {
      // Step 1 — validate the raw input
      var result = App.Validator.validateSpendingLimit(rawValue);
      if (!result.valid) {
        // Invalid — do NOT mutate State, return the error (Req 9.5)
        return { ok: false, error: result.message };
      }

      // Step 2 — persist the validated (parsed) value
      App.State.spendingLimits[category] = result.parsed;

      var saveResult = App.Storage.save(
        App.Storage.KEYS.SPENDING_LIMITS,
        App.State.spendingLimits
      );

      if (!saveResult.ok) {
        // Roll back to avoid state/storage divergence
        delete App.State.spendingLimits[category];
        return { ok: false, error: 'Could not save spending limit: storage ' + saveResult.reason + '.' };
      }

      // Step 3 — re-render so highlights update immediately (Req 9.4)
      App.UI.render(App.State);

      return { ok: true };
    }

    /**
     * Determine whether a category's total spending meets or exceeds its limit.
     *
     * Always compares against ALL transactions (never the filtered view) so
     * highlights remain accurate regardless of the active monthly filter
     * (Requirements 9.2, 9.4).
     *
     * @param {string} category - Category name to check
     * @param {object} state    - App.State (or a state-shaped object for tests)
     * @returns {boolean}
     */
    function isOverLimit(category, state) {
      var limitAmount = state.spendingLimits[category];

      // No limit set → never over limit
      if (limitAmount == null) {
        return false;
      }

      // Sum ALL transactions in the category (unfiltered)
      var categoryTotal = 0;
      var txns = state.transactions;
      for (var i = 0; i < txns.length; i++) {
        if (txns[i].category === category) {
          categoryTotal += txns[i].amount;
        }
      }

      return categoryTotal >= limitAmount;
    }

    return {
      set:         set,
      isOverLimit: isOverLimit
    };
  })();

  // ---------------------------------------------------------------------------
  // App.UI — DOM render functions  (Tasks 6.3, 6.5, 6.7)
  // ---------------------------------------------------------------------------
  App.UI = (function() {

    // --- Task 6.5: renderBalance -----------------------------------------------

    /**
     * Compute the sum of ALL transactions (unfiltered) and update #balance-value.
     * @param {object} state - App.State
     */
    function renderBalance(state) {
      var total = 0;
      var txns = state.transactions;
      for (var i = 0; i < txns.length; i++) {
        total += txns[i].amount;
      }
      var formatted = '$' + total.toFixed(2);
      var el = document.getElementById('balance-value');
      if (el) {
        el.textContent = formatted;
      }
    }

    // --- Task 6.3: renderTransactionList ----------------------------------------

    /**
     * Re-render the #transaction-list element from current state.
     * @param {object} state - App.State
     */
    function renderTransactionList(state) {
      var listEl = document.getElementById('transaction-list');
      if (!listEl) { return; }

      // Determine visible (and sorted) transactions.
      // App.Filter may not exist yet — fall back to the full list.
      var visible;
      if (App.Filter && typeof App.Filter.getVisibleTransactions === 'function') {
        visible = App.Filter.getVisibleTransactions(state);
      } else {
        visible = state.transactions.slice();
        // Apply basic sort if activeSort is already set (defensive)
        if (state.activeSort === 'amount-asc') {
          visible.sort(function(a, b) { return a.amount - b.amount || b.timestamp - a.timestamp; });
        } else if (state.activeSort === 'amount-desc') {
          visible.sort(function(a, b) { return b.amount - a.amount || b.timestamp - a.timestamp; });
        } else if (state.activeSort === 'category-az') {
          visible.sort(function(a, b) {
            var cmp = a.category.localeCompare(b.category);
            return cmp !== 0 ? cmp : b.timestamp - a.timestamp;
          });
        }
      }

      // Clear existing content
      listEl.innerHTML = '';

      if (visible.length === 0) {
        var emptyItem = document.createElement('li');
        emptyItem.className = 'empty-state';
        emptyItem.setAttribute('role', 'status');
        emptyItem.setAttribute('aria-live', 'polite');
        // Use a contextual message when a monthly filter is active (Req 7.3)
        var filter = state.activeFilter;
        if (filter.month !== null && filter.year !== null) {
          emptyItem.textContent = 'No transactions found for the selected period.';
        } else {
          emptyItem.textContent = 'No transactions recorded.';
        }
        listEl.appendChild(emptyItem);
        return;
      }

      // Build a document fragment for performance
      var fragment = document.createDocumentFragment();
      for (var i = 0; i < visible.length; i++) {
        var tx = visible[i];

        var li = document.createElement('li');
        li.className = 'transaction-item';
        li.setAttribute('data-id', tx.id);

        // Check over-limit highlight; App.Limits may not exist yet
        var over = (App.Limits && typeof App.Limits.isOverLimit === 'function')
          ? App.Limits.isOverLimit(tx.category, state)
          : false;
        if (over) {
          li.className += ' over-limit';
        }

        var nameSpan = document.createElement('span');
        nameSpan.className = 'tx-name';
        nameSpan.textContent = tx.name;

        var catSpan = document.createElement('span');
        catSpan.className = 'tx-category';
        catSpan.textContent = tx.category;

        var amtSpan = document.createElement('span');
        amtSpan.className = 'tx-amount';
        amtSpan.textContent = '$' + tx.amount.toFixed(2);

        var delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.setAttribute('data-action', 'delete');
        delBtn.setAttribute('data-id', tx.id);
        delBtn.setAttribute('aria-label', 'Delete ' + tx.name);
        delBtn.textContent = '×';

        li.appendChild(nameSpan);
        li.appendChild(catSpan);
        li.appendChild(amtSpan);
        li.appendChild(delBtn);

        fragment.appendChild(li);
      }
      listEl.appendChild(fragment);
    }

    // --- Task 6.7: renderChart stub ---------------------------------------------

    /**
     * Stub — replaced by App.Chart.update() in Task 8.
     * @param {object} _state
     */
    function renderChart(_state) {
      // No-op until Task 8 implements App.Chart
      if (App.Chart && typeof App.Chart.update === 'function') {
        App.Chart.update(_state);
      }
    }

    // --- Task 11.1: renderCategorySelector ----------------------------------------

    /**
     * Rebuild the <option> elements in #input-category from state.categories.
     * Preserves the current selection if it still exists in the updated list.
     *
     * @param {object} state - App.State
     */
    function renderCategorySelector(state) {
      var selectEl = document.getElementById('input-category');
      if (!selectEl) { return; }

      // Remember current selection so we can restore it if still valid
      var currentValue = selectEl.value;

      // Clear and rebuild options
      selectEl.innerHTML = '';
      var fragment = document.createDocumentFragment();
      for (var i = 0; i < state.categories.length; i++) {
        var opt = document.createElement('option');
        opt.value       = state.categories[i];
        opt.textContent = state.categories[i];
        fragment.appendChild(opt);
      }
      selectEl.appendChild(fragment);

      // Restore previous selection if it is still valid
      if (currentValue && state.categories.indexOf(currentValue) !== -1) {
        selectEl.value = currentValue;
      } else {
        // Fall back to first option
        selectEl.selectedIndex = 0;
      }
    }

    // --- Task 11.1: renderLimitsPanel (replaces stub) ----------------------------

    /**
     * Render one .limit-row per category inside #limits-panel.
     * Each row contains a label, a number input pre-filled with the saved limit
     * (or empty), and a hidden error span.
     *
     * @param {object} state - App.State
     */
    function renderLimitsPanel(state) {
      var panelEl = document.getElementById('limits-panel');
      if (!panelEl) { return; }

      panelEl.innerHTML = '';
      var fragment = document.createDocumentFragment();

      for (var i = 0; i < state.categories.length; i++) {
        var category    = state.categories[i];
        var savedLimit  = state.spendingLimits[category];

        var row = document.createElement('div');
        row.className = 'limit-row';
        row.setAttribute('data-category', category);

        var label = document.createElement('label');
        var inputId = 'limit-input-' + category.replace(/\s+/g, '-').toLowerCase();
        label.setAttribute('for', inputId);
        label.textContent = category;

        var input = document.createElement('input');
        input.type      = 'number';
        input.id        = inputId;
        input.className = 'limit-input';
        input.min       = '0.01';
        input.max       = '999999999.99';
        input.step      = '0.01';
        input.value     = (savedLimit !== undefined && savedLimit !== null)
          ? savedLimit
          : '';
        input.setAttribute('data-category', category);
        input.setAttribute('aria-label', 'Spending limit for ' + category);
        input.setAttribute('placeholder', 'No limit');

        var errorSpan = document.createElement('span');
        errorSpan.className = 'limit-error error-msg';
        errorSpan.setAttribute('role', 'alert');
        errorSpan.setAttribute('aria-live', 'polite');
        errorSpan.setAttribute('hidden', '');

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(errorSpan);
        fragment.appendChild(row);
      }

      panelEl.appendChild(fragment);
    }

    // --- Task 12.2: renderMonthlyFilter -----------------------------------------

    /** Month names for building <option> labels (1-indexed, index 0 unused). */
    var MONTH_NAMES = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    /**
     * Rebuild #filter-month and #filter-year <option> elements to reflect the
     * current state (Requirements 7.1).
     *
     * Month options: blank "All Months" (value ""), Jan–Dec (values 1–12).
     * Year options:  blank "All Years" (value ""), then oldest-tx-year …
     *                current year. When there are no transactions, only the
     *                current year is shown.
     *
     * Reflects state.activeFilter.month / state.activeFilter.year by marking
     * the matching <option> as selected (or the blank option when null).
     *
     * @param {object} state - App.State
     */
    function renderMonthlyFilter(state) {
      var monthEl = document.getElementById('filter-month');
      var yearEl  = document.getElementById('filter-year');

      // --- Month selector ---------------------------------------------------
      if (monthEl) {
        monthEl.innerHTML = '';
        var monthFragment = document.createDocumentFragment();

        // Blank / "All Months" option
        var blankMonthOpt = document.createElement('option');
        blankMonthOpt.value = '';
        blankMonthOpt.textContent = 'All Months';
        if (state.activeFilter.month === null || state.activeFilter.month === undefined) {
          blankMonthOpt.selected = true;
        }
        monthFragment.appendChild(blankMonthOpt);

        for (var m = 1; m <= 12; m++) {
          var monthOpt = document.createElement('option');
          monthOpt.value = m;
          monthOpt.textContent = MONTH_NAMES[m];
          if (state.activeFilter.month === m) {
            monthOpt.selected = true;
          }
          monthFragment.appendChild(monthOpt);
        }
        monthEl.appendChild(monthFragment);
      }

      // --- Year selector ----------------------------------------------------
      if (yearEl) {
        yearEl.innerHTML = '';
        var yearFragment = document.createDocumentFragment();

        // Blank / "All Years" option
        var blankYearOpt = document.createElement('option');
        blankYearOpt.value = '';
        blankYearOpt.textContent = 'All Years';
        if (state.activeFilter.year === null || state.activeFilter.year === undefined) {
          blankYearOpt.selected = true;
        }
        yearFragment.appendChild(blankYearOpt);

        var currentYear = new Date().getFullYear();
        var oldestYear  = currentYear;

        if (state.transactions.length > 0) {
          var minTimestamp = state.transactions[0].timestamp;
          for (var ti = 1; ti < state.transactions.length; ti++) {
            if (state.transactions[ti].timestamp < minTimestamp) {
              minTimestamp = state.transactions[ti].timestamp;
            }
          }
          oldestYear = new Date(minTimestamp).getFullYear();
        }

        // Ensure the range is always valid even if clocks are odd
        var startYear = Math.min(oldestYear, currentYear);

        for (var y = startYear; y <= currentYear; y++) {
          var yearOpt = document.createElement('option');
          yearOpt.value = y;
          yearOpt.textContent = y;
          if (state.activeFilter.year === y) {
            yearOpt.selected = true;
          }
          yearFragment.appendChild(yearOpt);
        }
        yearEl.appendChild(yearFragment);
      }
    }

    // --- Task 6.7: render orchestrator -------------------------------------------

    /**
     * Master render — called after every state mutation.
     * @param {object} state - App.State
     */
    function render(state) {
      renderBalance(state);
      renderTransactionList(state);
      renderChart(state);
      renderLimitsPanel(state);
      renderMonthlyFilter(state);
    }

    // --- Task 18.1: showInlineError / clearInlineError -----------------------

    /**
     * Show an inline validation error message adjacent to a form field.
     * @param {string} elementId - id of the error <span>
     * @param {string} message   - error text to display
     */
    function showInlineError(elementId, message) {
      var el = document.getElementById(elementId);
      if (!el) { return; }
      el.textContent = message;
      el.style.display = 'block';
      el.removeAttribute('hidden');
    }

    /**
     * Clear a previously shown inline error.
     * @param {string} elementId - id of the error <span>
     */
    function clearInlineError(elementId) {
      var el = document.getElementById(elementId);
      if (!el) { return; }
      el.textContent = '';
      el.style.display = 'none';
    }

    // --- Task 18.2: showToast ------------------------------------------------

    /** Auto-dismiss timer handle. */
    var _toastTimer = null;

    /**
     * Show a non-blocking notification banner.
     * Auto-dismisses after 5 seconds; also provides a dismiss button.
     * @param {string} message - Message to display
     */
    function showToast(message) {
      var banner = document.getElementById('notification-banner');
      if (!banner) { return; }

      // Clear any pending auto-dismiss from a previous toast
      if (_toastTimer !== null) {
        clearTimeout(_toastTimer);
        _toastTimer = null;
      }

      // Build content: message text + dismiss button
      banner.innerHTML = '';
      var msgNode = document.createTextNode(message);
      banner.appendChild(msgNode);

      var dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'toast-dismiss';
      dismissBtn.setAttribute('aria-label', 'Dismiss notification');
      dismissBtn.textContent = '×';
      dismissBtn.addEventListener('click', function() {
        banner.setAttribute('hidden', '');
        banner.innerHTML = '';
        if (_toastTimer !== null) {
          clearTimeout(_toastTimer);
          _toastTimer = null;
        }
      });
      banner.appendChild(dismissBtn);

      banner.removeAttribute('hidden');

      // Auto-dismiss after 5 s (Req 18.2)
      _toastTimer = setTimeout(function() {
        banner.setAttribute('hidden', '');
        banner.innerHTML = '';
        _toastTimer = null;
      }, 5000);
    }

    return {
      render:                 render,
      renderBalance:          renderBalance,
      renderTransactionList:  renderTransactionList,
      renderChart:            renderChart,
      renderCategorySelector: renderCategorySelector,
      renderLimitsPanel:      renderLimitsPanel,
      renderMonthlyFilter:    renderMonthlyFilter,
      showInlineError:        showInlineError,
      clearInlineError:       clearInlineError,
      showToast:              showToast
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Theme — dark/light theme toggle and persistence  (Task 14.1)
  // ---------------------------------------------------------------------------
  App.Theme = (function() {

    /**
     * Apply a theme to the document.
     *
     * - Sets or removes `data-theme="dark"` on <html>.
     * - Keeps #theme-toggle's aria-pressed and label text in sync.
     *
     * @param {'light'|'dark'} theme
     */
    function apply(theme) {
      var html       = document.documentElement;
      var toggleBtn  = document.getElementById('theme-toggle');

      if (theme === 'dark') {
        html.setAttribute('data-theme', 'dark');
      } else {
        html.removeAttribute('data-theme');
      }

      if (toggleBtn) {
        // aria-pressed = true while dark mode is active
        toggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
        // Show ☀️ when in dark mode (click to go light), 🌙 when in light mode
        toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      }
    }

    /**
     * Toggle between 'light' and 'dark', persist the choice, and re-apply.
     */
    function toggle() {
      var newTheme = App.State.theme === 'dark' ? 'light' : 'dark';
      App.Storage.save(App.Storage.KEYS.THEME, newTheme);
      App.State.theme = newTheme;
      apply(newTheme);
    }

    /**
     * Apply the theme that was already loaded into State by Bootstrap.loadState().
     * Called once during Bootstrap.init() after the state has been hydrated.
     */
    function init() {
      apply(App.State.theme);
    }

    return {
      apply:  apply,
      toggle: toggle,
      init:   init
    };
  })();

  // ---------------------------------------------------------------------------
  // App.Bootstrap — startup state loading and event wiring  (Tasks 9.1, 16.1)
  // ---------------------------------------------------------------------------
  App.Bootstrap = (function() {

    /**
     * Read all four localStorage keys and hydrate App.State.
     *
     * Load order and error handling per Requirements 5.3, 5.4, 6.6, 10.4–10.6:
     *   evb_transactions       → State.transactions (warn + empty on error)
     *   evb_custom_categories  → State.customCategories + merged into State.categories
     *   evb_spending_limits    → State.spendingLimits (silent default {} on error)
     *   evb_theme              → State.theme (silent default 'light' on error)
     *
     * After all keys are loaded, UI.render(State) is called once.
     */
    function loadState() {
      // --- 1. Transactions ---------------------------------------------------
      var txResult = App.Storage.load(App.Storage.KEYS.TRANSACTIONS);
      if (!txResult.ok) {
        // Parse / unavailable error — init empty and warn the user (Req 5.4)
        App.State.transactions = [];
        if (App.UI && typeof App.UI.showToast === 'function') {
          App.UI.showToast('Warning: saved transaction data could not be loaded.');
        }
      } else if (Array.isArray(txResult.value)) {
        App.State.transactions = txResult.value;
      } else {
        // Key was absent (null) or stored value is not an array — default to []
        App.State.transactions = [];
      }

      // --- 2. Custom categories ----------------------------------------------
      var catResult = App.Storage.load(App.Storage.KEYS.CUSTOM_CATEGORIES);
      if (catResult.ok && Array.isArray(catResult.value) && catResult.value.length > 0) {
        // Re-hydrate customCategories and merge into the full categories list
        App.State.customCategories = catResult.value;

        // Append custom categories that are not already present (case-sensitive
        // comparison is sufficient here; duplicates should not exist in storage)
        for (var i = 0; i < catResult.value.length; i++) {
          var customCat = catResult.value[i];
          if (App.State.categories.indexOf(customCat) === -1) {
            App.State.categories.push(customCat);
          }
        }
      } else {
        // Error or absent/empty — silently default
        App.State.customCategories = [];
      }

      // --- 3. Spending limits ------------------------------------------------
      var limitsResult = App.Storage.load(App.Storage.KEYS.SPENDING_LIMITS);
      if (limitsResult.ok &&
          limitsResult.value !== null &&
          typeof limitsResult.value === 'object' &&
          !Array.isArray(limitsResult.value)) {
        App.State.spendingLimits = limitsResult.value;
      } else {
        // Error or absent — silently default
        App.State.spendingLimits = {};
      }

      // --- 4. Theme ----------------------------------------------------------
      var themeResult = App.Storage.load(App.Storage.KEYS.THEME);
      if (themeResult.ok &&
          (themeResult.value === 'dark' || themeResult.value === 'light')) {
        App.State.theme = themeResult.value;
      } else {
        // Error, absent, or unrecognised value — silently default to light (Req 10.5, 10.6)
        App.State.theme = 'light';
      }

      // --- 5. Apply theme (before render to avoid flicker) ------------------
      if (App.Theme && typeof App.Theme.init === 'function') {
        App.Theme.init();
      }

      // --- 6. Initial render -------------------------------------------------
      App.UI.render(App.State);
    }

    // -------------------------------------------------------------------------
    // Task 16.1: Bootstrap.init() — wire all event listeners via delegation
    // -------------------------------------------------------------------------

    /**
     * Attach all event listeners.  Called once on DOMContentLoaded, after
     * loadState() has hydrated App.State and done the initial render.
     *
     * Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 6.2, 7.1, 7.6, 8.2, 9.5, 10.2
     */
    function init() {

      // -----------------------------------------------------------------------
      // Helper: show/clear inline field errors
      // -----------------------------------------------------------------------
      function showError(id, msg) {
        App.UI.showInlineError(id, msg);
      }
      function clearError(id) {
        App.UI.clearInlineError(id);
      }

      // -----------------------------------------------------------------------
      // 1. Transaction form — submit
      //    Req 1.3, 1.4, 1.5, 1.6
      // -----------------------------------------------------------------------
      var formEl = document.getElementById('transaction-form');
      if (formEl) {
        formEl.addEventListener('submit', function(e) {
          e.preventDefault();

          var nameInput     = document.getElementById('input-name');
          var amountInput   = document.getElementById('input-amount');
          var categoryInput = document.getElementById('input-category');

          var nameVal     = nameInput     ? nameInput.value     : '';
          var amountVal   = amountInput   ? amountInput.value   : '';
          var categoryVal = categoryInput ? categoryInput.value : '';

          // Validate all three fields at once
          var validation = App.Validator.validateTransaction(
            nameVal, amountVal, categoryVal, App.State.categories
          );

          // Clear then conditionally set inline errors
          clearError('error-name');
          clearError('error-amount');
          clearError('error-category');

          if (!validation.valid) {
            if (validation.errors.name)     { showError('error-name',     validation.errors.name); }
            if (validation.errors.amount)   { showError('error-amount',   validation.errors.amount); }
            if (validation.errors.category) { showError('error-category', validation.errors.category); }
            return;
          }

          // Amount is valid — use the parsed float from validateAmount
          var parsedAmount = App.Validator.validateAmount(amountVal).parsed;

          var result = App.Transactions.add(nameVal, parsedAmount, categoryVal);
          if (!result.ok) {
            // Storage failure — show non-blocking toast, do NOT add to list (Req 1.7)
            var reason = result.error === 'quota'
              ? 'Transaction could not be saved: storage quota exceeded.'
              : 'Transaction could not be saved: storage is unavailable.';
            App.UI.showToast(reason);
            return;
          }

          // Success: reset form (Req 1.6)
          if (nameInput)     { nameInput.value = ''; }
          if (amountInput)   { amountInput.value = ''; }
          if (categoryInput) { categoryInput.selectedIndex = 0; }

          // Re-render everything
          App.UI.render(App.State);
        });

        // Clear errors on input (Req 1.4, 1.5) — oninput on each field
        var nameInput2 = document.getElementById('input-name');
        if (nameInput2) {
          nameInput2.addEventListener('input', function() { clearError('error-name'); });
        }
        var amountInput2 = document.getElementById('input-amount');
        if (amountInput2) {
          amountInput2.addEventListener('input', function() { clearError('error-amount'); });
        }
        var categoryInput2 = document.getElementById('input-category');
        if (categoryInput2) {
          categoryInput2.addEventListener('change', function() { clearError('error-category'); });
        }
      }

      // -----------------------------------------------------------------------
      // 2. Add Category button
      //    Req 6.2
      // -----------------------------------------------------------------------
      var addCategoryBtn = document.getElementById('btn-add-category');
      if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', function() {
          var input = document.getElementById('input-custom-category');
          var value = input ? input.value : '';

          clearError('error-custom-category');

          var result = App.Categories.add(value);
          if (!result.ok) {
            showError('error-custom-category', result.error);
            return;
          }

          // Clear the custom category input on success
          if (input) { input.value = ''; }
        });

        // Clear error on input
        var customCatInput = document.getElementById('input-custom-category');
        if (customCatInput) {
          customCatInput.addEventListener('input', function() {
            clearError('error-custom-category');
          });
        }
      }

      // -----------------------------------------------------------------------
      // 3. Transaction list — delete via event delegation
      //    Req 2.5
      // -----------------------------------------------------------------------
      var listEl = document.getElementById('transaction-list');
      if (listEl) {
        listEl.addEventListener('click', function(e) {
          var target = e.target;
          if (target && target.dataset && target.dataset.action === 'delete') {
            var id = target.dataset.id;
            App.Transactions.delete(id);
            App.UI.render(App.State);
          }
        });
      }

      // -----------------------------------------------------------------------
      // 4. Monthly filter — month selector
      //    Req 7.1, 7.2
      // -----------------------------------------------------------------------
      var filterMonthEl = document.getElementById('filter-month');
      if (filterMonthEl) {
        filterMonthEl.addEventListener('change', function() {
          var monthVal = this.value === '' ? null : parseInt(this.value, 10);
          App.State.activeFilter.month = monthVal;
          App.UI.render(App.State);
        });
      }

      // -----------------------------------------------------------------------
      // 5. Monthly filter — year selector
      //    Req 7.1, 7.2
      // -----------------------------------------------------------------------
      var filterYearEl = document.getElementById('filter-year');
      if (filterYearEl) {
        filterYearEl.addEventListener('change', function() {
          var yearVal = this.value === '' ? null : parseInt(this.value, 10);
          App.State.activeFilter.year = yearVal;
          App.UI.render(App.State);
        });
      }

      // -----------------------------------------------------------------------
      // 6. Clear filter button
      //    Req 7.6
      // -----------------------------------------------------------------------
      var clearFilterBtn = document.getElementById('btn-clear-filter');
      if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function() {
          App.State.activeFilter = { month: null, year: null };
          App.UI.render(App.State);
        });
      }

      // -----------------------------------------------------------------------
      // 7. Sort control
      //    Req 8.2
      // -----------------------------------------------------------------------
      var sortSelectEl = document.getElementById('sort-select');
      if (sortSelectEl) {
        sortSelectEl.addEventListener('change', function() {
          App.State.activeSort = this.value;
          App.UI.render(App.State);
        });
      }

      // -----------------------------------------------------------------------
      // 8. Spending limits panel — delegated change listener on .limit-input
      //    Req 9.5
      // -----------------------------------------------------------------------
      var limitsPanel = document.getElementById('limits-panel');
      if (limitsPanel) {
        limitsPanel.addEventListener('change', function(e) {
          var target = e.target;
          if (target && target.classList.contains('limit-input')) {
            var category = target.getAttribute('data-category');
            var rawValue = target.value;

            // Find the sibling error span in the same .limit-row
            var row = target.parentNode;
            var errorSpan = row ? row.querySelector('.limit-error') : null;

            // Clear previous error
            if (errorSpan) {
              errorSpan.textContent = '';
              errorSpan.setAttribute('hidden', '');
            }

            var result = App.Limits.set(category, rawValue);
            if (!result.ok) {
              if (errorSpan) {
                errorSpan.textContent = result.error;
                errorSpan.removeAttribute('hidden');
              }
            }
            // App.Limits.set() calls UI.render() internally on success
          }
        });

        // Also clear limit error on input (before change fires)
        limitsPanel.addEventListener('input', function(e) {
          var target = e.target;
          if (target && target.classList.contains('limit-input')) {
            var row = target.parentNode;
            var errorSpan = row ? row.querySelector('.limit-error') : null;
            if (errorSpan) {
              errorSpan.textContent = '';
              errorSpan.setAttribute('hidden', '');
            }
          }
        });
      }

      // -----------------------------------------------------------------------
      // 9. Theme toggle button
      //    Req 10.2
      // -----------------------------------------------------------------------
      var themeToggleBtn = document.getElementById('theme-toggle');
      if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', function() {
          App.Theme.toggle();
        });
      }

      // -----------------------------------------------------------------------
      // 10. Initialise Chart.js instance now that the DOM is ready
      // -----------------------------------------------------------------------
      if (App.Chart && typeof App.Chart.init === 'function') {
        App.Chart.init();
      }

      // Trigger a full re-render so the chart shows persisted data
      App.UI.render(App.State);
    }

    return {
      loadState: loadState,
      init:      init
    };
  })();

  // ---------------------------------------------------------------------------
  // DOMContentLoaded — kick off the application
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function() {
    App.Bootstrap.loadState();
    App.Bootstrap.init();
  });

  global.App = App;
})(window);
