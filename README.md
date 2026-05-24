# YouTubeBuddy

A Chrome extension that automates repetitive subtitle workflows in YouTube Studio — add a language track to one video or your entire channel in a single click.

---

## Features

- **Single video** — add a subtitle language to the currently open video in one click
- **Bulk mode** — process every video (or Shorts / Live) on your channel automatically
- **Smart skip cache** — already-processed videos are remembered and skipped on re-runs
- **Two UI methods** — supports both the classic Subtitles tab and the newer Languages tab in YouTube Studio
- **Long video mode** — extended timeouts for videos with large subtitle tracks (30+ minutes)
- **Adjustable delay** — configurable pause between bulk videos (30–60 s) to be gentle on YouTube's servers
- **Run history** — log of every single and bulk run with per-video results

## Screenshots

> *(coming soon)*

## Installation

### Chrome Web Store *(coming soon)*

Click **Add to Chrome** on the store listing.

### Developer mode (manual install)

1. Clone or download this repository
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the repository folder
5. Navigate to `https://studio.youtube.com` to use it

## Usage

1. Open a video in YouTube Studio (or navigate to your channel's Videos / Shorts / Live tab for bulk mode)
2. Click the YouTubeBuddy icon in your toolbar
3. Select the **target language** from the dropdown
4. Choose **Current video** or **All videos in channel**
5. Click **Add Language**

### First-time setup

Before running, go to the **Settings** tab and set:

- **Default Add Language** — pre-selects your most-used language
- **Channel Language** — the primary language of your channel (used as the subtitle source)

## How it works

YouTubeBuddy automates the multi-click workflow inside YouTube Studio entirely through DOM interaction — no external API calls, no data leaves your browser. It navigates to each video, opens the subtitle editor, selects the target language via Auto-translate, and publishes.

All settings and history are stored locally in your browser via `chrome.storage`.

## Requirements

- Google Chrome (or any Chromium-based browser)
- A YouTube Studio account
- Channel audience set to **"Not made for kids"** at the channel level (the per-video setting hides the Subtitles panel) — or enable the **"Set 'Not made for kids' automatically"** option in Settings

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss significant changes.

## Support

If this tool saves you time, consider supporting its development:

[☕ Buy me a coffee via PayPal](https://paypal.me/ahfpca/)

## License

MIT
