'use strict';

// Guard against double-injection (e.g. when popup injects the script into an
// already-open tab that also matched the manifest content_scripts rule).
if (!window.__youtubeBuddyLoaded) {
  window.__youtubeBuddyLoaded = true;
  init();
}

function init() {

const log = (...args) => console.log('[YouTubeBuddy]', ...args);

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ADD_SUBTITLE_LANGUAGE') {
    handleAddSubtitleLanguage(message.payload)
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ success: false, message: err.message }));
    return true; // keep channel open for async response
  }
  if (message.action === 'GET_ALL_VIDEOS') {
    getAllVideos()
      .then(result => sendResponse(result))
      .catch(err  => sendResponse({ success: false, message: err.message }));
    return true;
  }
})

// ── Main dispatch ─────────────────────────────────────────────────────────────
async function handleAddSubtitleLanguage({ langCode, langLabel, silent = false }) {
  return handleCurrentVideo(langCode, langLabel, silent);
}

// ── Current video workflow ────────────────────────────────────────────────────
async function handleCurrentVideo(langCode, langLabel, silent = false) {
  // Guard only applies for manual single-video use (not when called silently by background).
  if (!silent && /studio\.youtube\.com\/channel\/[^/]+(?:\/videos|\/shorts|$|\?)/.test(location.href)) {
    return {
      success: false,
      message: "You're on the Channel content page. Please click on a video title to open it, then try again.",
    };
  }

  // Read channel language from settings (defaults to Persian for backward compat).
  const { channelLanguageLabel } = await chrome.storage.sync.get({ channelLanguageLabel: 'Persian' });
  const channelLangLabel = channelLanguageLabel || 'Persian';

  try {
    log('Step 1 — Audience');
    await stepAudience();

    log('Step 2 — Navigate to Subtitles');
    await stepGoToSubtitles();

    // Skip check — if the target language already has subtitles, do nothing.
    if (hasLanguageAlready(langLabel)) {
      log(`"${langLabel}" already present — skipping`);
      return { success: true, skipped: true, message: `"${langLabel}" already present — skipped.` };
    }

    log('Step 3 — Set channel language (if prompted)');
    await stepMaybeSetChannelLanguage(channelLangLabel);

    log(`Step 4 — Duplicate ${channelLangLabel} auto-captions and publish`);
    await stepDuplicateChannelLangAndPublish(channelLangLabel);

    log(`Step 5 — Add "${langLabel}" via Auto-Translate`);
    const addResult = await stepAddTargetLanguage(langCode, langLabel, channelLangLabel);
    if (addResult?.retryNeeded) {
      return { success: false, retryNeeded: true, message: 'Auto-translate not ready — retrying.' };
    }

    if (!silent) {
      log('Step 6 — Show success');
      await stepShowSuccessAndLeave(langLabel);
    }

    return { success: true, message: `"${langLabel}" subtitle added successfully.` };
  } catch (err) {
    log('Automation failed:', err.message);
    return { success: false, message: err.message };
  }
}

// ── Step 1: Audience ──────────────────────────────────────────────────────────
async function stepAudience() {
  // Ensure we're on the Details tab
  const detailsLink = findAnchorByText('Details');
  if (detailsLink) {
    detailsLink.click();
    await sleep(1200);
  }

  // Find "No, it's not made for kids" radio button
  const radio = await waitFor(
    () => Array.from(document.querySelectorAll('tp-yt-paper-radio-button'))
              .find(r => /not made for kids/i.test(r.textContent)),
    15000,
    'audience "Not made for kids" radio button'
  );

  if (radio.getAttribute('aria-checked') !== 'true') {
    radio.click();
    await sleep(400);
  }

  // Click Save
  const saveBtn = await waitFor(
    () => Array.from(document.querySelectorAll('ytcp-button, button'))
              .find(b => /^save$/i.test(b.textContent.trim()) && isVisible(b) && !b.disabled),
    8000,
    'Save button'
  );
  saveBtn.click();
  log('Save clicked');
  await sleep(1500); // wait for save to complete
}

// ── Step 2: Go to Subtitles tab ───────────────────────────────────────────────
async function stepGoToSubtitles() {
  const link = await waitFor(
    () => findAnchorByText('Subtitles'),
    10000,
    '"Subtitles" nav link'
  );
  link.click();
  await sleep(500);

  // Accept either the subtitle list ("Add language" button) OR the
  // "Video subtitles / Set language" prompt — step 3 handles the latter.
  await waitFor(
    () => {
      const addLang = Array.from(document.querySelectorAll('ytcp-button, button'))
        .find(b => /add language/i.test(b.textContent) && isVisible(b));
      const setLang = document.querySelector('ytcp-form-language-input');
      return addLang ?? setLang ?? null;
    },
    15000,
    '"Add language" button or "Set language" prompt'
  );
}

// ── Step 3: Set channel language on "Video subtitles" page (if prompted) ─────
async function stepMaybeSetChannelLanguage(channelLangLabel) {
  // The "Video subtitles" page shows a language picker inside ytcp-form-language-input.
  // Structure: ytcp-form-language-input > ytcp-form-select > ytcp-select >
  //            ytcp-text-dropdown-trigger#trigger > ytcp-dropdown-trigger >
  //            div.container[role="button"]  ← actual click target
  const formLanguageInput = await waitFor(
    () => document.querySelector('ytcp-form-language-input'),
    5000,
    '"Set language" form (ytcp-form-language-input)'
  ).catch(() => null);

  if (!formLanguageInput) {
    log('No "Set language" prompt — skipping');
    return;
  }

  // The real click target is ytcp-dropdown-trigger[role="button"].
  // Polymer components ignore .click() — dispatch full mouse event sequence instead.
  const trigger = formLanguageInput.querySelector('ytcp-dropdown-trigger[role="button"]');
  if (!trigger) {
    throw new Error('Could not find ytcp-dropdown-trigger inside ytcp-form-language-input');
  }
  dispatchRealClick(trigger);
  await sleep(700);

  // Select the channel language from the opened list.
  const option = await waitFor(
    () => Array.from(document.querySelectorAll(
            'tp-yt-paper-item, ytcp-ve[role="option"], li[role="option"]'))
          .find(i => i.textContent.trim() === channelLangLabel && isVisible(i)),
    5000,
    `"${channelLangLabel}" option in Set language dropdown`
  );
  option.click();
  await sleep(400);

  // Check "Make this the default for my channel" if unchecked.
  // The checkbox div has aria-label matching the text.
  const chk = document.querySelector(
    'ytcp-form-checkbox ytcp-checkbox-lit #checkbox[role="checkbox"]'
  );
  if (chk && chk.getAttribute('aria-checked') !== 'true') {
    chk.click();
    await sleep(300);
  }

  // Click the Confirm button. It becomes enabled once a language is selected.
  // The real clickable element is the <button> inside ytcp-button-shape.
  const confirmBtn = await waitFor(
    () => {
      const outer = document.querySelector('ytcp-button#confirm-button');
      if (!outer || outer.getAttribute('aria-disabled') === 'true') return null;
      // Prefer the inner native <button> which is what the browser actually fires events on.
      return outer.querySelector('button:not([disabled])') ?? outer;
    },
    5000,
    'enabled Confirm button'
  );
  confirmBtn.click();
  await sleep(2000);
}

// ── Step 4: Duplicate channel-language auto-captions and publish ──────────────
async function stepDuplicateChannelLangAndPublish(channelLangLabel) {
  const escapedLabel = channelLangLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labelRegex = new RegExp(`^${escapedLabel}`, 'i');

  // Wait for the channel-language row that shows "Ineligible" (auto-captions row).
  await waitFor(
    () => Array.from(document.querySelectorAll(
            'tr, ytcp-subtitle-row, [class*="subtitle-row"], [class*="caption-row"]'))
          .find(r => labelRegex.test(r.textContent.trim()) && /ineligible/i.test(r.textContent) && isVisible(r)),
    15000,
    `${channelLangLabel} subtitle row with "Ineligible"`
  );

  const rows = Array.from(document.querySelectorAll(
    'tr, ytcp-subtitle-row, [class*="subtitle-row"], [class*="caption-row"]'
  )).filter(r => labelRegex.test(r.textContent.trim()) && /ineligible/i.test(r.textContent) && isVisible(r));

  let dupBtn = null;
  for (const row of rows) {
    log(`Trying ${channelLangLabel} row:`, row.textContent.trim().slice(0, 60));
    dupBtn = await hoverForDupEditBtn(row);
    if (dupBtn) break;
  }

  if (!dupBtn) {
    throw new Error(
      `Could not find the "Duplicate and edit" button on any ${channelLangLabel} subtitle row. ` +
      `Make sure the video has ${channelLangLabel} automatic captions.`
    );
  }

  dupBtn.click();
  log('Clicked "Duplicate and edit"');
  await sleep(1500);

  // Dismiss "Overwrite track" confirmation if it appears
  await maybeContinueOverwrite();

  // Wait for the subtitle editor to open, then give YouTube Studio 2 s to
  // finish preparing the subtitle data before we click Publish.
  await waitForEditorOpen();
  await sleep(1000);

  // Publish
  await clickPublish();
  log(`${channelLangLabel} captions published`);

  // Wait to return to the subtitle list
  await waitForSubtitleList();
}

// ── Step 5: Add target language via Auto-Translate ────────────────────────────
async function stepAddTargetLanguage(langCode, langLabel, channelLangLabel) {
  // Click "Add language"
  const addLangBtn = await waitFor(
    () => Array.from(document.querySelectorAll('ytcp-button, button'))
              .find(b => /add language/i.test(b.textContent) && isVisible(b)),
    10000,
    '"Add language" button'
  );
  addLangBtn.click();
  await sleep(700);

  // Select the target language from the dropdown — this adds a new row to the
  // subtitle list (it does NOT navigate to the editor directly).
  const langOption = await waitFor(
    () => Array.from(document.querySelectorAll(
            'tp-yt-paper-item, ytcp-ve[role="option"], li[role="option"], li'))
          .find(i => i.textContent.trim() === langLabel && isVisible(i)),
    5000,
    `"${langLabel}" option in language list`
  );
  langOption.click();
  log('Selected language', langLabel, '— waiting for subtitle row to appear');
  await sleep(800);

  // Wait for the new language row to appear in the subtitle list.
  const langRow = await waitFor(
    () => Array.from(document.querySelectorAll(
            'tr, ytcp-subtitle-row, [class*="subtitle-row"], [class*="caption-row"]'))
          .find(r => r.textContent.includes(langLabel) && isVisible(r)),
    8000,
    `"${langLabel}" subtitle row`
  );

  // The "Add" button in the Subtitles column only appears on hover.
  // hoverForAddBtn fires hover events at the Subtitles column coordinates and
  // waits for any small action button to appear within the row's bounds.
  log('Hovering subtitle row to reveal Add button');
  const addBtn = await hoverForAddBtn(langRow);
  if (!addBtn) {
    throw new Error(`Could not find the "Add" button for the "${langLabel}" subtitle row`);
  }
  addBtn.click();
  log('Clicked Add button — waiting for subtitle editor to open');
  await sleep(1500);

  // Handle the title/description translation dialog that appears before the
  // subtitle editor (YouTube Studio asks for a translated title/description).
  await maybeHandleTitleDescriptionDialog();

  // Wait up to 10 s for Auto-translate to become enabled.
  // If still disabled, signal the caller to re-navigate and retry from outside
  // the page — this avoids the browser's beforeunload dialog entirely, since
  // chrome.tabs.update (called by background.js) bypasses it.
  const autoTranslate = await waitForAutoTranslateEnabled(10000);
  if (!autoTranslate) {
    return { retryNeeded: true };
  }

  log('Auto-Translate button is enabled — clicking');
  dispatchRealClick(autoTranslate);

  // Handle optional "translate from" language dialog
  await maybeSelectTranslateFromChannelLang(channelLangLabel);

  // Wait for the Publish button to appear (it becomes visible/enabled once the
  // translation has loaded) then click it.  Use a long timeout because the
  // translation can take a while to load.
  await clickPublish(60000);
  log(`"${langLabel}" subtitles published`);

  await waitForSubtitleList();
}

/** Polls for up to `timeoutMs` for button#choose-auto-translate to be enabled. Returns the button or null. */
function waitForAutoTranslateEnabled(timeoutMs) {
  return new Promise(resolve => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const btn = document.querySelector('button#choose-auto-translate');
      if (btn && isVisible(btn) && !btn.disabled && !btn.hasAttribute('disabled')) {
        resolve(btn);
        return;
      }
      if (Date.now() >= deadline) { resolve(null); return; }
      setTimeout(check, 300);
    };
    check();
  });
}


// ── Success overlay ───────────────────────────────────────────────────────────
async function stepShowSuccessAndLeave(langLabel) {
  await new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,.55)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:2147483647', 'font-family:Roboto,Arial,sans-serif',
    ].join(';');
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:8px;padding:32px 40px;
                  text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.25);
                  min-width:280px;max-width:400px;">
        <div style="font-size:38px;margin-bottom:12px;">✅</div>
        <p style="margin:0 0 20px;font-size:16px;color:#0f0f0f;font-weight:500;">
          ${escapeHtml(langLabel)} subtitle added successfully
        </p>
        <button id="ytb-ok"
          style="background:#065fd4;color:#fff;border:none;border-radius:4px;
                 padding:10px 32px;font-size:14px;font-weight:500;cursor:pointer;">
          OK
        </button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#ytb-ok').addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
  });

  // Navigate to Channel content
  const channelLink = Array.from(document.querySelectorAll('a'))
    .find(a => /channel content/i.test(a.textContent) && isVisible(a));
  if (channelLink) {
    channelLink.click();
  } else {
    const m = location.href.match(/\/channel\/([^/]+)\//);
    if (m) location.href = `https://studio.youtube.com/channel/${m[1]}/videos`;
  }
}

// ── Sub-helpers ───────────────────────────────────────────────────────────────

async function maybeContinueOverwrite() {
  const continueBtn = await waitFor(
    () => {
      const dialog = Array.from(document.querySelectorAll(
        'tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]'
      )).find(d => /overwrite/i.test(d.textContent) && isVisible(d));
      if (!dialog) return null;
      return Array.from(dialog.querySelectorAll('ytcp-button, button'))
        .find(b => /continue/i.test(b.textContent) && isVisible(b));
    },
    3000,
    '"Continue" button in Overwrite track dialog'
  ).catch(() => null);

  if (continueBtn) {
    continueBtn.click();
    log('Dismissed "Overwrite track" dialog');
    await sleep(1000);
  }
}

async function waitForEditorOpen() {
  // The subtitle editor is open when a Publish button is visible
  await waitFor(
    () => Array.from(document.querySelectorAll('ytcp-button, button'))
              .find(b => /^publish$/i.test(b.textContent.trim()) && isVisible(b) && !b.disabled),
    15000,
    'subtitle editor Publish button'
  );
  await sleep(500);
}

async function clickPublish(timeoutMs = 15000) {
  const publishBtn = await waitFor(
    () => Array.from(document.querySelectorAll('ytcp-button, button'))
              .find(b => /^publish$/i.test(b.textContent.trim()) && isVisible(b) && !b.disabled),
    timeoutMs,
    'Publish button'
  );
  publishBtn.click();
  await sleep(900);

  // Handle "Publish subtitles?" confirmation dialog if it appears
  try {
    const confirmBtn = await waitFor(
      () => {
        const dialog = document.querySelector(
          'tp-yt-paper-dialog:not([aria-hidden="true"]), ytcp-dialog:not([aria-hidden="true"]), [role="dialog"]'
        );
        if (!dialog) return null;
        return Array.from(dialog.querySelectorAll('ytcp-button, button'))
          .find(b => /^publish$/i.test(b.textContent.trim()) && isVisible(b));
      },
      3000,
      'Publish confirmation button'
    );
    confirmBtn.click();
    await sleep(1500);
  } catch {
    // No confirmation dialog — that's fine
  }

  log('Publish done');
  await sleep(1000);
}

async function waitForSubtitleList() {
  // The subtitle list is loaded when "Add language" is visible
  await waitFor(
    () => Array.from(document.querySelectorAll('ytcp-button, button'))
              .find(b => /add language/i.test(b.textContent) && isVisible(b)),
    15000,
    'subtitle list ("Add language" button)'
  ).catch(async () => {
    // Try clicking a back / close button if the editor is still open
    const back = Array.from(document.querySelectorAll('ytcp-button, button, a'))
      .find(b => /back|close|done/i.test(b.getAttribute('aria-label') || '') && isVisible(b));
    if (back) { back.click(); await sleep(2000); }
  });
  await sleep(400);
}

/**
 * Handles the "Title & Description" translation dialog that YouTube Studio
 * shows before the subtitle editor when adding a language.
 * Reads the disabled source fields by their stable IDs and types the text into
 * the matching editable target fields, then clicks Publish.
 */
async function maybeHandleTitleDescriptionDialog() {
  // The metadata editor custom element name is in the selector below.
  const editor = await waitFor(
    () => document.querySelector('ytgn-metadata-editor'),
    2000,
    'metadata editor element'
  ).catch(() => null);

  if (!editor) return;
  log('Title/description dialog detected');

  const srcTitle = editor.querySelector('#original-title   textarea');
  const tgtTitle = editor.querySelector('#translated-title textarea');
  const srcDesc  = editor.querySelector('#original-description   textarea');
  const tgtDesc  = editor.querySelector('#translated-description textarea');

  if (!tgtTitle) { log('Target title field not found — skipping'); return; }

  // Give Polymer a moment to populate the disabled source fields via data binding.
  await sleep(400);

  const titleText = srcTitle?.value?.trim() ?? '';
  const descText  = srcDesc?.value?.trim()  ?? '';
  log(`Copying — title: "${titleText.slice(0, 60)}", desc: ${descText.length} chars`);

  // Set value on both the ytcp-form-textarea Polymer component (triggers its
  // internal observer) AND the raw textarea (triggers native validation).
  const tgtTitleComponent = editor.querySelector('#translated-title');
  const tgtDescComponent  = editor.querySelector('#translated-description');

  if (titleText) {
    setPolymerValue(tgtTitleComponent, titleText);
    await typeIntoField(tgtTitle, titleText);
  }
  if (descText && tgtDesc) {
    setPolymerValue(tgtDescComponent, descText);
    await typeIntoField(tgtDesc, descText);
  }

  await sleep(300);

  // Wait for Publish to become enabled once the required title is filled.
  const publishBtn = await waitFor(
    () => {
      const btn = Array.from(document.querySelectorAll('ytcp-button, button'))
        .find(b => /^publish$/i.test(b.textContent.trim()) && isVisible(b));
      if (!btn) return null;
      if (btn.tagName.toLowerCase() === 'button' && btn.disabled) return null;
      if (btn.getAttribute('aria-disabled') === 'true') return null;
      return btn;
    },
    8000,
    'enabled Publish button in title/description dialog'
  );
  publishBtn.click();
  log('Title/description published');
  await sleep(1500);
}

/**
 * Sets `value` on a Polymer component element, triggering its internal
 * property observer so the parent form re-validates and enables Publish.
 */
function setPolymerValue(component, value) {
  if (!component) return;
  try {
    component.value = value;
    component.dispatchEvent(new CustomEvent('value-changed', { bubbles: true, detail: { value } }));
  } catch { /* ignore */ }
}

/**
 * Types text into a textarea using execCommand so Polymer change detection
 * fires exactly as if the user typed — enables the Publish button.
 */
async function typeIntoField(el, text) {
  el.focus();
  el.select?.();
  el.setSelectionRange?.(0, el.value?.length ?? 0);
  // execCommand('insertText') triggers Polymer's input listeners reliably.
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  el.blur();
}

async function maybeSelectTranslateFromChannelLang(channelLangLabel) {
  // If a "Translate from" / source language dialog appears, pick the channel language
  const dialog = await waitFor(
    () => Array.from(document.querySelectorAll(
            'tp-yt-paper-dialog, ytcp-dialog, [role="dialog"]'))
          .find(d => /translate from|source language/i.test(d.textContent) && isVisible(d)),
    3000,
    '"Translate from" dialog'
  ).catch(() => null);

  if (!dialog) return;

  const langOption = Array.from(dialog.querySelectorAll('tp-yt-paper-item, li'))
    .find(i => i.textContent.trim() === channelLangLabel && isVisible(i));
  if (langOption) {
    langOption.click();
    await sleep(400);
  }

  const okBtn = Array.from(dialog.querySelectorAll('ytcp-button, button'))
    .find(b => /ok|confirm|translate/i.test(b.textContent) && isVisible(b));
  if (okBtn) {
    okBtn.click();
    await sleep(1000);
  }
}

async function waitForTranslation() {
  // Wait for any loading spinner to disappear
  await sleep(2000);
  try {
    await waitForCondition(
      () => !document.querySelector(
        'ytcp-spinner:not([hidden]), [class*="spinner"]:not([hidden]), [class*="loading"]:not([hidden])'
      ),
      20000
    );
  } catch {
    // Spinner may not be present; continue
  }
  await sleep(1000);
}

// ── All-videos helpers ────────────────────────────────────────────────────────

/**
 * Collects all video entries from the channel content page by paginating
 * through every page of results.  Returns { success, videos, total }.
 */
async function getAllVideos() {
  if (!/studio\.youtube\.com\/channel\/[^/]+(?:\/videos|\/shorts)/.test(location.href)) {
    return {
      success: false,
      message: 'Please navigate to the Channel content page (Videos tab) first.',
    };
  }

  const allVideos = [];
  let total = null;

  while (true) {
    const { videos, total: pageTotal } = getVideoList();
    if (total === null && pageTotal !== null) total = pageTotal;
    allVideos.push(...videos);

    const prevFirstId = videos[0]?.videoId ?? null;
    const { hasNextPage } = clickNextPage();
    if (!hasNextPage) break;

    await waitForNextPageLoad(prevFirstId);
    await sleep(300); // brief pause for stability
  }

  return { success: true, videos: allVideos, total: total ?? allVideos.length };
}

/** Reads the video rows on the current page. */
function getVideoList() {
  // Detect content type from the current tab URL so the cache key is scoped
  // per type — Shorts and Videos can share titles and must not cross-skip.
  const type = /\/shorts/.test(location.href) ? 'short'
             : /\/live/.test(location.href)   ? 'live'
             : 'video';

  const rows = Array.from(document.querySelectorAll('ytcp-video-row'));
  const videos = rows.map(row => {
    const link = row.querySelector('a#video-title');
    if (!link) return null;
    const href = link.getAttribute('href'); // e.g. /video/H1KlS4MMISo/edit
    const m = href && href.match(/\/video\/([^/]+)\//);
    const videoId = m ? m[1] : null;
    const title = link.getAttribute('aria-label') || link.textContent.trim();
    return videoId ? { videoId, url: `https://studio.youtube.com${href}`, title, type } : null;
  }).filter(Boolean);

  const pageDesc = document.querySelector('span.page-description');
  let total = null;
  if (pageDesc) {
    const m = pageDesc.textContent.match(/of (?:about )?(\d+)/);
    if (m) total = parseInt(m[1], 10);
  }

  return { videos, total };
}

/** Clicks the "Next page" button. Returns whether there was a next page. */
function clickNextPage() {
  const btn = document.querySelector('ytcp-icon-button#navigate-after');
  if (!btn || btn.getAttribute('aria-disabled') === 'true') return { hasNextPage: false };
  btn.click();
  return { hasNextPage: true };
}

/**
 * Polls until the first video row on the page has a different ID than
 * `prevFirstVideoId`, indicating the new page content has rendered.
 */
function waitForNextPageLoad(prevFirstVideoId, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const links = document.querySelectorAll('ytcp-video-row a#video-title');
      if (links.length > 0) {
        const href = links[0].getAttribute('href');
        const m = href && href.match(/\/video\/([^/]+)\//);
        const firstId = m ? m[1] : null;
        if (firstId && firstId !== prevFirstVideoId) { resolve(); return; }
      }
      if (Date.now() > deadline) { reject(new Error('Timed out waiting for next page')); return; }
      setTimeout(check, 300);
    };
    setTimeout(check, 400); // initial delay before first check
  });
}

/** Returns true if a subtitle row for langLabel already exists on the subtitles page. */
function hasLanguageAlready(langLabel) {
  return Array.from(document.querySelectorAll(
    'tr, ytcp-subtitle-row, [class*="subtitle-row"], [class*="caption-row"]'
  )).some(r => r.textContent.includes(langLabel) && isVisible(r));
}

// ── DOM utilities ─────────────────────────────────────────────────────────────

function findAnchorByText(text) {
  return Array.from(document.querySelectorAll('a'))
    .find(a => a.textContent.trim() === text && isVisible(a)) || null;
}

/**
 * Hovers `row` and returns whichever button newly appears as a result.
 * Avoids coordinate fragility by snapshotting visible buttons before hovering
 * and reporting the first one that wasn't there before.
 * Sweeps across the full width of the row so the exact column position
 * doesn't matter.
 */
function hoverForAddBtn(row, timeoutMs = 8000) {
  return new Promise(resolve => {
    // Snapshot every button that is already visible on the page.
    const before = new Set(
      Array.from(document.querySelectorAll(
        'ytcp-button, button, ytcp-icon-button, [role="button"]'
      )).filter(b => isVisible(b))
    );

    const findNew = () =>
      Array.from(document.querySelectorAll(
        'ytcp-button, button, ytcp-icon-button, [role="button"]'
      )).find(b => isVisible(b) && !before.has(b)) ?? null;

    let intervalId;
    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timerId);
      observer.disconnect();
    };

    const observer = new MutationObserver(() => {
      const btn = findNew();
      if (btn) { cleanup(); resolve(btn); }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
    });

    intervalId = setInterval(() => {
      row.scrollIntoView({ behavior: 'instant', block: 'center' });
      const rect = row.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      // Sweep across the row at multiple x positions — action buttons can be
      // anywhere in the row depending on column layout.
      for (const frac of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const x = rect.left + rect.width * frac;
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        let node = hit;
        while (node) {
          dispatchHoverEvents(node, x, y);
          if (node === row) break;
          node = node.parentElement;
        }
      }
    }, 200);

    const timerId = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
  });
}

/**
 * Repeatedly fires hover events at the exact pixel coordinates:
 *   x = horizontal centre of the letter "b" in the "Subtitles" column header
 *   y = vertical centre of `row`
 * Uses document.elementFromPoint() to resolve the real hit-target at those
 * coords, then fires events on it and every ancestor up to the row.
 * A MutationObserver catches the "Duplicate and edit" button the instant it
 * is injected into the DOM.  Returns null if nothing appears within timeoutMs.
 */
function hoverForDupEditBtn(row, timeoutMs = 8000) {
  return new Promise(resolve => {
    const existing = findDupEditBtnInDoc();
    if (existing) { resolve(existing); return; }

    let intervalId;
    const cleanup = () => {
      clearInterval(intervalId);
      clearTimeout(timerId);
      observer.disconnect();
    };

    const observer = new MutationObserver(() => {
      const btn = findDupEditBtnInDoc();
      if (btn) { cleanup(); resolve(btn); }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'],
    });

    intervalId = setInterval(() => {
      // Scroll row into view and compute the target coordinate.
      row.scrollIntoView({ behavior: 'instant', block: 'center' });
      const coords = getSubtitlesBCoords(row);
      if (!coords) return;
      const { x, y } = coords;

      // Resolve the actual element the browser would hit at (x, y).
      const hit = document.elementFromPoint(x, y);
      if (!hit) return;

      // Fire events up the ancestor chain from the hit element to the row.
      let node = hit;
      while (node) {
        dispatchHoverEvents(node, x, y);
        if (node === row) break;
        node = node.parentElement;
      }
    }, 200);

    const timerId = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
  });
}


function getSubtitlesBCoords(row) {
  const rowRect = row.getBoundingClientRect();
  const y = rowRect.top + rowRect.height / 2;

  const header = Array.from(document.querySelectorAll(
    'th, thead td, [class*="header-cell"], [class*="col-header"], [class*="column-header"], [class*="header"] span'
  )).find(h => /^subtitles$/i.test(h.textContent.trim()));

  if (!header) return { x: rowRect.left + rowRect.width / 2, y };

  const x = getCharCentreX(header, 'b') ?? (header.getBoundingClientRect().left + 20);
  return { x, y };
}

/**
 * Walks text nodes inside `el`, finds the first occurrence of `char`,
 * and returns its horizontal centre using a Range + getBoundingClientRect.
 */
function getCharCentreX(el, char) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    const idx = node.textContent.toLowerCase().indexOf(char.toLowerCase());
    if (idx === -1) continue;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0) return rect.left + rect.width / 2;
  }
  return null;
}

/** Looks for a visible "Duplicate and edit" / pen button anywhere in the document. */
function findDupEditBtnInDoc() {
  return Array.from(
    document.querySelectorAll('ytcp-button, button, ytcp-icon-button, [role="button"]')
  ).find(b => isVisible(b) && isDupEditBtn(b)) ?? null;
}

function isDupEditBtn(b) {
  const text = [
    b.getAttribute('aria-label'),
    b.getAttribute('title'),
    b.getAttribute('data-tooltip'),
    b.textContent,
  ].filter(Boolean).join(' ').toLowerCase();
  return text.includes('duplicate') || text.includes('edit');
}

/**
 * Dispatches a full set of pointer + mouse hover events at (x, y).
 * Falls back to element centre when coordinates are omitted.
 */
/**
 * Dispatches a full mousedown → mouseup → click sequence on `el`.
 * Required for Polymer/Lit components that ignore the native .click() method.
 */
function dispatchRealClick(el) {
  const r = el.getBoundingClientRect();
  const x = r.left + r.width  / 2;
  const y = r.top  + r.height / 2;
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new MouseEvent('mouseup',   init));
  el.dispatchEvent(new MouseEvent('click',     init));
}

function dispatchHoverEvents(el, x, y) {
  if (x === undefined) {
    const r = el.getBoundingClientRect();
    x = r.left + r.width  / 2;
    y = r.top  + r.height / 2;
  }
  const init = {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y, screenX: x, screenY: y,
    view: window,
  };
  for (const type of ['pointermove', 'pointerover', 'pointerenter', 'mousemove', 'mouseover', 'mouseenter']) {
    try {
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(
        type, { ...init, bubbles: !type.endsWith('enter') }
      ));
    } catch { /* ignore */ }
  }
}

/**
 * Walks from `el` up the DOM tree and removes any CSS that hides the element
 * (display:none, visibility:hidden, opacity:0, pointer-events:none).
 * Stops at the nearest row-like ancestor so we don't accidentally unhide
 * unrelated parts of the page.
 */
function forceVisible(el) {
  const rowSelectors = ['tr', 'ytcp-subtitle-row', '[class*="subtitle-row"]', '[class*="caption-row"]'];
  let node = el;
  while (node && node !== document.body) {
    const s = getComputedStyle(node);
    if (s.display === 'none')           node.style.setProperty('display', 'block', 'important');
    if (s.visibility === 'hidden')      node.style.setProperty('visibility', 'visible', 'important');
    if (parseFloat(s.opacity) < 0.1)   node.style.setProperty('opacity', '1', 'important');
    if (s.pointerEvents === 'none')     node.style.setProperty('pointer-events', 'auto', 'important');
    // Stop once we've reached the row container
    if (node !== el && rowSelectors.some(sel => node.matches(sel))) break;
    node = node.parentElement;
  }
}


function isVisible(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0'
      && el.offsetParent !== null;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

// ── Core async helpers ────────────────────────────────────────────────────────

/**
 * Polls via MutationObserver until `getter()` returns a truthy value.
 * Rejects after `timeoutMs` with a descriptive message.
 */
function waitFor(getter, timeoutMs = 10000, description = 'element') {
  return new Promise((resolve, reject) => {
    const found = getter();
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const el = getter();
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}`));
    }, timeoutMs);
  });
}

/** Polls `predicate` every 300 ms until it returns true. */
function waitForCondition(predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (predicate()) return resolve();
    const id = setInterval(() => {
      if (predicate()) { clearInterval(id); clearTimeout(timer); resolve(); }
    }, 300);
    const timer = setTimeout(() => { clearInterval(id); reject(new Error('Condition timed out')); }, timeoutMs);
  });
}

/** Convenience: wait for a CSS selector to appear in the DOM. */
function waitForElement(selector, timeoutMs = 10000) {
  return waitFor(() => document.querySelector(selector), timeoutMs, selector);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

} // end init()