'use strict';

const log = (...args) => console.log('[YouTubeBuddy BG]', ...args);

// In-memory stop flag — valid for the lifetime of this service worker activation.
let stopRequested = false;

// ── Extension lifecycle ───────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') log('Installed.');
});

// ── Message listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START_ALL_VIDEOS') {
    stopRequested = false;
    runBatch(message.payload)
      .catch(err => sendProgressToPopup({ type: 'ALL_DONE', success: false, message: err.message }));
    sendResponse({ started: true });
    return false;
  }
  if (message.action === 'STOP_ALL_VIDEOS') {
    stopRequested = true;
    sendResponse({ ok: true });
    return false;
  }
});

// ── Batch orchestrator ────────────────────────────────────────────────────────
async function runBatch({ tabId, langCode, langLabel, channelPageUrl }) {
  log('Batch started', { langLabel });

  // Phase 1: Collect all video URLs across all pages (content script paginates).
  sendProgressToPopup({ type: 'COLLECTING' });

  await injectContentScript(tabId);
  const listResult = await sendMessageToTab(tabId, { action: 'GET_ALL_VIDEOS' });

  if (!listResult?.success) {
    sendProgressToPopup({
      type: 'ALL_DONE',
      success: false,
      message: listResult?.message || 'Failed to collect video list.',
    });
    return;
  }

  const { videos, total } = listResult;
  log(`Collected ${videos.length} videos`);

  if (videos.length === 0) {
    sendProgressToPopup({ type: 'ALL_DONE', success: true, message: 'No videos found on this channel.' });
    return;
  }

  // Phase 2: Process each video one by one.
  let processed = 0;
  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const video of videos) {
    if (stopRequested) {
      sendProgressToPopup({ type: 'STOPPED', processed, total: videos.length, succeeded, skipped, failed });
      return;
    }

    sendProgressToPopup({
      type: 'PROGRESS',
      processed,
      total: videos.length,
      currentTitle: video.title,
      succeeded, skipped, failed,
    });

    try {
      await navigateTab(tabId, video.url);
      await sleep(1500); // let the page settle before injecting

      await injectContentScript(tabId);
      const result = await sendMessageToTab(tabId, {
        action: 'ADD_SUBTITLE_LANGUAGE',
        payload: { langCode, langLabel, applyTo: 'current', silent: true },
      });

      processed++;
      if (result?.skipped)       skipped++;
      else if (result?.success)  succeeded++;
      else {
        failed++;
        log(`Failed: ${video.title} — ${result?.message}`);
      }
    } catch (err) {
      processed++;
      failed++;
      log(`Error on "${video.title}": ${err.message}`);
    }
  }

  // Navigate back to channel page when done.
  if (channelPageUrl) {
    chrome.tabs.update(tabId, { url: channelPageUrl }).catch(() => {});
  }

  sendProgressToPopup({
    type: 'ALL_DONE',
    success: true,
    processed, succeeded, skipped, failed,
    message: `Done! ${succeeded} added, ${skipped} already had it, ${failed} failed.`,
  });
}

// ── Tab helpers ───────────────────────────────────────────────────────────────

async function navigateTab(tabId, url) {
  // Register the listener BEFORE triggering navigation to avoid race conditions.
  const loadPromise = waitForTabLoad(tabId);
  await chrome.tabs.update(tabId, { url });
  await loadPromise;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const done = () => {
      if (resolved) return;
      resolved = true;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeout);
      resolve();
    };

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') done();
    }
    chrome.tabs.onUpdated.addListener(listener);

    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (!resolved) { resolved = true; reject(new Error('Tab load timeout')); }
    }, 60000);

    // Also handle the case where the tab is already complete.
    chrome.tabs.get(tabId).then(tab => {
      if (tab?.status === 'complete') done();
    }).catch(done);
  });
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
  } catch {
    // Already injected or tab not injectable — proceed.
  }
}

function sendMessageToTab(tabId, message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, message, response => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  });
}

function sendProgressToPopup(data) {
  // Popup may be closed — ignore connection errors.
  chrome.runtime.sendMessage(data).catch(() => {});
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
