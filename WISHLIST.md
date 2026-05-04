# Project Wishlist

Last updated: 2026-05-04

## Backlog

1. Fix profile page notes field reliability on first load
   - Problem: On profile pages, the note field fails to load on the first page load about 80% of the time.
   - Current workaround: Manually refresh the page before making a note.
   - Goal: Ensure note UI and data binding initialize reliably on the first load without requiring refresh.
   - Investigation ideas:
     - Verify timing/race conditions between DOM readiness and script initialization.
     - Add resilient retry/observer logic for late-rendered profile sections.
     - Ensure event listeners and storage fetch run once and re-run safely if target nodes mount late.
     - Add diagnostics/logging to capture why initialization is missed.

2. Allow notes on Company pages, with similar functionality to profiles.

3. Add per-profile "Connected on" field
   - Goal: Store a "Connected on" date for each profile.
   - UI: Display this date beneath each tooltip preview note text.
   - Style: Font size should be roughly 50% of the note text size in the tooltip.

4. Auto-populate "Connected on" date when creating a note (if available)
   - Goal: When possible, pull the "Connected on" date automatically during note creation.
   - Source hint: Date is typically visible in a profile's Contact info panel.
   - Behavior: If the date cannot be found, save the note normally and leave "Connected on" empty.
