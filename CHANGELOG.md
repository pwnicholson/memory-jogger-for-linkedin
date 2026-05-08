# Changelog

All notable changes to this project are documented in this file.

## 0.32 - 2026-05-07

- Added compact sync storage format (`mjli:bucket:v2:*`) to reduce top-level item usage and avoid `chrome.storage.sync.MAX_ITEMS` limits.
- Added automatic legacy migration from `note:/...` and `meta:/...` keys to compact bucketed records.
- Improved startup storage routing logic with persisted sync/local preference and quota-aware fallback behavior.
- Added clearer diagnostics for sync quota/item-limit status and active storage mode.
- Added update visibility in popup (version, sync format, storage mode) so users can confirm migration state without opening the dashboard.
- Added update/install migration guidance flow, including auto-open dashboard logic when outdated sync data is detected.

## 0.3 - 2026-05-04

- Added support for company pages (`/company/...`) alongside profile pages (`/in/...`).
- Added dashboard tabbing to switch between People and Companies.
- Improved metadata handling for names and connected dates across save/export/import flows.
- Added "Connected on" support for people profiles with date-picker editing.
- Added date format preference options in the dashboard for connected date display.
- Hid/disabled connected date display and editing for company pages.
- Per release decision, deferred automatic Contact Info scraping for connected date population.

## 0.2.2

- Stabilization and reliability improvements for panel mounting on LinkedIn page loads.
- Diagnostics and troubleshooting improvements for extension behavior and storage visibility.
