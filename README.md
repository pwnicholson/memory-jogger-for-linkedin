# Memory Jogger for LinkedIn

A minimal Chrome Extension (Manifest V3) that adds a private **"How I know them"** note panel to LinkedIn profile pages.

Current release: **v0.3.2**

## What it does

- Shows a small note panel on `linkedin.com/in/*` profile pages.
- Supports company pages at `linkedin.com/company/*` in the dashboard and inline indicators.
- Saves one note per profile.
- Stores notes in your browser sync storage (`chrome.storage.sync`).
- Supports optional "Connected on" metadata for people profiles (not shown for company pages).

## Run locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `memory-jogger-for-linkedin`.
5. Open any LinkedIn profile (`https://www.linkedin.com/in/...`) to use it.

(extension is also available on the Chrome Web Store https://chromewebstore.google.com/search/memory%20jogger%20for%20linkedin)

## Privacy model (current MVP)

- No backend/server.
- No analytics.
- No data sent off-device by this extension.

## Project files

- `manifest.json` – extension configuration
- `content-script.v20260504.js` – active content script referenced by manifest (with `content-script.js` kept as a mirrored source copy)
- `styles.css` – panel styles
- `popup.html` – simple extension popup

## Changelog

- See `CHANGELOG.md` for release history and v0.3.2 notes.
