# Requirements Document

## Introduction

The Expense & Budget Visualizer is a client-side web application built with HTML, CSS, and Vanilla JavaScript. It enables users to track personal expenses by adding transactions with a name, amount, and category. The application displays a live-updating total balance, a scrollable transaction list with delete support, and a pie chart visualizing spending by category. All data persists via the browser's Local Storage API. The application also supports custom categories, monthly summaries, transaction sorting, a spending limit highlight system, and a dark/light mode toggle.

---

## Glossary

- **App**: The Expense & Budget Visualizer web application.
- **Transaction**: A single expense record consisting of an item name, a monetary amount, and a category.
- **Category**: A label grouping transactions (e.g., Food, Transport, Fun, or a user-defined custom category).
- **Balance**: The computed sum of all transaction amounts stored in the App.
- **Transaction_List**: The scrollable UI component that displays all stored transactions.
- **Input_Form**: The UI form component used to submit new transactions.
- **Chart**: The pie chart UI component that visualizes spending distribution by category.
- **Local_Storage**: The browser's Local Storage API used for client-side data persistence.
- **Monthly_Summary**: A filtered view showing only transactions belonging to a selected month and year.
- **Spending_Limit**: A user-defined monetary threshold per category above which spending is highlighted.
- **Theme_Toggle**: The UI control that switches the App between dark and light visual modes.
- **Validator**: The input validation logic within the Input_Form.

---

## Requirements

### Requirement 1: Transaction Input Form

**User Story:** As a user, I want to submit a new transaction with a name, amount, and category, so that I can record my expenses quickly.

#### Acceptance Criteria

1. THE Input_Form SHALL provide a text field for the item name accepting up to 100 characters, a numeric field for the amount, and a category selector.
2. THE Input_Form SHALL pre-populate the category selector with the options: Food, Transport, and Fun.
3. WHEN the user submits the Input_Form with all fields filled and a valid positive numeric amount between 0.01 and 999999999.99, THE App SHALL add the transaction to the Transaction_List and persist it to Local_Storage within 1 second.
4. WHEN the user submits the Input_Form with one or more empty fields, THE Validator SHALL display an inline error message adjacent to each empty field indicating which fields are required, and SHALL NOT submit the transaction.
5. WHEN the user submits the Input_Form with a non-positive or non-numeric amount, THE Validator SHALL display an inline error message adjacent to the amount field indicating the amount must be a positive number, and SHALL NOT submit the transaction.
6. WHEN a transaction is successfully added, THE Input_Form SHALL reset the item name field to empty, the amount field to empty, and the category selector to its first default option.
7. IF Local_Storage is unavailable when the user submits the Input_Form, THEN THE App SHALL display an error message indicating the transaction could not be saved and SHALL NOT add the transaction to the Transaction_List.

---

### Requirement 2: Transaction List

**User Story:** As a user, I want to see all my recorded transactions in a scrollable list, so that I can review my spending history.

#### Acceptance Criteria

1. THE Transaction_List SHALL display every stored transaction, each showing the item name, the amount formatted as a non-negative number with exactly two decimal places, and the category.
2. WHILE the number of transactions exceeds the visible area of the Transaction_List, THE Transaction_List SHALL remain scrollable to reveal all entries.
3. WHEN a transaction is added or deleted, THE Transaction_List SHALL update its displayed entries within 1 second without requiring a page reload.
4. THE Transaction_List SHALL provide a delete control for each transaction entry.
5. WHEN the user activates the delete control for a transaction, THE App SHALL immediately remove that transaction from the Transaction_List and from Local_Storage without requiring confirmation.
6. WHEN the Transaction_List contains no stored transactions, THE Transaction_List SHALL display a message indicating that no transactions have been recorded.

---

### Requirement 3: Total Balance Display

**User Story:** As a user, I want to see my total balance prominently at the top of the page, so that I know my overall spending at a glance.

#### Acceptance Criteria

1. THE App SHALL display the Balance as the cumulative sum of all transaction amounts at the top of the page, formatted with exactly two decimal places and a currency symbol (e.g., $0.00).
2. WHEN a transaction is added, THE App SHALL recalculate and display the updated Balance within 1 second.
3. WHEN a transaction is deleted, THE App SHALL recalculate and display the updated Balance within 1 second.
4. WHEN no transactions exist, THE App SHALL display a Balance of $0.00.

---

### Requirement 4: Pie Chart Visualization

**User Story:** As a user, I want to see a pie chart of my spending by category, so that I can understand where my money is going.

#### Acceptance Criteria

1. THE Chart SHALL render a pie chart that segments spending by category, where each segment's proportional size equals that category's total amount divided by the sum of all category totals, and each segment SHALL display its category name and percentage rounded to one decimal place.
2. WHEN a transaction is added or deleted, THE Chart SHALL update its segments to reflect the current category totals within 500 milliseconds without requiring a page reload.
3. WHEN a category has a total amount of zero, THE Chart SHALL omit that category's segment from the display.
4. WHEN the App contains no transactions or all category totals are zero, THE Chart SHALL display an empty state message indicating no spending data is available.
5. THE Chart SHALL render using Chart.js or a comparable client-side chart library and SHALL display between 1 and 20 segments inclusive.

---

### Requirement 5: Data Persistence

**User Story:** As a user, I want my transactions to be saved between browser sessions, so that I do not lose my data when I close the tab.

#### Acceptance Criteria

1. WHEN a transaction is added, THE App SHALL write the updated transaction list to Local_Storage, replacing any previously stored value under the same storage key.
2. WHEN a transaction is deleted, THE App SHALL write the updated transaction list to Local_Storage, replacing any previously stored value under the same storage key.
3. WHEN the App loads in the browser, THE App SHALL read all previously stored transactions from Local_Storage and render them in the Transaction_List within 500 milliseconds of the page load event.
4. IF Local_Storage is unavailable or returns a parse error, THEN THE App SHALL initialize with an empty transaction list and display a non-blocking warning message to the user indicating that saved data could not be loaded.
5. IF the serialized transaction list exceeds Local_Storage quota, THEN THE App SHALL reject the write operation, retain the previous Local_Storage contents unchanged, and display a non-blocking error message to the user indicating that the transaction could not be saved.

---

### Requirement 6: Custom Categories

**User Story:** As a user, I want to add my own expense categories beyond the defaults, so that I can track spending in areas specific to my life.

#### Acceptance Criteria

1. THE Input_Form SHALL provide a text input for the user to enter a new custom category name, accepting between 1 and 50 characters.
2. WHEN the user submits a custom category name between 1 and 50 characters that does not match any existing category name (case-insensitive), THE App SHALL add that category to the category selector and persist the custom category list to Local_Storage.
3. IF the user submits an empty custom category name, THEN THE Validator SHALL display an inline error message indicating the category name cannot be empty and SHALL NOT add the category.
4. IF the user submits a custom category name that matches an existing category name (case-insensitive), THEN THE Validator SHALL display an inline error message indicating the category already exists and SHALL NOT add the category.
5. IF the user submits a custom category name exceeding 50 characters, THEN THE Validator SHALL display an inline error message indicating the name is too long and SHALL NOT add the category.
6. WHEN the App loads, THE App SHALL restore all previously saved custom categories into the category selector from Local_Storage before the user can interact with the category selector.

---

### Requirement 7: Monthly Summary View

**User Story:** As a user, I want to filter my transactions by month and year, so that I can review my spending for a specific time period.

#### Acceptance Criteria

1. THE App SHALL provide a month and year selector that filters the Transaction_List and Chart to show only transactions recorded in the selected month and year, where the selectable year range spans from the year of the oldest recorded transaction up to the current year.
2. WHEN the user selects a month and year, THE Transaction_List SHALL display only transactions whose recorded date falls within that month and year, sorted by date in descending order.
3. WHEN the user selects a month and year and no transactions exist for that period, THE Transaction_List SHALL display an empty state message indicating no transactions were found for the selected period.
4. WHEN the user selects a month and year, THE Chart SHALL update to reflect only the spending distribution of transactions in that month and year.
5. WHEN the user selects a month and year and no transactions exist for that period, THE Chart SHALL display an empty state indicating no data is available for the selected period.
6. WHEN the user clears the monthly filter, THE Transaction_List and THE Chart SHALL revert to displaying all transactions across all recorded months and years.
7. WHEN a transaction is added, THE App SHALL record the device's current local date and time as the transaction's timestamp, accurate to the nearest second, for use in monthly filtering.

---

### Requirement 8: Transaction Sorting

**User Story:** As a user, I want to sort my transaction list by amount or category, so that I can find and compare entries easily.

#### Acceptance Criteria

1. THE Transaction_List SHALL provide a sort control with the options: sort by amount ascending, sort by amount descending, and sort by category alphabetically (A–Z).
2. WHEN the user selects a sort option, THE Transaction_List SHALL reorder its displayed entries according to the selected sort criterion within 300 milliseconds.
3. WHEN transactions are added or deleted while a sort option is active, THE Transaction_List SHALL maintain the active sort order in the updated display within 300 milliseconds of the change.
4. IF two or more transactions share the same amount or the same category name, THEN THE Transaction_List SHALL apply the transaction date (most recent first) as a tiebreaker to determine their relative order.
5. IF the Transaction_List contains no transactions when a sort option is selected, THEN THE Transaction_List SHALL display an empty list without an error.

---

### Requirement 9: Spending Limit Highlight

**User Story:** As a user, I want to set a spending limit per category and see a visual warning when I exceed it, so that I can stay within my budget.

#### Acceptance Criteria

1. THE App SHALL provide an input field per category that accepts a numeric spending limit value between 0.01 and 999,999,999.99.
2. WHEN the total amount of transactions in a category equals or exceeds the spending limit for that category, THE App SHALL apply a distinct visual highlight style to all transactions in that category within the Transaction_List, differing from the default unhighlighted style.
3. WHEN the total amount of transactions in a category equals or exceeds the spending limit for that category, THE App SHALL apply a distinct visual highlight style to the corresponding segment in the Chart, differing from the default unhighlighted style.
4. WHEN a transaction is added or deleted and the category total changes relative to the spending limit, THE App SHALL update the highlight state of the affected Transaction_List rows and Chart segment within 1 second without requiring a page reload.
5. IF the user submits a spending limit value that is non-positive, non-numeric, or empty, THEN THE Validator SHALL display an inline error message indicating the limit must be a positive number and SHALL NOT apply the limit, preserving the previously saved limit if one exists.

---

### Requirement 10: Dark/Light Mode Toggle

**User Story:** As a user, I want to switch between dark and light display modes, so that I can use the application comfortably in different lighting conditions.

#### Acceptance Criteria

1. THE App SHALL display a Theme_Toggle control that switches between dark mode and light mode and visually indicates the currently active theme.
2. WHEN the user activates the Theme_Toggle, THE App SHALL apply the corresponding color scheme to all visible UI components within 100 milliseconds, where dark mode uses a dark background with light text and light mode uses a light background with dark text.
3. WHEN the user activates the Theme_Toggle, THE App SHALL persist the selected theme preference to Local_Storage.
4. WHEN the App loads, THE App SHALL read the stored theme preference from Local_Storage and apply it such that no visible theme flash occurs before the first paint.
5. IF no theme preference is stored, THEN THE App SHALL default to light mode on load.
6. IF Local_Storage is unavailable when reading the theme preference, THEN THE App SHALL default to light mode without displaying an error.

---

### Requirement 11: Technology and Structure Constraints

**User Story:** As a developer, I want the application to be built with a constrained, simple stack, so that the project is easy to understand, maintain, and run without setup.

#### Acceptance Criteria

1. THE App SHALL be implemented using only HTML, CSS, and Vanilla JavaScript; no third-party JavaScript libraries, frameworks, or runtime dependencies of any kind are permitted except for Chart.js (or a comparable client-side chart library) for the pie chart.
2. THE App SHALL require no backend server and SHALL be fully functional when opened as a local file (file://) in a browser without loading any resources from external CDNs or remote servers.
3. THE App SHALL include exactly one CSS file located in the `css/` directory.
4. THE App SHALL include exactly one JavaScript file located in the `js/` directory.
5. THE App SHALL function correctly in the latest stable release of Chrome, Firefox, Edge, and Safari at the time of testing, meaning all features render and operate without JavaScript errors or broken UI.

---

### Requirement 12: Performance and Usability

**User Story:** As a user, I want the application to respond instantly to my interactions, so that my workflow is not interrupted.

#### Acceptance Criteria

1. WHEN the user adds or deletes a transaction, THE App SHALL update the Balance, Transaction_List, and Chart within 100 milliseconds on a modern desktop browser.
2. THE App SHALL display body text at a minimum of 14px and label text at a minimum of 12px, with a minimum 4px size difference between heading levels, in both dark and light modes.
3. WHEN the App loads for the first time with no stored data, THE App SHALL reach an interactive state within 2 seconds on a modern desktop browser with a local file load.
4. IF the Balance, Transaction_List, or Chart fails to update within 100 milliseconds after a transaction change, THEN THE App SHALL display the last known valid values for each component, retain all transaction data in Local_Storage unchanged, and SHALL NOT display a partial or inconsistent state.
