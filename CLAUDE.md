# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

YouTubeBuddy is a Chrome (Manifest V3) browser extension written in vanilla JS. It automates repetitive multi-click workflows in YouTube Studio — starting with adding subtitle/caption language tracks to videos in a single click.

## Loading the extension locally

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this directory
4. Navigate to `https://studio.youtube.com` to use it

After any code change, click the reload icon on the extension card in `chrome://extensions/`.

## Project layout

```
manifest.json          — Extension manifest (MV3)
popup/
  popup.html           — Extension popup UI
  popup.css            — Popup styles
  popup.js             — Popup logic: tab nav, language selection, messaging
content/
  content.js           — Injected into studio.youtube.com; runs automations
background/
  background.js        — Service worker (lifecycle only for now)
icons/                 — PNG icons: 16, 32, 48, 128px (must be added manually)
```

## Architecture

Communication flow:

```
popup.js  →  chrome.tabs.sendMessage  →  content.js  →  DOM automation
```

- **popup.js** handles all UI state. When the user clicks "Add Language", it sends a `ADD_SUBTITLE_LANGUAGE` message to the active tab's content script.
- **content.js** receives the message, runs the DOM automation steps, and resolves with `{ success: boolean, message: string }`.
- **background.js** is minimal — only handles install events. It is a service worker (MV3 requirement).
- Settings (default language, confirm preference) are persisted via `chrome.storage.sync`.

## Adding automation steps

All automation logic lives in `content/content.js` inside `handleAddSubtitleLanguage()`. Two utilities are already available:

- `waitForElement(selector, timeoutMs)` — returns a Promise that resolves when a DOM element matching `selector` appears.
- `sleep(ms)` — simple Promise-based delay.

Steps should be sequential `await` calls. Always return `{ success: true/false, message: string }`.

## Chrome Web Store compliance notes

- Manifest V3 is required for new submissions.
- `host_permissions` is scoped to `https://studio.youtube.com/*` only — do not broaden it.
- `activeTab` + `scripting` + `storage` are the only permissions; keep them minimal.
- The extension does not make external network requests — all automation is local DOM interaction.
